import { ShellVar, ShellVarChange } from "./typeset.js";

export function mkExecId(context: string, nodeId: string): string {
  return `${context}/${nodeId}`;
}

export type DeltaLogEntry = {
  path: string,
  event: string,
}

export type ExecInfo = {
  stdout: PipeProgress,
  stderr: PipeProgress,
  enterCwd: string,
  exitInfo: {
    exitCode: number,
    cwd: string,
    deltaLog: DeltaLogEntry[],
  } | null,
  varsEnter: Record<string, ShellVar> | null,
  varsExit: Record<string, ShellVar> | null,  // TODO: put in exitInfo? idk
  varsDiff: ShellVarChange[] | null,
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
  execInfos: Record<string, ExecInfo>,
  forInfos: Record<string, ForInfo>,
}
