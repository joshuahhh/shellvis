// must come first
import { dump } from "wtfnode";
(global as any).dump = dump;

import { RawString } from "@automerge/automerge/next";
import { DocHandle } from "@automerge/automerge-repo";
import express from "express";
import sh from "mvdan-sh";
import * as child_process from "node:child_process";
import * as fsOld from "node:fs";
import * as fs from "node:fs/promises";
import { Server } from "node:http";
import * as path from "node:path";
import * as os from "os";
import { renderToString } from "react-dom/server";
import * as tmp from "tmp";
import { WebSocketServer } from "ws";
import { AutomergeServer, changeAt } from "./automerge.js";
import { PipeProgress, Trace, mkExecId, parseDeltaLog } from "./execution.js";
import { OnlyRunLatestJob } from "./job-stuff.js";
import { Script, getNodeId, hasNodeType, myWalk, wrapStmt } from "./mvdan-sh-helpers.js";
import { Message } from "./tracing.js";
import { parseTypeset } from "./typeset.js";
import { FATAL, __dirname } from "./util.js";

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

const parser = sh.syntax.NewParser(sh.syntax.KeepComments(true));
const printer = sh.syntax.NewPrinter();

function parseStmt(s: string): sh.Stmt {
  const stmts = parser.Parse(s).Stmts;
  if (stmts.length !== 1 || !stmts[0]) {
    throw new Error("need one stmt");
  }
  return stmts[0];
}

function frMsgStr(message: Message, returnVars: string = "fr_dummy") {
  const messageStr = JSON.stringify(message)
    .replaceAll(new RegExp(`"${RAW("(.*?)")}"`, "g"), (_, p1) => p1)
    .replaceAll('"', '\\"');
  return `fr_msg "${messageStr}" | read -r ${returnVars}`;
}

function RAW(str: string): any {
  return `RAW<<<${str}>>>RAW`;
}

function frMsgStmt(message: Message, returnVars?: string): sh.Stmt {
  return parseStmt(frMsgStr(message, returnVars))
}

