import { AutomergeUrl } from "@automerge/automerge-repo";
import { useDocument } from "@automerge/automerge-repo-react-hooks"
import { Session } from "../types.js";


export function App(props: { sessionAutomergeUrl: AutomergeUrl }) {
  const { sessionAutomergeUrl } = props
  const [ session, changeSession ] = useDocument<Session>(sessionAutomergeUrl)

  if (!session) {
    return <div>Loading... (no session)</div>
  }
  if (!session.traceAutomergeUrl) {
    return <div>Loading... (no trace URL)</div>
  }

  return <Trace traceAutomergeUrl={session.traceAutomergeUrl} />
}

function Trace(props: { traceAutomergeUrl: AutomergeUrl }) {
  const { traceAutomergeUrl } = props
  const [ trace, changeTrace ] = useDocument<any>(traceAutomergeUrl)
  return <div>
    <h1>Trace</h1>
    <pre>
      {JSON.stringify(trace, null, 2)}
    </pre>
  </div>;
}
