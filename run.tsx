// must come first
import { dump } from "wtfnode";
(global as any).dump = dump;

import sh, { syntax } from "mvdan-sh";
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
import express from "express";
import { Server } from "node:http";
import { DiffAddedIcon, DiffModifiedIcon, DiffRemovedIcon, DiffIgnoredIcon, FileSubmoduleIcon, ChevronRightIcon, SignOutIcon } from '@primer/octicons-react'
import { OnlyRunLatestJob } from "./job-stuff";

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
      cwd: string,
    }
  | {
      type: 'stmt-exit',
      nodeId: string,
      context: string,
      cwd: string,
      exitCode: number,
    }
  | {
      type: 'for-body-enter',
      nodeId: string,
      context: string,
      counter: number,
      loopVarValue: string,
    }
  | {
      type: 'for-body-exit',
      nodeId: string,
      context: string,
    };

type Sandbox = {
  sandboxDir: string,
  sandboxUnionDir: string,
  deltaDir: string,
  deltaUnionDir: string,
}

async function makeSandbox(): Promise<Sandbox> {
  const sandboxDirUnreal = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-'));
  const sandboxDir = await fs.realpath(sandboxDirUnreal);
  const sandboxUnionDir = path.join(sandboxDir, 'union');
  const deltaDirUnreal = await fs.mkdtemp(path.join(os.tmpdir(), 'delta-'));
  const deltaDir = await fs.realpath(deltaDirUnreal);
  const deltaUnionDir = path.join(deltaDir, 'union');

  child_process.execSync(`fr-sandbox make ${sandboxDir} /`);
  child_process.execSync(`fr-sandbox make ${deltaDir} ${sandboxUnionDir}`);

  return { sandboxDir, sandboxUnionDir, deltaDir, deltaUnionDir };
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
    .replaceAll(new RegExp(`"${RAW("(.*?)")}"`, "g"), (_, p1) => p1)
    .replaceAll('"', '\\"');
  return `frmsg_call "${messageStr}" | read -r ${returnVars}`;
}

function RAW(str: string): any {
  return `RAW<<<${str}>>>RAW`;
}

function callStmt(message: Message, returnVars?: string): sh.Stmt {
  return parseStmt(callStmtStr(message, returnVars))
}