function frUploadStr(uploadId: string) {
  return `curl -s -X POST -T - http://localhost:1234/upload/${uploadId}`;
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

function pathInSandbox(path: string, sandbox: Sandbox): string {
  if (!path.startsWith(sandbox.deltaUnionDir)) {
    throw new Error(`path ${path} is not in sandbox`);
  }
  return path.slice(sandbox.deltaUnionDir.length);
}

function pipeProgressUploadHandler(changePipeProgress: DocHandle<PipeProgress>["change"], onUpdate?: () => void):
  (req: express.Request, res: express.Response) => void {
  return (req, res) => {
    req.setEncoding('utf8');
    req.on('data', (data) => {
      changePipeProgress((pipeProgress) => {
        pipeProgress.data.push(data);
      });
      onUpdate && onUpdate();
    });
    req.on('end', () => {
      changePipeProgress((pipeProgress) => {
        pipeProgress.done = true;
      });
      onUpdate && onUpdate();
      res.end();
    });
  };
}

export class Run {
  sandbox: Sandbox | null = null;
  childProcess: child_process.ChildProcess | null = null;
  transformedSrc: string | null = null;
  sh2frPort: number | null = null;
  sh2frExpress: express.Express | null = null;
  sh2frServer: Server | null = null;
  sh2frUploadHandlers: Record<string, (req: express.Request, res: express.Response) => void> = {};
  script: Script | null = null;
  traceDoc: DocHandle<Trace>;

  constructor(
    public scriptSrc: string,
    public broadcast: (data: string) => void,
    public automergeServer: AutomergeServer,
    public wsHtmlServer: WebSocketServer,
  ) {
    this.traceDoc = this.automergeServer.repo.create({
      scriptSrc,
      messageLog: [],
      execInfos: {},
      forInfos: {},
      exitCode: null,
      startTime: null,
      transformedSrc: null,
      parseError: null,
    })
  }

  async start() {
    console.log("\n\n\nstarting");

    // parse

    try {
      this.script = new Script(parser, this.scriptSrc);
    } catch (e) {
      this.traceDoc.change((trace) => {
        trace.parseError = (e as any).toString();
      });
      return;
    }

    // transform

    this.sandbox = await makeSandbox();

    const transformedAst = this.script.freshAst();

    myWalk(transformedAst, {
      exit: (node) => {
        if (hasNodeType(node, "Stmt")) {
          const nodeId = getNodeId(node);

          const cmd = node.Cmd;
          if (hasNodeType(cmd, "CallExpr")) {
            const callId = getNodeId(cmd);

            wrapStmt(parser, node, `{
              local fr_stdout fr_stderr fr_vars_enter fr_vars_exit fr_ret >/dev/null;
              ${frMsgStr({
                type: "call-enter",
                nodeId: callId,
                context: '$(fr_ctx_str)',
                cwd: "$PWD"
              }, "fr_stdout fr_stderr fr_vars_enter fr_vars_exit")};
              # echo "sh: got upload ids $fr_stdout $fr_stderr $fr_vars_enter $fr_vars_exit" >&$fr_top_stderr;
              fr-sandbox before-run ${this.sandbox!.deltaDir}
              fr_typeset | ${frUploadStr('$fr_vars_enter')};
              ___ 1>&1 1> >(${frUploadStr('$fr_stdout')}) 2>&2 2> >(${frUploadStr('$fr_stderr')});
              fr_ret=$?;
              fr_typeset | ${frUploadStr('$fr_vars_exit')};
              ${frMsgStr({
                type: "call-exit",
                nodeId: callId,
                context: '$(fr_ctx_str)',
                cwd: "$PWD",
                exitCode: RAW("$fr_ret")
              }, " fr_delta_log")};
              fr-sandbox after-run ${this.sandbox!.deltaDir} ${this.sandbox!.sandboxDir} - | ${frUploadStr('$fr_delta_log')};
              fr_exitcode $fr_ret;
            }`);
          } else if (hasNodeType(cmd, "ForClause")) {
            const forNodeId = getNodeId(cmd);

            const counterVar = `fr_loop_counter_${forNodeId}`;
            const loop = cmd.Loop;
            if (!hasNodeType(loop, "WordIter")) {
              throw new Error(`unsupported loop type ${sh.syntax.NodeType(loop)}`);
            }
            const loopVar = loop.Name?.Value;
            if (!loopVar) {
              throw new Error(`wordIter has no Name?`);
            }
            wrapStmt(parser, node, `{ ${counterVar}=0; ___; }`);
            cmd.Do = [
              frMsgStmt({
                type: "for-body-enter",
                nodeId: forNodeId,
                context: '$(fr_ctx_str)',
                counter: RAW(`$${counterVar}`),
                // TODO: $loopVar's really gonna need some escaping
                loopVarValue: `$${loopVar}`,
              }),
              parseStmt(`fr_ctx_push "${forNodeId}-$${counterVar}"`),
              ...cmd.Do,
              parseStmt(`fr_ctx_pop`),
              frMsgStmt({
                type: "for-body-exit",
                nodeId: forNodeId,
                context: '$(fr_ctx_str)',
              }),
              parseStmt(`${counterVar}=$(($${counterVar} + 1))`),
            ];
          }
        }
      }
    });

    const frPreludeSrc = await fs.readFile(path.join(__dirname, 'fr-prelude.sh'), { encoding: 'utf-8' });

    this.transformedSrc = [frPreludeSrc, printer.Print(transformedAst)].join("\n\n");

    if (true) {
      await fs.mkdir("_debug", { recursive: true });
      await fs.writeFile("_debug/transformed.sh", this.transformedSrc, { encoding: 'utf-8' });
    }

    try {
      this.transformedSrc = fsOld.readFileSync("transformedOverride.sh", { encoding: 'utf-8' });
      console.log("USING TRANSFORMED OVERRIDE");
    } catch {
      // ignore
    }

    // run

    const tmpFile = tmp.fileSync();
    await fs.writeFile(tmpFile.name, this.transformedSrc, { encoding: 'utf-8' });

    this.traceDoc.change((trace) => {
      trace.startTime = new Date();
    });

    const cwd = process.cwd();
    // const cwd = "/Users/joshuah/Documents/research/engraft/paper-uist-2023-old"

    this.childProcess = child_process.spawn(
      'zsh',
      [ tmpFile.name ],
      {
        cwd: path.join(this.sandbox.deltaUnionDir, cwd),
        env: {
          ...process.env,
        },
        stdio: ['ignore', 'inherit', 'inherit'],
        // stdio: 'ignore',
      }
    );
    console.log("fr: spawned child process at", this.childProcess.pid);

    this.childProcess.on('close', (exitCode: number) => {
      console.log("child process exited with code", exitCode);
      this.traceDoc.change((trace) => {
        trace.exitCode = exitCode;
      });
      this._scheduleWriteHtml();
      this.stop();
    });

    let uploadId = 0;

    const onMessage = async (message: Message): Promise<string> => {
      if (message.type === "call-enter") {
        const stdoutUploadId = `${uploadId++}`;
        const stderrUploadId = `${uploadId++}`;
        const varsEnterUploadId = `${uploadId++}`;
        const varsExitUploadId = `${uploadId++}`;

        const execId = mkExecId(message.context, message.nodeId);
        this.traceDoc.change((trace) => {
          trace.execInfos[execId] = {
            stdout: { data: [], done: false },
            stderr: { data: [], done: false },
            enterCwd: pathInSandbox(message.cwd, this.sandbox!),
            exitInfo: null,
            varsEnterStr: null,
            varsExitStr: null,
          }
        });

        const changeStdout = changeAt(this.traceDoc, (trace) => trace.execInfos[execId].stdout);
        const changeStderr = changeAt(this.traceDoc, (trace) => trace.execInfos[execId].stderr);

        this.sh2frUploadHandlers[stdoutUploadId] = pipeProgressUploadHandler(
          changeStdout,
          () => this._scheduleWriteHtml()
        );

        this.sh2frUploadHandlers[stderrUploadId] = pipeProgressUploadHandler(
          changeStderr,
          () => this._scheduleWriteHtml()
        );

        this.sh2frUploadHandlers[varsEnterUploadId] = async (req, res) => {
          const varsEnterTypeset = (await readWholeStream(req)).toString();
          const varsEnter = parseTypeset(varsEnterTypeset);
          const varsEnterStr = JSON.stringify(varsEnter);
          this.traceDoc.change((trace) => {
            const execInfo = trace.execInfos[execId];
            execInfo.varsEnterStr = new RawString(varsEnterStr);
          });
          this._scheduleWriteHtml();
          res.end();
        };

        this.sh2frUploadHandlers[varsExitUploadId] = async (req, res) => {
          const varsExitTypeset = (await readWholeStream(req)).toString();
          const varsExit = parseTypeset(varsExitTypeset);
          const varsExitStr = JSON.stringify(varsExit);
          const trace = await this.traceDoc.doc();
          if (!trace) { throw new Error("trace not found"); }
          this.traceDoc.change((trace) => {
            const execInfo = trace.execInfos[execId];
            execInfo.varsExitStr = new RawString(varsExitStr);
          });
          this._scheduleWriteHtml();
          res.end();
        };

        return `${stdoutUploadId} ${stderrUploadId} ${varsEnterUploadId} ${varsExitUploadId}\n`;
      } else if (message.type === "call-exit") {
        const execId = mkExecId(message.context, message.nodeId);

        // console.log("fr: stmt-exit", execId);

        const deltaLogId = `${uploadId++}`;

        this.sh2frUploadHandlers[deltaLogId] = async (req, res) => {
          // console.log("fr: deltaLog upload handler called");
          const deltaLog = (await readWholeStream(req)).toString();
          // console.log("fr: deltaLog upload handler got data", deltaLog);
          this.traceDoc.change((trace) => {
            trace.execInfos[execId].exitInfo = {
              exitCode: message.exitCode,
              cwd: pathInSandbox(message.cwd, this.sandbox!),
              deltaLog: parseDeltaLog(deltaLog),
            };
          });
          this._scheduleWriteHtml();
          res.end();
        };

        return `${deltaLogId}\n`;
      } else if (message.type === "for-body-enter") {
        const execId = mkExecId(message.context, message.nodeId);
        const trace = await this.traceDoc.doc();
        if (!trace) { throw new Error("trace not found"); }
        if (!trace.forInfos[execId]) {
          this.traceDoc.change((trace) => {
            trace.forInfos[execId] = {
              iterations: []
            };
          });
        }
        this.traceDoc.change((trace) => {
          trace.forInfos[execId].iterations.push({
            counter: message.counter,
            loopVarValue: message.loopVarValue,
          });
        });
      }
      return "\n";
    }

    this.sh2frExpress = express()

    this.sh2frExpress.use('/', express.raw({ type: "*/*" }))

    this.sh2frExpress.post('/', async (req, res) => {
      const dataString = req.body.toString();
      // TODO: this might be naive; a message might be split across events?
      const lines = dataString.trim().split("\n");
      // console.log(`fr: ${lines.length} messages received`);
      for (const line of lines) {
        try {
          const dataParsed = JSON.parse(line);
          this.traceDoc.change((trace) => {
            trace.messageLog.push(dataParsed);
          });
          const response: string = await onMessage(dataParsed);
          res.send(response);
          this._scheduleWriteHtml();
          // console.log("sh2fr pipe data parsed", dataParsed)
        } catch (err) {
          FATAL("node error parsing data", err, dataString);
        }
      }
    })

    this.sh2frExpress.post('/upload/', (req, res) => {
      res.status(404).send(`missing uploadId\n`);
    });

    this.sh2frExpress.post('/upload/:uploadId', (req, res) => {
      // console.log("fr: upload", req.params.uploadId);

      const uploadHandler = this.sh2frUploadHandlers[req.params.uploadId];

      if (!uploadHandler) {
        res.status(404).send(`upload handler not found for ${req.params.uploadId}\n`);
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
      console.log(`sh2fr server listening on port ${this.sh2frPort}`)
    })

    this._scheduleWriteHtml();
  }

  async stop() {
    console.log("stopping");
    if (this.childProcess && this.childProcess.exitCode === null) {
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
  }

  onlyRunLatestJob = new OnlyRunLatestJob();
  _scheduleWriteHtml() {
    this.onlyRunLatestJob.submitJob(async () => {
      this._writeHtml();
    });
  }

  async _writeHtml() {
    if (this.wsHtmlServer.clients.size === 0) {
      // console.log("no html clients, not writing html");
      return;
    }
    // console.log("html client, writing html");
    const trace = await this.traceDoc.doc();
    if (!trace) { throw new Error("trace not found"); }

    const html = renderToString(<div>
      <h1>fun-run trace</h1>
      <pre>
        {JSON.stringify(trace, (key, value) => key === 'varsEnter' || key=== 'varsExit' ? undefined : value, 2)}
      </pre>
    </div>);

    this.broadcast(html);
  }
}

// setInterval(() => {
//   console.log('alive');
// }, 3000);
