import { Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { RepoContext } from "@automerge/automerge-repo-react-hooks";
import { memo, ReactNode, useRef } from "react";

export const WithAutomergeV = memo((props: {
  children: ReactNode
}) => {
  const repoRef = useRef<Repo>();
  if (!repoRef.current) {
    const networkAdapter = new BrowserWebSocketClientAdapter("ws://localhost:8080/automerge", 500);
    repoRef.current = new Repo({ network: [ networkAdapter ] });
  }
  return <RepoContext.Provider value={repoRef.current}>
    {props.children}
  </RepoContext.Provider>
});
