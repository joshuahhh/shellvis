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
      exitCode: string,  // number as string
    }
  | {
      type: 'for-body-enter',
      nodeId: string,
      context: string,
      counter: string,  // number as string
      loopVarValue: string,
    }
  | {
      type: 'for-body-exit',
      nodeId: string,
      context: string,
    };
