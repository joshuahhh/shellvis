import { AutomergeUrl } from "@automerge/automerge-repo";
import { useDocument } from "@automerge/automerge-repo-react-hooks"
import { Session } from "../types.js";
import { TraceV } from "./render.js";
import { Trace } from "../execution.js";
import { useRef } from "react";


export function App(props: { sessionAutomergeUrl: AutomergeUrl }) {
  const { sessionAutomergeUrl } = props
  const [ session, changeSession ] = useDocument<Session>(sessionAutomergeUrl)

  if (!session) {
    return <div>Loading... (no session)</div>
  }
  if (!session.traceAutomergeUrl) {
    return <div>Loading... (no trace URL)</div>
  }

  return <AppWithTraceAutomergeUrl traceAutomergeUrl={session.traceAutomergeUrl} />
}

function AppWithTraceAutomergeUrl(props: { traceAutomergeUrl: AutomergeUrl }) {
  const { traceAutomergeUrl } = props
  const [ trace, changeTrace ] = useDocument<Trace>(traceAutomergeUrl)

  const oldTraceRef = useRef<Trace>();
  if (trace) {
    oldTraceRef.current = trace;
  }

  if (!oldTraceRef.current) {
    return <div>Loading... (no trace)</div>
  }

  return <>
    <TraceV trace={oldTraceRef.current} />
    { !trace &&
      // full-screen loading spinner
      <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start'}}>
        <div style={{fontSize: '100%'}}>Loading...</div>
      </div>
    }
  </>;
}
