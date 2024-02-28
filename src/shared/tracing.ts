export type Message =
  | {
      type: 'debug',
      [key: string]: any,
    }
  | {
      type: 'call-enter',
      nodeId: string,
      context: string,
      cwd: string,
      suppressed: boolean,
    }
  | {
      type: 'call-exit',
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