function uploadCmdStr(uploadId: string) {
  return `curl -s -X POST -T - http://localhost:1234/upload/${uploadId}`;
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
  console.log("fr: readPipeWithProgress is opening", path)
  const handle = await fs.open(path, fs.constants.O_RDONLY);
  console.log("fr: readPipeWithProgress opened", path)
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

async function readWholeStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = [];
    stream.on('data', (data: Buffer) => {
      buffers.push(data);
    });
    stream.on('end', () => {
      resolve(Buffer.concat(buffers));
    });
    stream.on('error', (err) => {
      reject(err);
    });
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

function mkExecId(context: string, nodeId: string): string {
  return `${context}/${nodeId}`;
}

type DeltaLogEntry = {
  path: string,
  event: string,
}

type ExecInfo = {
  stdout: PipeProgress,
  stderr: PipeProgress,
  enterCwd: string,
  exitInfo: {
    exitCode: number,
    cwd: string,
    deltaLog: DeltaLogEntry[],
  } | null,
}

type Iteration = {
  counter: number,
  loopVarValue: string,
}

type ForInfo = {
  iterations: Iteration[],
}

function parseDeltaLog(log: string): DeltaLogEntry[] {
  const lines = log.split("\n");
  lines.pop();  // last line is empty
  return lines.map((line) => {
    // pattern is "path (event)"
    const match = line.match(/^(.*) \((.*)\)$/);
    if (!match) {
      throw new Error(`invalid delta log line: ${line}`);
    }
    const [, path, event] = match;
    return { path: '/' + path, event };
  });
}

function stringifyDeltaLog(log: DeltaLogEntry[], baseDir?: string): string {
  return log.map(({path: somePath, event}) => {
    if (baseDir) {
      somePath = path.relative(baseDir, somePath);
    }
    return `${somePath} (${event})`;
  }).join("\n");
}

const eventIcons: Record<string, React.ReactNode> = {
  'deleted': <DiffRemovedIcon />,
  'new dir': <DiffAddedIcon />,
  'modified': <DiffModifiedIcon />,
  'dir replaced with file': <DiffModifiedIcon />,
  'new file': <DiffAddedIcon />,
}

function renderDeltaLog(log: DeltaLogEntry[], baseDir?: string): React.ReactNode {
  return <div className="delta-log">
    {log.map(({path: somePath, event}) => {
      if (baseDir) {
        somePath = path.relative(baseDir, somePath);
      }
      return <div key={somePath} className="delta-log-entry">
        <div className="delta-log-entry-icon">
          {eventIcons[event] || <DiffIgnoredIcon/>}
        </div>
        <div className="delta-log-entry-path">{somePath}</div>
        <div className="delta-log-entry-event">({event})</div>
      </div>
    })}
  </div>
}

function pathInSandbox(path: string, sandbox: Sandbox): string {
  if (!path.startsWith(sandbox.deltaUnionDir)) {
    throw new Error(`path ${path} is not in sandbox`);
  }
  return path.slice(sandbox.deltaUnionDir.length);
}

type LineTreeNode =
  // note: lineNumEnd is exclusive, not inclusive
  { lineNumStart: number, lineNumEnd: number } & (
    | { type: 'line', line: string }
    | { type: 'loop-body', forClause: sh.ForClause, children: LineTreeNode[] }
  )

function lineTreeNodesFromAst(ast: sh.File, lines: string[]): LineTreeNode[] {
  const result: LineTreeNode[] = [];
  let stack: LineTreeNode[][] = [result];
  myWalk(ast, {
    enter: (node) => {
      const nodeType = sh.syntax.NodeType(node);
      if (nodeType === "ForClause") {
        const forClause = node as sh.ForClause;
        const lineTreeNode = {
          type: 'loop-body',
          forClause,
          children: [],
          lineNumStart: forClause.DoPos.Line() + 1,
          lineNumEnd: forClause.DonePos.Line(),
        } satisfies LineTreeNode;
        stack[stack.length - 1].push(lineTreeNode);
        stack.push(lineTreeNode.children);
        return () => {
          stack.pop();
        }
      }
    }
  });
  addLinesToNodes(result, 1, lines.length + 1, lines);
  return result;
}

function addLinesToNodes(nodes: LineTreeNode[], lineNumStart: number, lineNumEnd: number, lines: string[]) {
  let newNodes: LineTreeNode[] = [];
  let lineNum = lineNumStart;
  function addLinesUpTo(lineNumEnd: number) {
    rangeIncl(lineNum, lineNumEnd - 1).forEach((i) => {
      newNodes.push({
        type: 'line',
        line: lines[i - 1],
        lineNumStart: i,
        lineNumEnd: i + 1,
      });
    });
    lineNum = lineNumEnd;
  }
  for (const child of nodes) {
    addLinesUpTo(child.lineNumStart);
    if (child.type === 'loop-body') {
      addLinesToNodes(child.children, child.lineNumStart, child.lineNumEnd, lines);
    }
    newNodes.push(child);
    lineNum = child.lineNumEnd;
  }
  addLinesUpTo(lineNumEnd);
  nodes.splice(0, nodes.length, ...newNodes);
};

export class Run {
  sandbox: Sandbox | null = null;
  childProcess: child_process.ChildProcess | null = null;
  startTime: Date | null = null;
  messageLog: Message[] = [];
  exitCode: number | null = null;
  transformedSrc: string | null = null;
  sh2frPort: number | null = null;
  sh2frExpress: express.Express | null = null;
  sh2frServer: Server | null = null;
  sh2frUploadHandlers: Record<string, (req: express.Request, res: express.Response) => void> = {};
  execInfos: Record<string, ExecInfo> = {};
  forInfos: Record<string, ForInfo> = {};
  allStmts: { [nodeId: string]: {stmt: sh.Stmt, src: string} } = {};
  allForClauses: { [nodeId: string]: sh.ForClause } = {};
  callExprs: {callExpr: sh.CallExpr, stmtNodeId: string}[] = [];
  lineTreeNodes: LineTreeNode[] = [];
  scriptLines = this.scriptSrc.split("\n");

  constructor(public scriptSrc: string, public broadcast: (data: string) => void) { }

  async start() {
    console.log("\n\n\nstarting");

    // parse

    let ast: sh.File;
    try {
      ast = parser.Parse(this.scriptSrc);
      // syntax.DebugPrint(ast);
    } catch (e) {
      console.error("error parsing script", expandObject((e as ParseError).Error()));
      process.exit(1);  // TODO: report problem intelligently
    }

    // transform

    this.sandbox = await makeSandbox();

    this.lineTreeNodes = lineTreeNodesFromAst(ast, this.scriptLines);

    myWalk(ast, {
      exit: (node) => {
        const nodeType = sh.syntax.NodeType(node);

        if (nodeType === "Stmt") {
          const stmt = node as sh.Stmt;
          const nodeId = getNodeId(stmt);

          this.allStmts[nodeId] = { stmt, src: this._stmtSrc(stmt) };

          const cmd = stmt.Cmd;
          const cmdType = sh.syntax.NodeType(cmd);
          if (cmdType === "CallExpr") {
            wrapStmt(parser, stmt, `{
              local fr_stdout fr_stderr fr_ret >/dev/null;
              ${callStmtStr({
                type: "stmt-enter",
                nodeId,
                context: '$(frctx_str)',
                cwd: "$PWD"
              }, "fr_stdout fr_stderr")};
              # echo "sh: got upload ids $fr_stdout $fr_stderr" 1>&2;
              fr-sandbox before-run ${this.sandbox!.deltaDir}
              ___ 1>&1 1> >(${uploadCmdStr('$fr_stdout')}) 2>&2 2> >(${uploadCmdStr('$fr_stderr')});
              fr_ret=$?;
              ${callStmtStr({
                type: "stmt-exit",
                nodeId,
                context: '$(frctx_str)',
                cwd: "$PWD",
                exitCode: RAW("$fr_ret")
              }, "fr_delta_log")};
              fr-sandbox after-run ${this.sandbox!.deltaDir} ${this.sandbox!.sandboxDir} - | ${uploadCmdStr('$fr_delta_log')};
              fr_exitcode $fr_ret;
            }`);
            this.callExprs.push({callExpr: cmd as sh.CallExpr, stmtNodeId: nodeId});
          }
          if (cmdType === "ForClause") {
            const forClause = cmd as sh.ForClause;
            const forNodeId = getNodeId(forClause);

            this.allForClauses[nodeId] = forClause;

            const counterVar = `fr_loop_counter_${forNodeId}`;
            const loopType = sh.syntax.NodeType(forClause.Loop);
            if (loopType !== "WordIter") {
              throw new Error(`unsupported loop type ${loopType}`);
            }
            const wordIter = forClause.Loop as sh.WordIter;
            const loopVar = wordIter.Name?.Value;
            if (!loopVar) {
              throw new Error(`wordIter has no Name?`);
            }
            wrapStmt(parser, stmt, `{ ${counterVar}=0; ___; }`);
            forClause.Do = [
              callStmt({
                type: "for-body-enter",
                nodeId: forNodeId,
                context: '$(frctx_str)',
                counter: RAW(`$${counterVar}`),
                // TODO: $loopVar's really gonna need some escaping
                loopVarValue: `$${loopVar}`,
              }),
              parseStmt(`frctx_push "${forNodeId}-$${counterVar}"`),
              ...forClause.Do,
              parseStmt(`frctx_pop`),
              callStmt({
                type: "for-body-exit",
                nodeId: forNodeId,
                context: '$(frctx_str)',
              }),
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

    try {
      this.transformedSrc = fsOld.readFileSync("transformedOverride.sh", { encoding: 'utf-8' });
      console.log("USING TRANSFORMED OVERRIDE");
    } catch {
      // ignore
    }

    // run

    const tmpFile = tmp.fileSync();
    await fs.writeFile(tmpFile.name, this.transformedSrc, { encoding: 'utf-8' });

    this.startTime = new Date();

    this.childProcess = child_process.spawn(
      'zsh',
      [ tmpFile.name ],
      {
        cwd: path.join(this.sandbox.deltaUnionDir, process.cwd()),
        env: {
          ...process.env,
        },
        stdio: ['ignore', 'inherit', 'inherit'],
        // stdio: 'ignore',
      }
    );
    console.log("fr: spawned child process at", this.childProcess.pid);


    // collect output

    // this.childProcess.stdout.on('data', (data: string) => {
    //   console.log("childProcess stdout");
    //   data.toString().trimEnd().split("\n").forEach((line) => {
    //     console.log("  ", line);
    //   });
    // });

    // this.childProcess.stderr.on('data', (data: string) => {
    //   console.error("childProcess stderr");
    //   data.toString().trimEnd().split("\n").forEach((line) => {
    //     console.error("  ", line);
    //   });
    // });

    this.childProcess.on('close', (exitCodeIn: number) => {
      console.log("child process exited with code", exitCodeIn);
      this.exitCode = exitCodeIn;
      this._scheduleWriteHtml();
      this.stop();
    });

    let uploadId = 0;

    const onMessage = (message: Message): string => {
      if (message.type === "stmt-enter") {
        const stdoutUploadId = `${uploadId++}`;
        const stderrUploadId = `${uploadId++}`;

        const execId = mkExecId(message.context, message.nodeId);
        const execOutput: ExecInfo = this.execInfos[execId] = {
          stdout: { data: "", done: false },
          stderr: { data: "", done: false },
          enterCwd: pathInSandbox(message.cwd, this.sandbox!),
          exitInfo: null,
        };

        this.sh2frUploadHandlers[stdoutUploadId] = (req, res) => {
          // console.log("fr: stdout upload handler called")
          // console.log(req);
          req.setEncoding('utf8');
          req.on('data', (data) => {
            // console.log("fr: stdout upload handler got data", data)
            execOutput.stdout.data += data;
            this._scheduleWriteHtml();
          });
          req.on('end', () => {
            // console.log("fr: stdout upload handler got end")
            execOutput.stdout.done = true;
            this._scheduleWriteHtml();
            res.end();
          });
        };

        this.sh2frUploadHandlers[stderrUploadId] = (req, res) => {
          // console.log("fr: stderr upload handler called")
          req.on('data', (data) => {
            // console.log("fr: stderr upload handler got data", data)
            execOutput.stderr.data += data;
            this._scheduleWriteHtml();
          });
          req.on('end', () => {
            // console.log("fr: stderr upload handler got end")
            execOutput.stderr.done = true;
            this._scheduleWriteHtml();
            res.end();
          });
        };

        return `${stdoutUploadId} ${stderrUploadId}\n`;
      } else if (message.type === "stmt-exit") {
        const execId = mkExecId(message.context, message.nodeId);

        console.log("fr: stmt-exit", execId, util.inspect(message));

        const deltaLogId = `${uploadId++}`;

        this.sh2frUploadHandlers[deltaLogId] = async (req, res) => {
          // console.log("fr: deltaLog upload handler called");
          const deltaLog = (await readWholeStream(req)).toString();
          // console.log("fr: deltaLog upload handler got data", deltaLog);
          this.execInfos[execId].exitInfo = {
            exitCode: message.exitCode,
            cwd: pathInSandbox(message.cwd, this.sandbox!),
            deltaLog: parseDeltaLog(deltaLog),
          };
          this._scheduleWriteHtml();
          res.end();
        };

        return `${deltaLogId}\n`;
      } else if (message.type === "for-body-enter") {
        const execId = mkExecId(message.context, message.nodeId);
        let forInfo = this.forInfos[execId] as ForInfo | undefined;
        if (!forInfo) {
          forInfo = this.forInfos[execId] = {
            iterations: []
          };
        }
        forInfo.iterations.push({
          counter: message.counter,
          loopVarValue: message.loopVarValue,
        });
      }
      return "\n";
    }

    this.sh2frExpress = express()

    this.sh2frExpress.use('/', express.raw({ type: "*/*" }))

    this.sh2frExpress.post('/', (req, res) => {
      const dataString = req.body.toString();
      // TODO: this might be naive; a message might be split across events?
      const lines = dataString.trim().split("\n");
      console.log(`fr: ${lines.length} messages received`);
      for (const line of lines) {
        try {
          const dataParsed = JSON.parse(line);
          this.messageLog.push(dataParsed);
          const response = onMessage(dataParsed);
          res.send(response);
          this._scheduleWriteHtml();
          // console.log("sh2fr pipe data parsed", dataParsed)
        } catch (err) {
          FATAL("node error parsing data", err, dataString);
        }
      }
    })

    this.sh2frExpress.post('/upload/:uploadId', (req, res) => {
      console.log("fr: upload", req.params.uploadId);

      const uploadHandler = this.sh2frUploadHandlers[req.params.uploadId];

      if (!uploadHandler) {
        res.status(404).send(`upload handler not found for ${req.params.uploadId}`);
        return;
      }

      uploadHandler(req, res);

      delete this.sh2frUploadHandlers[req.params.uploadId];
    });

    this.sh2frExpress.get('*', (req, res) => {
      // log and 404
      console.log("fr: 404", req.url);
      res.status(404).send(`404 not found`);
    });


    this.sh2frPort = 1234;
    this.sh2frServer = this.sh2frExpress.listen(this.sh2frPort, () => {
      console.log(`Example app listening on port ${this.sh2frPort}`)
    })

    this._scheduleWriteHtml();
  }

  async stop() {
    console.log("stopping");
    if (this.exitCode === null && this.childProcess) {
      this.childProcess.kill();
    }
    this.sandbox && removeSandbox(this.sandbox);
    this.sh2frServer && this.sh2frServer.listening && await new Promise((resolve) => {
      this.sh2frServer!.close((err) => {
        if (err) {
          console.error("error closing sh2frServer", err);
        } else {
          console.log("sh2frServer closed");
        }
        resolve(undefined);
      })
    });
    // await this.sh2frHandle.close();
    // this.sh2frSocket.destroy();
    // dump();
  }

  onlyRunLatestJob = new OnlyRunLatestJob();
  _scheduleWriteHtml() {
    this.onlyRunLatestJob.submitJob(async () => {
      this._writeHtml();
    });
  }

  _writeHtml() {
    // const partMain = <div>
    //   {this.scriptSrc.split('\n').map((line, i) =>
    //     this._renderLine(line, i, '')
    //   )}
    // </div>;

    const partMain = <div>
      {this.lineTreeNodes.map((node) =>
        this._renderLineTreeNode(node, '')
      )}
    </div>;

    const partTransformed = () => <div>
      <div>
        <h1>transformed</h1>
        {/* prepend each line with a line number */}
        <pre>{this.transformedSrc?.split('\n').map((line, i) => `${String(i + 1).padStart(3)} ${line}`).join('\n')}</pre>
      </div>
    </div>;

    const partAST = () => <div>
      <h1>ast</h1>
      <details open={false}>
        {inspectHtml(expandObject(
          parser.Parse(this.scriptSrc)
        ))}
      </details>
    </div>;

    const partMessages = () => <div className="row">
      <div>
        <h1>messages</h1>
        <ul>
          {this.messageLog.map((entry, i) =>
            <li key={i}>
              { entry.nodeId && this.allStmts[entry.nodeId] &&
                <div style={{display: 'inline-block', border: '1px solid gray', padding: 4}}>
                  <pre>{this.allStmts[entry.nodeId].src}</pre>
                </div>
              }
              { inspectHtml(entry) }
            </li>
          )}
        </ul>
        {this.exitCode !== null && <div>exit code: {this.exitCode}</div>}
      </div>
    </div>;

    const partExecInfo = () => <div>
      <h1>exec info</h1>
      <dl>
        {Object.entries(this.execInfos).map(([execId, execInfo]) => {
          const { stdout, stderr, ...rest } = execInfo;
          return <Fragment key={execId}>
            <dt>{execId}</dt>
            <dd>
              <div><b>stdout</b> {stdout.done && <small>✓</small>}</div>
              <pre>{stdout.data}</pre>
              <div><b>stderr</b> {stderr.done && <small>✓</small>}</div>
              <pre>{stderr.data}</pre>
              <div><b>rest</b>
                {inspectHtml(rest)}
              </div>
            </dd>
          </Fragment>
        })}
      </dl>
    </div>;

    const partForInfo = () => <div>
      <h1>for info</h1>
      <dl>
        {Object.entries(this.forInfos).map(([execId, forInfo]) => {
          return <Fragment key={execId}>
            <dt>{execId}</dt>
            <dd>
              <div><b>iterations</b></div>
              <ul>
                {forInfo.iterations.map((iteration, i) => <li key={i}>
                  <div><b>counter</b> {iteration.counter}</div>
                  <div><b>loopVarValue</b> {iteration.loopVarValue}</div>
                </li>)}
              </ul>
            </dd>
          </Fragment>
        })}
      </dl>
    </div>;

    const jsx = <>
      {/* <script dangerouslySetInnerHTML={{
        __html: live
      }} /> */}
      <style dangerouslySetInnerHTML={{ __html: styleCss }} />

      <div style={{fontSize: "80%", marginBottom: 10}}>
        <div>started @ {this.startTime?.toLocaleTimeString()}</div>
        <div>updated @ {new Date().toLocaleTimeString()}</div>
      </div>

      {true && partMain}

      <div className="row" style={{marginTop: 1000}}></div>

      {false && partTransformed()}
      {false && partAST()}
      {true && partMessages()}
      {true && partExecInfo()}
      {true && partForInfo()}
    </>;

    const html = renderToString(jsx);

    this.broadcast(html);
  }

  _renderLine(line: string, i: number, context: string) {
    const callExprsOnLine = this.callExprs.filter(({callExpr}) => {
      // TODO: everything's limited to single lines
      return callExpr.Pos().Line() === i + 1;
    });
    const decorations: Decoration[] = callExprsOnLine.map(({callExpr, stmtNodeId}) => {
      const execId = mkExecId(context, stmtNodeId);
      const execInfo = this.execInfos[execId] as ExecInfo | undefined;
      const execExitInfo = execInfo?.exitInfo;
      const statusClass =
        execInfo
        ? execExitInfo
          ? execExitInfo.exitCode === 0
            ? 'call-done-success'
            : 'call-done-failure'
          : 'call-running'
        : 'call-not-started';

      return {
        start: callExpr.Pos().Col() - 1,
        end: callExpr.End().Col() - 1,
        decorator: (contents) =>
          <div key={stmtNodeId} className={`call ${statusClass}`}>
            <div className="call-code">
              <div className="call-code-background"/>
              <div className="call-code-contents">{contents}</div>
            </div>
            <div className="call-rest">
              { execInfo && execInfo.stdout.data.length > 0 &&
                <div style={{fontSize: '80%'}}>
                  <div className="delta-log-entry">
                    <ChevronRightIcon/>
                    <pre>
                      {execInfo.stdout.data}
                    </pre>
                  </div>
                </div>
              }
              { execInfo && execInfo.stderr.data.length > 0 &&
                <div style={{fontSize: '80%'}}>
                  <div className="delta-log-entry" style={{}}>
                    <div style={{position: 'relative', width: 16, height: 16}}>
                      <div style={{position: 'absolute', left: 3}}>
                        <ChevronRightIcon/>
                      </div>
                      <div style={{position: 'absolute', left: -3}}>
                        <ChevronRightIcon/>
                      </div>
                    </div>
                    <pre>
                      {execInfo.stderr.data}
                    </pre>
                  </div>
                </div>
              }
              { execExitInfo && execExitInfo.deltaLog.length > 0 &&
                <div style={{fontSize: '80%'}}>
                  {renderDeltaLog(execExitInfo.deltaLog, execInfo.enterCwd)}
                </div>
              }
              { execExitInfo && execExitInfo.exitCode !== 0 &&
                <div className="delta-log-entry" style={{fontSize: '80%'}}>
                  <SignOutIcon/>
                  <div>
                    exit {execExitInfo.exitCode}
                  </div>
                </div>
              }
              { execExitInfo && execExitInfo.cwd !== execInfo.enterCwd &&
                <div style={{fontSize: '80%'}} title={execExitInfo.cwd}>
                  <div className="delta-log-entry">
                    <FileSubmoduleIcon/>
                    {path.relative(execInfo.enterCwd, execExitInfo.cwd)}
                  </div>
                </div>
              }
              {false && <div style={{fontStyle: 'italic', fontSize: '60%'}}>{stmtNodeId}</div>}
            </div>
          </div>
      };
    });
    const decoratedLine = addDecorationsToLine(line, decorations);
    return <div key={i} className="code-line">
      <div className="code-linenum">{i + 1}</div>
      <div className="code-linecode">
        <div className="code-command">{decoratedLine}</div>
        {/* { outputPerLine[i + 1] &&
          <div className="row">
            <div>{lineIndent}</div>
            <div className="code-stdout" dangerouslySetInnerHTML={{__html: ansiToHtml.toHtml(outputPerLine[i + 1])}}/>
          </div>
        } */}
      </div>
    </div>;
  }

  _renderLineTreeNode(node: LineTreeNode, context: string): React.ReactNode {
    if (node.type === 'line') {
      return this._renderLine(node.line, node.lineNumStart - 1, context);
    } else if (node.type === 'loop-body') {
      const forClause = node.forClause;
      const forNodeId = getNodeId(forClause);
      const forInfo = this.forInfos[mkExecId(context, forNodeId)];
      const iterations = forInfo?.iterations || [];
      const varName = (forClause.Loop as sh.WordIter).Name!.Value;
      const forLine = this.scriptLines[forClause.Pos().Line() - 1];
      const forIndent = forLine.match(/^\s*/)?.[0] || '';
      return iterations.map((iteration) => {
        return <Fragment key={iteration.counter}>
          <div className="code-line">
            <div className="code-linenum"/>
            <div className="code-linecode">
              <div className="for-loop-var">
                {forIndent}
                <span style={{fontSize: "80%", fontWeight: 'bold', backgroundColor: '#ccc', color: '#444', padding: '0px 5px'}}>{varName} = {iteration.loopVarValue}</span>
              </div>
            </div>
          </div>
          {node.children.map((child) => this._renderLineTreeNode(child, `${context}/${forNodeId}-${iteration.counter}`))}
        </Fragment>;
      });
    }
  }

  _stmtSrc(stmt: sh.Stmt): string {
    return this.scriptSrc.slice(stmt.Pos().Offset(), stmt.End().Offset());
  }
}

// setInterval(() => {
//   console.log('alive');
// }, 3000);
