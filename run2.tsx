import sh from "mvdan-sh";
import AnsiToHtml from "ansi-to-html";
import { ParseError, expandObject, myWalk, getNodeId, wrapStmt } from "./mvdan-sh-helpers";
import * as child_process from "node:child_process";
import * as util from "node:util";
import * as repl from "node:repl";
import * as tmp from "tmp";
import * as os from "os";
import * as path from "node:path";
import * as net from "node:net";
import * as fs from "node:fs/promises";
import { renderToString } from "react-dom/server";

function FATAL(...args: any[]): never {
  console.error("FATAL", ...args);
  process.exit(1);
}

type Message =
  | {
    type: 'stmt-enter',
    nodeId: string,
    context: string,
    pwd: string,
    }
  | {
    type: 'stmt-exit',
    nodeId: string,
    context: string,
    pwd: string,
    exitCode: string,
    }
  | {
      type: 'for-body-enter',
      nodeId: string,
      counter: string,
    }
  | {
      type: 'for-body-exit',
      nodeId: string
    };

type LogEntry =
  | {
    type: 'stdout',
    data: string,
  }
  | {
    type: 'message',
    data: Message,
  };

type Sandbox = {
  sandboxDir: string,
  sandboxUnionDir: string,
  deltaDir: string,
  deltaLogFile: string,
}

async function makeSandbox(): Promise<Sandbox> {
  const sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-'));
  const sandboxUnionDir = path.join(sandboxDir, 'union');
  const deltaDir = await fs.mkdtemp(path.join(os.tmpdir(), 'delta-'));
  const deltaLogFile = tmp.tmpNameSync();

  child_process.execSync(`fr-sandbox make ${sandboxDir} /`);
  child_process.execSync(`fr-sandbox make ${deltaDir} ${sandboxUnionDir}`);

  return { sandboxDir, sandboxUnionDir, deltaDir, deltaLogFile };
}

function execHandler(error: child_process.ExecException | null, stdout: string, stderr: string) {
  if (error) {
    console.error(`exec error: ${error}`);
    return;
  }
  if (stdout) {
    console.log(`stdout: ${stdout}`);
  }
  if (stderr) {
    console.error(`stderr: ${stderr}`);
  }
};

function removeSandbox(sandbox: Sandbox) {
  child_process.exec(`fr-sandbox remove ${sandbox.deltaDir}`, execHandler);
  child_process.exec(`fr-sandbox remove ${sandbox.sandboxDir}`, execHandler);
}

const ansiToHtml = new AnsiToHtml({});

const parser = sh.syntax.NewParser(sh.syntax.KeepComments(true));
const printer = sh.syntax.NewPrinter();

function parseStmt(s: string): sh.Stmt {
  const stmts = parser.Parse(s).Stmts;
  if (stmts.length !== 1 || !stmts[0]) {
    throw new Error("need one stmt");
  }
  return stmts[0];
}

function callStmtStr(message: Message) {
  const messageStr = JSON.stringify(message).replaceAll('"', '\\"');
  return `frmsg_call "${messageStr}" | read -r fr_stdout fr_stderr`;
}

function callStmt(message: Message): sh.Stmt {
  return parseStmt(callStmtStr(message))
}

function inspectHtml(value: any) {
  return <pre dangerouslySetInnerHTML={{ __html:
    ansiToHtml.toHtml(util.inspect(value, { showHidden: false, depth: null, colors: true }))
  }} />;
}

function mkfifo(path: string): void {
  const mkfifoCommand = `mkfifo ${path}`;
  // console.log("node make pipe", mkfifoCommand);
  child_process.execSync(mkfifoCommand);
}

export class Run {
  sandbox: Sandbox = undefined as any;  // TODO: don't care
  childProcess: child_process.ChildProcessWithoutNullStreams = undefined as any;  // TODO: don't care
  startTime: Date = undefined as any;  // TODO: don't care
  log: LogEntry[] = [];
  exitCode: number | null = null;
  transformedSrc: string = undefined as any;  // TODO: don't care
  fr2shHandle: fs.FileHandle = undefined as any;  // TODO: don't care
  fr2shSocket: net.Socket = undefined as any;  // TODO: don't care

  constructor(public scriptSrc: string, public broadcast: (data: string) => void) { }

