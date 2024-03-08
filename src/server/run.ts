/* eslint-disable import/first */

// must come first
import { dump } from "wtfnode";
(global as any).dump = dump;

import { DocHandle, Repo } from "@automerge/automerge-repo";
import { RawString } from "@automerge/automerge/next";
import sh from "mvdan-sh";
import * as child_process from "node:child_process";
import * as fsOld from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as tmp from "tmp";
import { TypedEventTarget } from "../shared/TypedEventTarget.js";
import { PipeProgress, Trace, mkExecId, parseDeltaLog } from "../shared/execution.js";
import { Script, getNodeId, hasNodeType, myWalk, parseFirstOfType, wrapStmt } from "../shared/mvdan-sh-helpers.js";
import { Message } from "../shared/tracing.js";
import { RunParams } from "../shared/types.js";
import { parseTypeset } from "../shared/typeset.js";
import { changeAt } from "./automerge.js";
import { Sh2Fr } from "./Sh2Fr.js";
import { Sh2FrViaTcp } from "./Sh2FrViaTcp.js";
import { joinIterable } from "../shared/util.js";

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

function frMsgStr(message: Message, returnVars: string | null = null) {
  const messageStr = JSON.stringify(message)
    .replaceAll(new RegExp(`"${RAW("(.*?)")}"`, "g"), (_, p1) => p1)
    .replaceAll('"', '\\"');
  return `fr_msg "${messageStr}"${returnVars === null ? ' >/dev/null' :` | read -r ${returnVars}`}`;
}

function RAW(str: string): any {
  return `RAW<<<${str}>>>RAW`;
}

function frMsgStmt(message: Message, returnVars?: string): sh.Stmt {
  return parseStmt(frMsgStr(message, returnVars))
}

// null if path is not in sandbox
function pathInSandbox(path: string, sandbox: Sandbox): string | null {
  if (!path.startsWith(sandbox.deltaUnionDir)) {
    return null;
  }
  return path.slice(sandbox.deltaUnionDir.length);
}

async function handlePipeProgress(lines: AsyncIterable<string>, changePipeProgress: DocHandle<PipeProgress>["change"]):
  Promise<void>
{
  for await (const line of lines) {
    changePipeProgress((pipeProgress) => {
      pipeProgress.data.push(line);
    });
  }
  changePipeProgress((pipeProgress) => {
    pipeProgress.done = true;
  });
}

const suppressedCommands = new Set([
  "code",
  "say",
]);

type EventMap = {
  close: Event,
}

export class Run extends (EventTarget as TypedEventTarget<EventMap>) {
  sandbox: Sandbox | null = null;
  childProcess: child_process.ChildProcess | null = null;
  transformedSrc: string | null = null;
  sh2fr: Sh2Fr;
  sh2frUploadHandlers: Record<string, (lines: AsyncIterable<string>) => Promise<void>> = {};
  script: Script | null = null;
  traceDoc: DocHandle<Trace>;

