import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App.js'
import { AutomergeUrl, Repo } from '@automerge/automerge-repo'
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'
import { RepoContext } from '@automerge/automerge-repo-react-hooks'


ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App/>
  </React.StrictMode>
)

const networkAdapter = new BrowserWebSocketClientAdapter("ws://localhost:8080/automerge", 500);

const repo = new Repo({ network: [ networkAdapter ] });

networkAdapter.addListener("ready", () => {
  console.log("networkAdapter ready");
});

networkAdapter.addListener("close", () => {
  console.log("networkAdapter close");
});

(async () => {
  const sessionAutomergeUrlRequest = await fetch("http://localhost:8080/session-automerge-url");
  const sessionAutomergeUrl = await sessionAutomergeUrlRequest.text();
  console.log("sessionAutomergeUrl", sessionAutomergeUrl);

})();
