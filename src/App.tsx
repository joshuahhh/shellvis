import { AutomergeUrl } from "@automerge/automerge-repo";
import { useDocument } from "@automerge/automerge-repo-react-hooks"
import { Session } from "../types.js";
import { TraceV } from "./render.js";
import { Trace } from "../execution.js";


export function App(props: { sessionAutomergeUrl: AutomergeUrl }) {
  const { sessionAutomergeUrl } = props
  const [ session, changeSession ] = useDocument<Session>(sessionAutomergeUrl)

  if (!session) {
    return <div>Loading... (no session)</div>
  }
  if (!session.traceAutomergeUrl) {
    return <div>Loading... (no trace URL)</div>
  }

  return <TraceVV traceAutomergeUrl={session.traceAutomergeUrl} />
}

function TraceVV(props: { traceAutomergeUrl: AutomergeUrl }) {
  const { traceAutomergeUrl } = props
  const [ trace, changeTrace ] = useDocument<Trace>(traceAutomergeUrl)
  if (!trace) {
    return <div>Loading... (no trace)</div>
  }
  return <div>
    <TraceV trace={trace} />
    <pre>
      {JSON.stringify(trace, (key, value) => key === 'varsEnter' || key=== 'varsExit' ? undefined : value, 2)}
    </pre>
  </div>;
}
