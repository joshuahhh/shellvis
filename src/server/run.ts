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
import * as path from "node:path";
import * as tmp from "tmp";
import { TypedEventTarget } from "../shared/TypedEventTarget.js";
import {
  PipeProgress,
  Trace,
  mkExecId,
  newTrace,
} from "../shared/execution.js";
import {
  Script,
  getNodeId,
  hasNodeType,
  myWalk,
  parseFirstOfType,
  wrapStmt,
} from "../shared/mvdan-sh-helpers.js";
import { Message } from "../shared/tracing.js";
import { RunParams } from "../shared/types.js";
import { parseTypeset } from "../shared/typeset.js";
import { joinIterable } from "../shared/util.js";
import { Sh2Fr, Sh2FrImpl, UploadName } from "./Sh2Fr.js";
import { changeAt } from "./automerge.js";
import {
  Sandbox,
  SandboxLayerImpl,
  afterRun,
  beforeRun,
  makeDeltaLogEntryAbsolute,
  makeSandbox,
  pathInSandbox,
  removeSandbox,
} from "./sandbox.js";
import { exec, statOrNull } from "./util.js";

const parser = sh.syntax.NewParser(sh.syntax.KeepComments(true));
const printer = sh.syntax.NewPrinter();

function parseStmt(s: string): sh.Stmt {
  const stmts = parser.Parse(s).Stmts;
  if (stmts.length !== 1 || !stmts[0]) {
    throw new Error("need one stmt");
  }
  return stmts[0];
}

async function handlePipeProgress(
  lines: AsyncIterable<string>,
  changePipeProgress: DocHandle<PipeProgress>["change"],
): Promise<void> {
  for await (const line of lines) {
    changePipeProgress((pipeProgress) => {
      pipeProgress.data.push(new RawString(line));
    });
  }
  changePipeProgress((pipeProgress) => {
    pipeProgress.done = true;
  });
}

const suppressedCommands = new Set(["code", "say"]);

type EventMap = {
  close: Event;
};

export class Run extends (EventTarget as TypedEventTarget<EventMap>) {
  sandbox: Sandbox | null = null;
  childProcess: child_process.ChildProcess | null = null;
  transformedSrc: string | null = null;
  sh2frUploadHandlers: Record<
    string,
    (lines: AsyncIterable<string>) => Promise<void>
  > = {};
  script: Script | null = null;
  traceDoc: DocHandle<Trace>;
  done = false;

  constructor(
    public params: RunParams,
    public repo: Repo,
    public sh2fr: Sh2Fr = new Sh2FrImpl(),
  ) {
    super();

    this.traceDoc = this.repo.create(
      newTrace({
        runParams: this.params,
      }),
    );
  }

  async start() {
    try {
      await this.startUnprotected();
    } catch (e) {
      this.traceDoc.change((trace) => {
        trace.startError =
          e instanceof Error ? e.message : (e as any).toString();
      });
      await this.stop();
    }
  }