  async start() {
    console.log("starting");

    // parse

    let ast: sh.File;
    try {
      ast = parser.Parse(this.scriptSrc);
    } catch (e) {
      console.error("error parsing script", expandObject((e as ParseError).Error()));
      process.exit(1);  // TODO: report problem intelligently
    }

    // transform

    this.sandbox = await makeSandbox();

    myWalk(ast, {
      exit: (node) => {
        const nodeType = sh.syntax.NodeType(node);

        if (nodeType === "Stmt") {
          const stmt = node as sh.Stmt;
          const cmd = stmt.Cmd;
          const cmdType = sh.syntax.NodeType(cmd);
          if (cmdType === "CallExpr") {
            const nodeId = getNodeId(stmt);
            const enterStmt = callStmtStr({type: "stmt-enter", nodeId, context: "$frctx", pwd: "$PWD"});
            const exitStmt = callStmtStr({type: "stmt-exit", nodeId, context: "$frctx", pwd: "$PWD", exitCode: "$frret"});
            wrapStmt(parser, stmt, `{ ${enterStmt}; ___; frret=$?; ${exitStmt}; fr_exitcode $frret; }`);
          }
          if (cmdType === "ForClause") {
            const forClause = cmd as sh.ForClause;
            const forNodeId = getNodeId(forClause);
            const counterVar = `fr_loop_counter_${forNodeId}`;
            wrapStmt(parser, stmt, `{ ${counterVar}=0; ___; }`);
            forClause.Do = [
              parseStmt(`frctx_push "${forNodeId}-$${counterVar}"`),
              callStmt({type: "for-body-enter", nodeId: forNodeId, counter: `$${counterVar}`}),
              ...forClause.Do,
              callStmt({type: "for-body-exit", nodeId: forNodeId}),
              parseStmt(`frctx_pop`),
              parseStmt(`${counterVar}=$(($${counterVar} + 1))`),
            ];
          }
        }
      }
    });

    const frmsgHeaderSrc = await fs.readFile(path.join(__dirname, 'frmsg.sh'), { encoding: 'utf-8' });

    const initSrc = ['frmsg_init', 'frctx_init'].join("\n");
    this.transformedSrc = [frmsgHeaderSrc, initSrc, printer.Print(ast)].join("\n\n");

    await fs.writeFile("transformed.sh", this.transformedSrc, { encoding: 'utf-8' });

    // run

    const tmpFile = tmp.fileSync();
    await fs.writeFile(tmpFile.name, this.transformedSrc, { encoding: 'utf-8' });

    this.startTime = new Date();

    const fr2shPath = tmp.tmpNameSync();
    mkfifo(fr2shPath);

    this.fr2shHandle = await fs.open(fr2shPath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    // PITFALL NOTICE:
    //   createReadStream is inappropriate here. Per https://nodejs.org/dist/latest-v11.x/docs/api/fs.html#fs_fs_createreadstream_path_options,
    //   "fd should be blocking; non-blocking fds should be passed to net.Socket". See also: https://stackoverflow.com/a/52622889/.
    this.fr2shSocket = new net.Socket({ fd: this.fr2shHandle.fd });

    const sh2frPath = tmp.tmpNameSync();
    mkfifo(sh2frPath);

    // TODO: if O_WRONLY, needs to be opened after child process started, so it doesn't block
    const sh2frHandle = await fs.open(sh2frPath, fs.constants.O_RDWR);

    this.childProcess = child_process.spawn(
      'zsh',
      [ tmpFile.name ],
      {
        cwd: path.join(this.sandbox.deltaDir, 'union', process.cwd()),
        env: {
          fr2sh: fr2shPath,
          sh2fr: sh2frPath,
        }
      }
    );

    // collect output

    this.childProcess.stdout.on('data', (data: string) => {
      // console.error("got stdout", data.toString());
    });

    this.childProcess.stderr.on('data', (data: string) => {
      // TODO: not implemented
      console.error("got stderr", data.toString());
    });

    this.childProcess.on('close', (exitCodeIn: number) => {
      console.log("child process exited with code", exitCodeIn);
      this.exitCode = exitCodeIn;
      this._writeHtml();
      this.stop();
    });

    this.fr2shSocket.on("data", (data) => {
      const dataString = data.toString();
      if (dataString.indexOf("\n") !== dataString.length - 1) {
        FATAL("node pipe data not a single line", dataString);
      }
      console.log("pipe data", dataString);
      try {
        const dataParsed = JSON.parse(dataString);
        const response = `${dataParsed.i + 1}`;
        console.log("node writing response", response);
        this.log.push(dataParsed);
        sh2frHandle.write(response + "\n");
      } catch (err) {
        FATAL("node error parsing data", err);
      }
    });

    this.fr2shSocket.on("error", (err) => {
      console.log("pipe error", err);
    });

    this.fr2shSocket.on("end", () => {
      console.log("pipe end");
    });

  }

  async stop() {
    console.log("stopping");
    if (this.exitCode === null) {
      this.childProcess.kill();
    }
    removeSandbox(this.sandbox);
    await this.fr2shHandle.close();
    this.fr2shSocket.destroy();
  }

  _writeHtml() {
    const outputPerLine: { [line: number]: string } = {};
    // let currentLine = null;
    // for (const { type, data } of this.log) {
    //   if (type === 'message') {
    //     const message = data as Message;
    //     if (message.type === 'stmt-enter') {
    //       currentLine = message.stmtLine;
    //     } else if (message.type === 'stmt-exit') {
    //       currentLine = null;
    //     }
    //   } else if (type === 'stdout') {
    //     if (currentLine === null) {
    //       console.error("got stdout without a current line", data);
    //     } else {
    //       outputPerLine[currentLine] = (outputPerLine[currentLine] || '') + data;
    //     }
    //   }
    // }

    const jsx = <>
      {/* <script dangerouslySetInnerHTML={{
        __html: live
      }} /> */}
      <style>{`
        body {
          background-color: #333;
          color: white;
          margin: 0px;
        }

        .output-stderr {
          color: red;
        }
        pre {
          white-space: pre-wrap;
        }

        .row {
          display: flex;
          flex-direction: row;
        }

        .row > * {
          flex-grow: 1;
          flex-basis: 0;
        }

        .code-line {
          display: flex;
          flex-direction: row;
          font-size: 16px;
          margin-top: 0px;
        }

        .code-linenum {
          color: #999;
          margin-right: 20px;
          text-align: right;
          min-width: 30px;
          font-family: monospace;
        }

        .code-linecode {
          flex-grow: 1;
          flex-basis: 0;
          white-space: pre;
          font-family: monospace;
        }

        .code-stdout {
          color: #999;
        }

        .code-command {
          margin-bottom: 0px;
        }
      `}</style>

      {true && <div>
        <h1>script</h1>
        <pre>{this.scriptSrc}</pre>
      </div>}
      {true && <div>
        <div>
          <h1>transformed</h1>
          {/* prepend each line with a line number */}
          <pre>{this.transformedSrc.split('\n').map((line, i) => `${String(i + 1).padStart(3)} ${line}`).join('\n')}</pre>
        </div>
      </div>}
      {true && <div>
        <h1>ast</h1>
        <details open={false}>
          {inspectHtml(expandObject(
            parser.Parse(this.scriptSrc)
          ))}
        </details>
      </div>}
      {true && <div className="row">
        <div>
          <h1>log</h1>
          <div>started @ {this.startTime.toLocaleTimeString()}</div>
          <div>updated @ {new Date().toLocaleTimeString()}</div>
          <ul>
            {this.log.map((entry, i) =>
              <li key={i}>
                { inspectHtml(entry) }
              </li>
            )}
          </ul>
          {this.exitCode !== null && <div>exit code: {this.exitCode}</div>}
        </div>
      </div>}

      <div className="row" style={{marginTop: 1000}}></div>

      <div>
        {this.scriptSrc.split('\n').map((line, i) => {
          const lineIndent = line.match(/^\s*/)?.[0] || '';
          return <div key={i} className="code-line">
            <div className="code-linenum">{i + 1}</div>
            <div className="code-linecode">
              <div className="code-command">{line}</div>
              { outputPerLine[i + 1] &&
                <div className="row">
                  <div>{lineIndent}</div>
                  <div className="code-stdout" dangerouslySetInnerHTML={{__html: ansiToHtml.toHtml(outputPerLine[i + 1])}}/>
                </div>
              }
            </div>
          </div>;
        })}
      </div>
    </>;

    const html = renderToString(jsx);

    this.broadcast(html);
  }
}
