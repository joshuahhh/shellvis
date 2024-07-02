import { RawString } from '@automerge/automerge/next';
import { Message } from './tracing.js';

export function mkExecId({ context, nodeId }: { context: string, nodeId: string }): string {
  return `${context}/${nodeId}`;
}

export type DeltaLogEntry =
  | { event: 'deletedDir', path: string }
  | { event: 'deletedFile', path: string }
  | { event: 'newDir', path: string }
  | { event: 'modifiedFile', path: string }
  | { event: 'dirReplacedWithFile', path: string }
  | { event: 'newFile', path: string };

export type ExecInfo = {
  suppressed: boolean,
  stdout: PipeProgress,
  stderr: PipeProgress,
  enterCwd: string,
  exitInfo: {
    exitCode: number,
    cwd: string,
  } | null,
  varsEnterStr: RawString | null,
  varsExitStr: RawString | null,  // TODO: put in exitInfo? idk
  deltaLog: DeltaLogEntry[] | null,  // TODO: put in exitInfo? idk
};

export function execStatus (execInfo: ExecInfo | undefined) {
  if (!execInfo) { return 'not-started'; }
  if (!execInfo.exitInfo) { return 'running'; }
  if (execInfo.exitInfo.exitCode !== 0) { return 'done-failure'; }
  return 'done-success';
}

export type PipeProgress = {
  data: string[],  // interesting reflection of Automerge usage; push to array instead of appending to string!
  done: boolean,
};

export type ForIteration = {
  counter: number,
  loopVarValue: string,
};

export type ForInfo = {
  iterations: ForIteration[],
};

export type WhileInfo = {
  numIterations: number,
  // reachedCondFalse: boolean,
};

export type Trace = {
  path: string | null,
  scriptSrc: string,
  execInfos: Record<string, ExecInfo>,
  forInfos: Record<string, ForInfo>,
  whileInfos: Record<string, WhileInfo>,
  startTime: Date | null,
  messageLog: Message[],
  exitCode: number | null,
  transformedSrc: string | null,
  parseError: string | null,
};
