import sh from "mvdan-sh";
import AnsiToHtml from "ansi-to-html";
import { ParseError, expandObject, myWalk, getNodeId, wrapStmt } from "./mvdan-sh-helpers";
import * as child_process from "node:child_process";
import * as util from "node:util";
import * as tmp from "tmp";
import * as os from "os";
import * as path from "node:path";
import * as net from "node:net";
import * as fs from "node:fs/promises";
import * as fsOld from "node:fs";
import { renderToString } from "react-dom/server";
import React, { Fragment } from "react";

const styleCss = fsOld.readFileSync(path.join(__dirname, 'style.css'), { encoding: 'utf-8' });

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

const rangeIncl = (start: number, stop: number, step = 1) =>
  Array.from({ length: (stop - start) / step + 1}, (_, i) => start + (i * step));

type Decoration = {
  start: number,
  end: number,
  decorator: (contents: React.ReactNode) => React.ReactNode,
}
function addDecorationsToLine(line: string, decorations: Decoration[]): React.ReactNode {
  // apply smaller decorations first
  decorations.sort((a, b) => (a.end - a.start) - (b.end - a.start));

  let nodes: React.ReactNode[] = Array.from(line);
  let starts: number[] = rangeIncl(0, line.length - 1);
  let ends: number[] = rangeIncl(1, line.length);
  for (const decoration of decorations) {
    // find a node with start = decoration.start
    const i = starts.indexOf(decoration.start);
    if (i === -1) {
      throw new Error("decoration starts in the middle of a node");
    }

    // find a node with end = decoration.end
    const j = ends.indexOf(decoration.end);
    if (j === -1) {
      throw new Error("decoration ends in the middle of a node");
    }

    // replace range of nodes with decorated version
    nodes.splice(i, j - i + 1, decoration.decorator(nodes.slice(i, j + 1)));

    // update starts and ends
    starts.splice(i + 1, j - i);
    ends.splice(i, j - i);
  }
  return nodes;
}

// example use / test:

// {addDecorationsToLine("hello world", [
//   {
//     start: 0,
//     end: 5,
//     decorator: (contents) => <span style={{color: "red"}}>{contents}</span>
//   },
//   {
//     start: 6,
//     end: 11,
//     decorator: (contents) => <span style={{textDecoration: "underline"}}>{contents}</span>
//   },
//   {
//     start: 7,
//     end: 8,
//     decorator: (contents) => <span style={{fontSize: '200%'}}>{contents}</span>
//   }
// ])}