  constructor(
    public params: RunParams,
    public repo: Repo,
  ) {
    super();

    // TODO: parameterize this
    this.sh2fr = new Sh2FrViaTcp();

    this.traceDoc = this.repo.create({
      path: this.params.path,
      scriptSrc: this.params.scriptSrc,
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

    const sh2frInit = await this.sh2fr.init();

    // parse

    try {
      this.script = new Script(this.params.scriptSrc, parser);
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
          const cmd = node.Cmd;
          if (hasNodeType(cmd, "CallExpr")) {
            const callId = getNodeId(cmd);

            let suppressed = false;
            if (cmd.Args && cmd.Args[0]?.Parts) {
              const cmdName = cmd.Args[0].Lit();
              if (suppressedCommands.has(cmdName)) {
                const echoWord = parseFirstOfType(parser, "echo", "Word");
                if (!echoWord) {
                  throw new Error("couldn't get echo word?");
                }
                cmd.Args = [echoWord, ...cmd.Args];
                suppressed = true;
              }
            }

            wrapStmt(parser, node, `{
              local fr_stdout fr_stderr fr_vars_enter fr_vars_exit fr_delta_log fr_ret >/dev/null;
              ${frMsgStr({
                type: "call-enter",
                nodeId: callId,
                context: '$(fr_ctx_str)',
                cwd: "$PWD",
                suppressed,
              }, "fr_stdout fr_stderr fr_vars_enter fr_vars_exit fr_delta_log")};
              echo "sh: got upload ids $fr_stdout $fr_stderr $fr_vars_enter $fr_vars_exit $fr_delta_log" >&$fr_top_stderr;
              fr-sandbox before-run $fr_sandbox_delta_dir
              fr_typeset > >(fr_upload $fr_vars_enter)
              ___ 1>&1 1> >(fr_upload $fr_stdout) 2>&2 2> >(fr_upload $fr_stderr)
              fr_ret=$?
              fr_typeset > >(fr_upload $fr_vars_exit)
              fr-sandbox after-run $fr_sandbox_delta_dir $fr_sandbox_sandbox_dir - > >(fr_upload $fr_delta_log);
              ${frMsgStr({
                type: "call-exit",
                nodeId: callId,
                context: '$(fr_ctx_str)',
                cwd: "$PWD",
                exitCode: RAW("$fr_ret"),
              })};
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

    console.log("this is server/run.ts");

    const frPreludeSrc = await fs.readFile(new URL('fr-prelude.sh', import.meta.url), { encoding: 'utf-8' });

    this.transformedSrc = [frPreludeSrc, sh2frInit.prelude ?? '', printer.Print(transformedAst)].join("\n\n");

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

    // TODO: we use a second zsh call to parse this.params.args; kinda ugly
    this.childProcess = child_process.spawn(
      'zsh',
      [ '-c', `zsh ${tmpFile.name} ${this.params.args || ''}` ],
      {
        cwd: path.join(this.sandbox.deltaUnionDir, path.resolve(this.params.cwd)),
        env: {
          ...process.env,  // TODO
          // ...this.params.env === 'process.env' ? process.env : this.params.env,
          ...sh2frInit.env,
          fr_sandbox_delta_dir: this.sandbox.deltaDir,
          fr_sandbox_sandbox_dir: this.sandbox.sandboxDir,
          ROOT: this.sandbox.deltaUnionDir,
        },
        stdio: ['ignore', 'ignore', 'inherit'],
        // stdio: ['ignore', 'inherit', 'inherit'],
        // stdio: 'ignore',
      }
    );
    console.log("fr: spawned child process at", this.childProcess.pid);

    this.childProcess.on('close', (exitCode: number) => {
      console.log("child process exited with code", exitCode);
      this.traceDoc.change((trace) => {
        trace.exitCode = exitCode;
      });
      this.stop();
      this.dispatchEvent(new Event("close"));
    });

    const onMessage: Sh2Fr.StartProps["onMessage"] = async (message) => {
      console.log("fr: got message", message);

      this.traceDoc.change((trace) => {
        trace.messageLog.push(message);
      });

      if (message.type === "call-enter") {
        const enterCwd = pathInSandbox(message.cwd, this.sandbox!);

        if (!enterCwd) {
          console.error("call-enter cwd not in sandbox", message.cwd, "aborting");
          await this.stop();
          throw new Error("call-enter cwd not in sandbox");
        }

        const execId = mkExecId(message);
        this.traceDoc.change((trace) => {
          trace.execInfos[execId] = {
            stdout: { data: [], done: false },
            stderr: { data: [], done: false },
            enterCwd,
            exitInfo: null,
            varsEnterStr: null,
            varsExitStr: null,
            deltaLog: null,
            suppressed: message.suppressed,
          }
        });

      } else if (message.type === "call-exit") {
        const execId = mkExecId(message);

        const cwd = pathInSandbox(message.cwd, this.sandbox!);

        if (!cwd) {
          console.error("call-exit cwd not in sandbox", message.cwd, "aborting");
          await this.stop();
          throw new Error("call-exit cwd not in sandbox");
        }

        this.traceDoc.change((trace) => {
          trace.execInfos[execId].exitInfo = {
            exitCode: message.exitCode,
            cwd,
          };
        });
        // console.log("fr: stmt-exit", execId);
      } else if (message.type === "for-body-enter") {
        const execId = mkExecId(message);
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
    };

    const onUpload: Sh2Fr.StartProps["onUpload"] = async (execId, uploadName, lines) => {
      console.log("fr: got upload", execId, uploadName);

      if (uploadName === "stdout") {
        await handlePipeProgress(lines, changeAt(this.traceDoc, (trace) => trace.execInfos[execId].stdout));
      } else if (uploadName === "stderr") {
        await handlePipeProgress(lines, changeAt(this.traceDoc, (trace) => trace.execInfos[execId].stderr));
      } else if (uploadName === "varsEnter") {
        const varsEnterTypeset = await joinIterable(lines);
        const varsEnter = parseTypeset(varsEnterTypeset);
        const varsEnterStr = JSON.stringify(varsEnter);
        this.traceDoc.change((trace) => {
          const execInfo = trace.execInfos[execId];
          execInfo.varsEnterStr = new RawString(varsEnterStr);
        });
      } else if (uploadName === "varsExit") {
        const varsExitTypeset = await joinIterable(lines);
        const varsExit = parseTypeset(varsExitTypeset);
        const varsExitStr = JSON.stringify(varsExit);
        const trace = await this.traceDoc.doc();
        if (!trace) { throw new Error("trace not found"); }
        this.traceDoc.change((trace) => {
          const execInfo = trace.execInfos[execId];
          execInfo.varsExitStr = new RawString(varsExitStr);
        });
      } else if (uploadName === "deltaLog") {
        const deltaLogStr = await joinIterable(lines);
        this.traceDoc.change((trace) => {
          trace.execInfos[execId].deltaLog = parseDeltaLog(deltaLogStr);
        });
      }
    };

    this.sh2fr.start({ onMessage, onUpload });

    process.once('exit', () => {
      console.log('exit event!');
      this.stop();
    });
  }

  async stop() {
    console.log("stopping");
    if (this.childProcess && this.childProcess.exitCode === null) {
      this.childProcess.kill();
    }
    this.sandbox && removeSandbox(this.sandbox);
    this.sh2fr.stop();
  }

  async isClosedPromise() {
    const trace = await this.traceDoc.doc();
    if (trace && trace.exitCode !== null) {
      return;
    } else {
      return new Promise((resolve) => {
        this.addEventListener('close', () => {
          resolve(undefined);
        });
      });
    }
  }
}
