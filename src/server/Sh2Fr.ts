import { Message } from "../shared/tracing.js";

export type Sh2Fr = {
  // init runs early and provides some bits the runner needs to get the shell
  // script running in the first place
  init: () => Promise<Sh2Fr.InitResult>,

  // these decorate shell script source to add instrumentation in different ways
  sendMessage(message: Message): string,
  beforeCommand(message: Message & { type: 'call-enter' }): string,  // special case
  sendUpload(command: string, uploadName: UploadName): string,
  interceptAndUploadStds(command: string, stdoutUploadName: UploadName, stderrUploadName: UploadName): string,

  // start runs later and actually starts up the sh2fr communications link
  start: (props: Sh2Fr.StartProps) => Promise<void>,

  stop: () => Promise<void>,
}

export const uploadNames = ["stdout", "stderr", "varsEnter", "varsExit", "deltaLog"] as const;
export type UploadName = typeof uploadNames[number];

// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace Sh2Fr {
  export type InitResult = {
    prelude?: string,
    env?: NodeJS.ProcessEnv,
  }

  export type StartProps = {
    onMessage: (data: Message) => Promise<void>,
    onUpload: (execId: string, uploadName: UploadName, lines: AsyncIterable<string>) => Promise<void>,
  }
}