export class Run {
  sandbox: Sandbox = undefined as any;  // TODO: don't care
  childProcess: child_process.ChildProcessWithoutNullStreams = undefined as any;  // TODO: don't care
  startTime: Date = undefined as any;  // TODO: don't care
  messageLog: Message[] = [];
  exitCode: number | null = null;
  transformedSrc: string = undefined as any;  // TODO: don't care
  sh2frHandle: fs.FileHandle = undefined as any;  // TODO: don't care
  sh2frSocket: net.Socket = undefined as any;  // TODO: don't care
  execOutputs: { [execId: string]: { stdout: PipeProgress, stderr: PipeProgress } } = {};

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
            }, "fr_stdout fr_stderr");
            // const debugStmt = callStmtStr({type: "debug", data: "$fr_stdout"});
            const exitStmt = callStmtStr({
              type: "stmt-exit",
              nodeId,
              context: '$(fr_join / ${frctx[@]})',
              pwd: "$PWD",
              exitCode: RAW("$fr_ret")
            });
            wrapStmt(parser, stmt, `{ ${enterStmt}; ___ 1>&1 1>$fr_stdout 2>&2 2>$fr_stderr; fr_ret=$?; ${exitStmt}; fr_exitcode $fr_ret; }`);
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
      console.error("childProcess stdout", data.toString());
    });

    this.childProcess.stderr.on('data', (data: string) => {
      console.error("childProcess stderr", data.toString());
    });

    this.childProcess.on('close', (exitCodeIn: number) => {
      console.log("child process exited with code", exitCodeIn);
      this.exitCode = exitCodeIn;
      this._scheduleWriteHtml();
      this.stop();
    });

    const onMessage = (message: Message): string => {
      if (message.type === "stmt-enter") {
        // TODO: use a pipe pool
        const stdoutPath = tmp.tmpNameSync();
        mkfifo(stdoutPath);

        const stderrPath = tmp.tmpNameSync();
        mkfifo(stderrPath);

        const execId = `${message.context}//${message.nodeId}`;
        const execOutput = this.execOutputs[execId] = {
          stdout: { data: "", done: false } as PipeProgress,
          stderr: { data: "", done: false } as PipeProgress,
        };

        readPipeWithProgress(stdoutPath, (progress) => {
          execOutput.stdout = progress;
          this._scheduleWriteHtml();
        });

        readPipeWithProgress(stderrPath, (progress) => {
          execOutput.stderr = progress;
          this._scheduleWriteHtml();
        });

        return `${stdoutPath} ${stderrPath}\n`;
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
          this._scheduleWriteHtml();
          // console.log("node pipe data", dataParsed)
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

    this._scheduleWriteHtml();
  }

  async stop() {
    console.log("stopping");
    if (this.exitCode === null) {
      this.childProcess.kill();
    }
    removeSandbox(this.sandbox);
    await this.sh2frHandle.close();
    this.sh2frSocket.destroy();
    // dump();
  }

  _writeHtmlScheduled = false;
  _scheduleWriteHtml() {
    if (this._writeHtmlScheduled) { return; }
    setImmediate(() => {
      this._writeHtmlScheduled = false;
      this._writeHtml()
    });
    this._writeHtmlScheduled = true;
  }

  _writeHtml() {
    const partMain = <div>
      {this.scriptSrc.split('\n').map((line, i) => {
        const lineIndent = line.match(/^\s*/)?.[0] || '';
        return <div key={i} className="code-line">
          <div className="code-linenum">{i + 1}</div>
          <div className="code-linecode">
            <div className="code-command">{line}</div>
            {/* { outputPerLine[i + 1] &&
              <div className="row">
                <div>{lineIndent}</div>
                <div className="code-stdout" dangerouslySetInnerHTML={{__html: ansiToHtml.toHtml(outputPerLine[i + 1])}}/>
              </div>
            } */}
          </div>
        </div>;
      })}
    </div>;


    const partTransformed = <div>
      <div>
        <h1>transformed</h1>
        {/* prepend each line with a line number */}
        <pre>{this.transformedSrc.split('\n').map((line, i) => `${String(i + 1).padStart(3)} ${line}`).join('\n')}</pre>
      </div>
    </div>;

    const partAST = <div>
      <h1>ast</h1>
      <details open={false}>
        {inspectHtml(expandObject(
          parser.Parse(this.scriptSrc)
        ))}
      </details>
    </div>;

    const partMessages = <div className="row">
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
    </div>;

    const partExecOutput = <div>
      <h1>exec output</h1>
      <dl>
        {Object.entries(this.execOutputs).map(([execId, { stdout, stderr }]) =>
          <Fragment key={execId}>
            <dt>{execId}</dt>
            <dd>
              <div><b>stdout</b> {stdout.done && <small>✓</small>}</div>
              <pre>{stdout.data}</pre>
              <div><b>stderr</b> {stderr.done && <small>✓</small>}</div>
              <pre>{stderr.data}</pre>
            </dd>
          </Fragment>
        )}
      </dl>
    </div>;

    const jsx = <>
      {/* <script dangerouslySetInnerHTML={{
        __html: live
      }} /> */}
      <style>{styleCss}</style>

      {true && partMain}

      <div className="row" style={{marginTop: 1000}}></div>

      {true && partTransformed}
      {true && partAST}
      {true && partMessages}
      {true && partExecOutput}
    </>;

    const html = renderToString(jsx);

    this.broadcast(html);
  }
}
