import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App.js'
import { AutomergeUrl, Repo } from '@automerge/automerge-repo'
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'
import { RepoContext } from '@automerge/automerge-repo-react-hooks'


const repo = new Repo({
  network: [
    new BrowserWebSocketClientAdapter("ws://localhost:8080/automerge"),
  ]
});

(async () => {
  const sessionAutomergeUrlRequest = await fetch("http://localhost:8080/session-automerge-url");
  const sessionAutomergeUrl = await sessionAutomergeUrlRequest.text();
  console.log("sessionAutomergeUrl", sessionAutomergeUrl);

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <RepoContext.Provider value={repo}>
      <React.StrictMode>
        <App sessionAutomergeUrl={sessionAutomergeUrl as AutomergeUrl}/>
      </React.StrictMode>
    </RepoContext.Provider>
  )
})();
