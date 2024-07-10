import { Repo } from '@automerge/automerge-repo';
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket';
import { RepoContext } from '@automerge/automerge-repo-react-hooks';
import { memo, ReactNode } from 'react';

// ok I'm just gonna do this global-style for now
const networkAdapter = new BrowserWebSocketClientAdapter('ws://localhost:8080/automerge', 1000);
const repo = new Repo({ network: [ networkAdapter ] });

export const WithAutomergeV = memo((props: {
  children: ReactNode,
}) => {
  return <RepoContext.Provider value={repo}>
    {props.children}
  </RepoContext.Provider>;
});
