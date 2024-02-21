import { RawString } from "@automerge/automerge/next";
import { Message } from "./tracing.js";

export function mkExecId(context: string, nodeId: string): string {
  return `${context}/${nodeId}`;
}

export type DeltaLogEntry = {
  path: string,
  event: string,
}

export type ExecInfo = {
  suppressed: boolean,
  stdout: PipeProgress,
  stderr: PipeProgress,
  enterCwd: string,
  exitInfo: {
    exitCode: number,
    cwd: string,
    deltaLog: DeltaLogEntry[],
  } | null,
  varsEnterStr: RawString | null,
  varsExitStr: RawString | null,  // TODO: put in exitInfo? idk
}

export type PipeProgress = {
  data: string[],  // interesting reflection of Automerge usage; push to array instead of appending to string!
  done: boolean,
}

export type Iteration = {
  counter: number,
  loopVarValue: string,
}

export type ForInfo = {
  iterations: Iteration[],
}

export function parseDeltaLog(log: string): DeltaLogEntry[] {
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

export type Trace = {
  path: string | null,
  scriptSrc: string,
  execInfos: Record<string, ExecInfo>,
  forInfos: Record<string, ForInfo>,
  startTime: Date | null,
  messageLog: Message[],
  exitCode: number | null,
  transformedSrc: string | null,
  parseError: string | null,
}