  private async startUnprotected() {
    console.log("\n\n\nstarting");

    this.traceDoc.change((trace) => {
      trace.startTime = new Date();
    });

    if (!(await SandboxLayerImpl.canBeSandboxed(this.params.cwd))) {
      throw new Error(
        `don't run in ${this.params.cwd}; it can't be sandboxed correctly`,
      );
    }

    console.log("starting sh2fr", this.sh2fr.constructor.name);
    const sh2frStart = await this.sh2fr.start({
      onMessage: this.onSh2FrMessage.bind(this),
      onUpload: this.onSh2FrUpload.bind(this),
    });

    // parse

    this.script = new Script(this.params.scriptSrc, parser);

    // transform

    this.sandbox = await makeSandbox();

    const transformedAst = this.script.freshAst();

    myWalk(transformedAst, {
      enter: (node) => {
        // TODO: for now, function bodies are not traced
        if (hasNodeType(node, "FuncDecl")) {
          return "skip";
        }
      },
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

            wrapStmt(
              parser,
              node,
              `{
              local fr_ret >/dev/null
              ${this.sh2fr.beforeCommand({
                type: "call-enter",
                nodeId: callId,
                context: "$(fr_ctx_str)",
                cwd: "$PWD",
                suppressed,
              })}
              ${this.sh2fr.sendUpload("fr_typeset", "varsEnter")}
              ${this.sh2fr.interceptAndUploadStds("___", "stdout", "stderr")}
              fr_ret=$?
              ${this.sh2fr.sendUpload("fr_typeset", "varsExit")}
              ${this.sh2fr.sendMessage({
                type: "call-exit",
                nodeId: callId,
                context: "$(fr_ctx_str)",
                cwd: "$PWD",
                exitCode: "$fr_ret",
              })}
              fr_exitcode $fr_ret;
            }`,
            );
          } else if (hasNodeType(cmd, "ForClause")) {
            const forNodeId = getNodeId(cmd);

            const counterVar = `fr_loop_counter_${forNodeId}`;
            const loop = cmd.Loop;
            if (!hasNodeType(loop, "WordIter")) {
              throw new Error(
                `unsupported loop type ${sh.syntax.NodeType(loop)}`,
              );
            }
            const loopVar = loop.Name?.Value;
            if (!loopVar) {
              throw new Error("wordIter has no Name?");
            }
            wrapStmt(
              parser,
              node,
              `{
              local fr_ret >/dev/null
              ${this.sh2fr.sendMessage({
                type: "for-enter",
                nodeId: forNodeId,
                context: "$(fr_ctx_str)",
              })}
              ${counterVar}=0
              ___
              fr_ret=$?
              ${this.sh2fr.sendMessage({
                type: "for-exit",
                nodeId: forNodeId,
                context: "$(fr_ctx_str)",
              })}
              fr_exitcode $fr_ret;
            }`,
            );
            cmd.Do = [
              parseStmt(
                this.sh2fr.sendMessage({
                  type: "for-body-enter",
                  nodeId: forNodeId,
                  context: "$(fr_ctx_str)",
                  counter: `$${counterVar}`,
                  // TODO: $loopVar's really gonna need some escaping
                  loopVarValue: `$${loopVar}`,
                }),
              ),
              parseStmt(`fr_ctx_push "${forNodeId}-$${counterVar}"`),
              ...cmd.Do,
              parseStmt("fr_ctx_pop"),
              parseStmt(
                this.sh2fr.sendMessage({
                  type: "for-body-exit",
                  nodeId: forNodeId,
                  context: "$(fr_ctx_str)",
                }),
              ),
              parseStmt(`${counterVar}=$(($${counterVar} + 1))`),
            ];
          } else if (hasNodeType(cmd, "WhileClause")) {
            const whileNodeId = getNodeId(cmd);

            // we could probably get away without new message,
            // but this is more brain-dead
            const counterVar = `fr_loop_counter_${whileNodeId}`;
            wrapStmt(parser, node, `{ ${counterVar}=0; ___; }`);
            cmd.Cond = [
              parseStmt(
                this.sh2fr.sendMessage({
                  type: "while-cond-enter",
                  nodeId: whileNodeId,
                  context: "$(fr_ctx_str)",
                  counter: `$${counterVar}`,
                }),
              ),
              parseStmt(`fr_ctx_push "${whileNodeId}-$${counterVar}"`),
              ...cmd.Cond,
              parseStmt("fr_ret=$?"),
              parseStmt("fr_ctx_pop"),
              parseStmt("fr_exitcode $fr_ret"),
            ];
            cmd.Do = [
              parseStmt(`fr_ctx_push "${whileNodeId}-$${counterVar}"`),
              ...cmd.Do,
              parseStmt("fr_ctx_pop"),
              parseStmt(`${counterVar}=$(($${counterVar} + 1))`),
            ];
          }
        }
      },
    });

    console.log("this is server/run.ts");

    const frPreludeSrc = await fs.readFile(
      new URL("fr-prelude.sh", import.meta.url),
      { encoding: "utf-8" },
    );

    this.transformedSrc = [
      frPreludeSrc,
      sh2frStart.prelude ?? "",
      printer.Print(transformedAst),
    ].join("\n\n");

    if (true) {
      await fs.mkdir("_debug", { recursive: true });
      await fs.writeFile("_debug/transformed.sh", this.transformedSrc, {
        encoding: "utf-8",
      });
    }

    try {
      this.transformedSrc = fsOld.readFileSync("transformedOverride.sh", {
        encoding: "utf-8",
      });
      console.log("USING TRANSFORMED OVERRIDE");
    } catch {
      // ignore
    }

    // run

    const tmpFile = tmp.fileSync();
    this.traceDoc.change((trace) => {
      trace.scriptFilePath = tmpFile.name;
      trace.transformedSrc = new RawString(this.transformedSrc!);
    });
    await fs.writeFile(tmpFile.name, this.transformedSrc, {
      encoding: "utf-8",
    });

    const cwd = path.join(
      this.sandbox.deltaLayer.getUnionDir(),
      path.resolve(this.params.cwd),
    );

    console.log(
      "delta",
      this.sandbox.deltaLayer.getUnionDir(),
      await statOrNull(this.sandbox.deltaLayer.getUnionDir()),
    );
    console.log(
      "delta ls",
      await exec(`ls -l ${this.sandbox.deltaLayer.getUnionDir()}`),
    );
    console.log(
      "delta ls/tmp",
      await exec(`ls -l ${this.sandbox.deltaLayer.getUnionDir()}/tmp`),
    );
    console.log(
      "this.params.cwd",
      this.params.cwd,
      await statOrNull(this.params.cwd),
    );
    console.log(
      "resolved cwd",
      path.resolve(this.params.cwd),
      await statOrNull(path.resolve(this.params.cwd)),
    );
    console.log("resolved cwd in delta", cwd, await statOrNull(cwd));

    console.log("running in", cwd, await statOrNull(cwd));

    this.childProcess = child_process.spawn(
      "zsh",
      ["-c", `zsh ${tmpFile.name} ${this.params.args || ""}`],
      {
        cwd,
        env: {
          ...process.env, // TODO
          // ...this.params.env === 'process.env' ? process.env : this.params.env,
          ...sh2frStart.env,
          ROOT: this.sandbox.deltaLayer.getUnionDir(),
        },
        stdio: ["ignore", "ignore", "inherit"],
        // stdio: ["ignore", "inherit", "inherit"],
        // stdio: 'ignore',
      },
    );
    if (this.childProcess.pid === undefined) {
      const error = await new Promise<Error>((resolve) =>
        this.childProcess!.once("error", resolve),
      );
      console.error(error);
      throw error;
    }

    console.log("fr: spawned child process at", this.childProcess.pid);

    this.childProcess.on("close", async (exitCode: number) => {
      console.log("child process exited with code", exitCode);
      this.traceDoc.change((trace) => {
        trace.exitCode = exitCode;
        trace.endTime = new Date();
      });

      await this.stop();
      this.dispatchEvent(new Event("done"));
    });

    process.once("exit", () => {
      console.log("exit event!");
      this.stop();
    });
  }

  async onSh2FrMessage(message: Message) {
    // console.log("fr: got message", message);

    this.traceDoc.change((trace) => {
      trace.messageLog.push(message);
    });

    if (message.type === "call-enter") {
      const enterCwd = pathInSandbox(message.cwd, this.sandbox!);

      // console.log("enterCwd", JSON.stringify(enterCwd));

      if (enterCwd === null) {
        const msg = `call-enter cwd (${message.cwd}) not in sandbox (${this.sandbox}), aborting`;
        console.error(msg);
        await this.stop();
        throw new Error(msg);
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
        };
      });

      beforeRun(this.sandbox!);
    } else if (message.type === "call-exit") {
      const deltaLog = (await afterRun(this.sandbox!)).map((entry) =>
        makeDeltaLogEntryAbsolute(entry, "/"),
      );

      const execId = mkExecId(message);

      const cwd = pathInSandbox(message.cwd, this.sandbox!);

      if (cwd === null) {
        console.error("call-exit cwd not in sandbox", message.cwd, "aborting");
        await this.stop();
        throw new Error("call-exit cwd not in sandbox");
      }

      this.traceDoc.change((trace) => {
        trace.execInfos[execId].exitInfo = {
          exitCode: +message.exitCode,
          cwd,
        };
        // TODO: put in exitInfo
        trace.execInfos[execId].deltaLog = deltaLog;
      });
      // console.log("fr: stmt-exit", execId);
    } else if (message.type === "for-enter") {
      this.traceDoc.change((trace) => {
        const execId = mkExecId(message);
        if (trace.forInfos[execId]) {
          console.warn("for-enter with existing forInfo", execId);
        }
        trace.forInfos[execId] = {
          iterations: [],
        };
      });
    } else if (message.type === "for-exit") {
      // nothing to do, keep this so we know it's (vacuously) handled
    } else if (message.type === "for-body-enter") {
      this.traceDoc.change((trace) => {
        const execId = mkExecId(message);
        if (!trace.forInfos[execId]) {
          console.error("for-body-enter without forInfo", execId, "aborting");
          this.stop();
          throw new Error("for-body-enter without forInfo");
        }
        trace.forInfos[execId].iterations.push({
          counter: +message.counter,
          loopVarValue: message.loopVarValue,
        });
      });
    } else if (message.type === "for-body-exit") {
      // nothing to do, keep this so we know it's (vacuously) handled
    } else if (message.type === "while-cond-enter") {
      this.traceDoc.change((trace) => {
        const execId = mkExecId(message);
        if (!trace.whileInfos[execId]) {
          trace.whileInfos[execId] = {
            numIterations: 0,
          };
        }
        trace.whileInfos[execId].numIterations++;
      });
    } else {
      console.log("fr: unhandled message type", message.type);
    }
  }

  async onSh2FrUpload(
    execId: string,
    uploadName: UploadName,
    lines: AsyncIterable<string>,
  ) {
    if (uploadName === "stdout") {
      await handlePipeProgress(
        lines,
        changeAt(this.traceDoc, (trace) => trace.execInfos[execId].stdout),
      );
    } else if (uploadName === "stderr") {
      await handlePipeProgress(
        lines,
        changeAt(this.traceDoc, (trace) => trace.execInfos[execId].stderr),
      );
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
      if (!trace) {
        throw new Error("trace not found");
      }
      this.traceDoc.change((trace) => {
        const execInfo = trace.execInfos[execId];
        execInfo.varsExitStr = new RawString(varsExitStr);
      });
    }
  }

  async stop() {
    console.log("stopping");
    if (this.childProcess && this.childProcess.exitCode === null) {
      this.childProcess.kill();
    }
    this.sandbox && (await removeSandbox(this.sandbox));
    await this.sh2fr.stop();
    this.dispatchEvent(new Event("done"));
    this.done = true;
  }

  async waitUntilDone() {
    if (this.done) {
      return;
    } else {
      return new Promise((resolve) => {
        this.addEventListener("done", () => {
          resolve(undefined);
        });
      });
    }
  }
}
