import { AutomergeUrl, Repo } from "@automerge/automerge-repo";
import { RepoContext, useDocument } from "@automerge/automerge-repo-react-hooks"
import { Session } from "../types.js";
import { TraceV } from "./render.js";
import { Trace } from "../execution.js";
import { useEffect, useRef, useState } from "react";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";

export function App() {
  const repoRef = useRef<Repo>();
  if (!repoRef.current) {
    const networkAdapter = new BrowserWebSocketClientAdapter("ws://localhost:8080/automerge", 500);
    repoRef.current = new Repo({ network: [ networkAdapter ] });
  }

  // TODO: should I do something smarter than polling here?
  const [ sessionAutomergeUrl, setSessionAutomergeUrl ] = useState<AutomergeUrl | null>(null);
  useEffect(() => {
    async function check() {
      const sessionAutomergeUrlRequest = await fetch("http://localhost:8080/session-automerge-url");
      const sessionAutomergeUrl = await sessionAutomergeUrlRequest.text() as AutomergeUrl;
      setSessionAutomergeUrl(sessionAutomergeUrl);  // won't rerender if it's the same
    }
    const interval = setInterval(check, 1000);
    check();
    return () => clearInterval(interval);
  }, []);

  if (!sessionAutomergeUrl) {
    return <div>Loading session document URL from server...</div>
  }

  return <RepoContext.Provider value={repoRef.current}>
    <AppWithSessionUrl sessionAutomergeUrl={sessionAutomergeUrl} />
  </RepoContext.Provider>
}

export function AppWithSessionUrl(props: { sessionAutomergeUrl: AutomergeUrl }) {
  const { sessionAutomergeUrl } = props
  const [ session ] = useDocument<Session>(sessionAutomergeUrl)

  if (!session) {
    return <div>Loading session document from Automerge...</div>
  }
  if (!session.traceAutomergeUrl) {
    return <div>Session document lacks a traceAutomergeUrl!</div>
  }

  return <AppWithTraceAutomergeUrl traceAutomergeUrl={session.traceAutomergeUrl} />
}

function AppWithTraceAutomergeUrl(props: { traceAutomergeUrl: AutomergeUrl }) {
  const { traceAutomergeUrl } = props
  const [ trace ] = useDocument<Trace>(traceAutomergeUrl)

  const oldTraceRef = useRef<Trace>();
  if (trace) {
    oldTraceRef.current = trace;
  }

  if (!oldTraceRef.current) {
    return <div>Loading trace document from Automerge...</div>
  }

  return <>
    <TraceV trace={oldTraceRef.current} />
    { !trace &&
      // full-screen loading spinner
      <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start'}}>
        <div style={{fontSize: '100%'}}>Loading trace...</div>
      </div>
    }
  </>;
}
