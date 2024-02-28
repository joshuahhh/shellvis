import { AutomergeUrl } from "@automerge/automerge-repo";


// some types shared between client and server, generally for requests.

export type Session = {
  traceAutomergeUrl: AutomergeUrl | null,
}

export type ExecuteRequest = {
  command: string,
  cwd: string,
}

export type RunParams = {
  path: string | null,
  scriptSrc: string,
  cwd: string,
  env: Record<string, string | undefined> | 'process.env',
  args?: string,
}

export type ScriptWatcherParams =
  Omit<RunParams, 'scriptSrc'> & {
    path: string,
  }
