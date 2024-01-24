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
import { stdout } from "node:process";

function FATAL(...args: any[]): never {
  console.error("FATAL", ...args);
  process.exit(1);
}

type Message =
  | {
      type: 'debug',
      [key: string]: any,
    }
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
      exitCode: number,
    }
  | {
      type: 'for-body-enter',
      nodeId: string,
      counter: number,
    }
  | {
      type: 'for-body-exit',
      nodeId: string
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

function callStmtStr(message: Message, returnVars: string = "fr_dummy") {
  const messageStr = JSON.stringify(message)
    .replaceAll(new RegExp('"RAW<<<(.*)>>>RAW"', "g"), (_, p1) => p1)
    .replaceAll('"', '\\"');
  return `frmsg_call "${messageStr}" | read -r ${returnVars}`;
}

function RAW(str: string): any {
  return `RAW<<<${str}>>>RAW`;
}

function callStmt(message: Message, returnVars?: string): sh.Stmt {
  return parseStmt(callStmtStr(message, returnVars))
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

async function readPipe(path: string): Promise<Buffer> {
  const handle = await fs.open(path, fs.constants.O_RDONLY);
  const result = await handle.readFile();
  await handle.close();
  return result;
}

type PipeProgress = {
  data: string,
  done: boolean,
}

async function readPipeWithProgress(path: string, onProgress: (progress: PipeProgress) => void): Promise<void> {
  const handle = await fs.open(path, fs.constants.O_RDONLY);
  const buffers: Buffer[] = [];
  const stream = handle.createReadStream()
  stream.on('data', (data: Buffer) => {
    buffers.push(data);
    onProgress({ data: buffers.concat().toString(), done: false });
  });
  stream.on('end', () => {
    onProgress({ data: buffers.concat().toString(), done: true });
    handle.close();
  });
}

export class Run {
  sandbox: Sandbox = undefined as any;  // TODO: don't care
  childProcess: child_process.ChildProcessWithoutNullStreams = undefined as any;  // TODO: don't care
  startTime: Date = undefined as any;  // TODO: don't care
  messageLog: Message[] = [];
  exitCode: number | null = null;
  transformedSrc: string = undefined as any;  // TODO: don't care
  sh2frHandle: fs.FileHandle = undefined as any;  // TODO: don't care
  sh2frSocket: net.Socket = undefined as any;  // TODO: don't care
  stdouts: { [execId: string]: PipeProgress } = {};

  constructor(public scriptSrc: string, public broadcast: (data: string) => void) { }

  async start() {
    console.log("\n\n\nstarting");

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
            const enterStmt = callStmtStr({
              type: "stmt-enter",
              nodeId,
              context: '$(fr_join / ${frctx[@]})',
              pwd: "$PWD"
            }, "fr_stdout");
            // const debugStmt = callStmtStr({type: "debug", data: "$fr_stdout"});
            const exitStmt = callStmtStr({
              type: "stmt-exit",
              nodeId,
              context: '$(fr_join / ${frctx[@]})',
              pwd: "$PWD",
              exitCode: RAW("$fr_ret")
            });
            wrapStmt(parser, stmt, `{ ${enterStmt}; ___ 1>&1 1>$fr_stdout; fr_ret=$?; ${exitStmt}; fr_exitcode $fr_ret; }`);
          }
          if (cmdType === "ForClause") {
            const forClause = cmd as sh.ForClause;
            const forNodeId = getNodeId(forClause);
            const counterVar = `fr_loop_counter_${forNodeId}`;
            wrapStmt(parser, stmt, `{ ${counterVar}=0; ___; }`);
            forClause.Do = [
              parseStmt(`frctx_push "${forNodeId}-$${counterVar}"`),
              callStmt({type: "for-body-enter", nodeId: forNodeId, counter: RAW(`$${counterVar}`)}),
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

    const sh2frPath = tmp.tmpNameSync();
    mkfifo(sh2frPath);

    // console.log("sh2frPath", sh2frPath)

    this.sh2frHandle = await fs.open(sh2frPath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    // PITFALL NOTICE:
    //   createReadStream is inappropriate here. Per https://nodejs.org/dist/latest-v11.x/docs/api/fs.html#fs_fs_createreadstream_path_options,
    //   "fd should be blocking; non-blocking fds should be passed to net.Socket". See also: https://stackoverflow.com/a/52622889/.
    this.sh2frSocket = new net.Socket({ fd: this.sh2frHandle.fd });

    this.childProcess = child_process.spawn(
      'zsh',
      [ tmpFile.name ],
      {
        cwd: path.join(this.sandbox.deltaDir, 'union', process.cwd()),
        env: {
          ...process.env,
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

    const onMessage = (message: Message): string => {
      if (message.type === "stmt-enter") {
        // TODO: use a pipe pool
        const stdoutPath = tmp.tmpNameSync();
        mkfifo(stdoutPath);

        const execId = `${message.context}//${message.nodeId}`;

        readPipeWithProgress(stdoutPath, (progress) => {
          this.stdouts[execId] = progress;
          this._writeHtml();
        });

        return stdoutPath + "\n";
      }
      return "\n";
    }

    this.sh2frSocket.on("data", (data) => {
      const dataString = data.toString();
      // TODO: this might be naive; a message might be split across events?
      const lines = dataString.split("\n");
      for (const line of lines) {
        if (line === "") { continue; }
        try {
          // find first comma and separate
          const firstCommaIndex = line.indexOf(",");
          if (firstCommaIndex === -1) {
            FATAL("node pipe data missing comma", line);
          }
          const returnAddress = line.slice(0, firstCommaIndex);
          const contents = line.slice(firstCommaIndex + 1);
          const dataParsed = JSON.parse(contents);
          this.messageLog.push(dataParsed);
          fs.writeFile(returnAddress, onMessage(dataParsed));
          this._writeHtml();
        } catch (err) {
          FATAL("node error parsing data", err, dataString);
        }
      }
    });

    this.sh2frSocket.on("error", (err) => {
      console.log("sh2fr pipe error", err);
    });

    this.sh2frSocket.on("end", () => {
      console.log("sh2fr pipe end");
    });

  }

  async stop() {
    console.log("stopping");
    if (this.exitCode === null) {
      this.childProcess.kill();
    }
    removeSandbox(this.sandbox);
    await this.sh2frHandle.close();
    this.sh2frSocket.destroy();
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
          <h1>messages</h1>
          <div>started @ {this.startTime.toLocaleTimeString()}</div>
          <div>updated @ {new Date().toLocaleTimeString()}</div>
          <ul>
            {this.messageLog.map((entry, i) =>
              <li key={i}>
                { inspectHtml(entry) }
              </li>
            )}
          </ul>
          {this.exitCode !== null && <div>exit code: {this.exitCode}</div>}
        </div>
      </div>}
      {true && <div>
        <h1>stdouts</h1>
        <ul>
          {Object.entries(this.stdouts).map(([execId, stdout], i) =>
            <li key={i}>
              <div>{execId}</div>
              <pre>{stdout.data}</pre>
              {stdout.done && <div>done!</div>}
            </li>
          )}
        </ul>
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
