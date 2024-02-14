import { AutomergeUrl } from "@automerge/automerge-repo";

export type Session = {
  traceAutomergeUrl: AutomergeUrl | null,
}

export type ExecuteRequest = {
  command: string,
  cwd: string,
}
