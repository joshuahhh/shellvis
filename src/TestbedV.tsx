import { Link, useParams } from "react-router-dom";
import { ScriptWatcherParams } from "../ScriptWatcher.js";
import { AutomergeUrl } from "@automerge/automerge-repo";
import { memo, useState, useRef, useEffect } from "react";
import { CliWithSessionUrlV } from "./CliV.js";
import { WithAutomergeV } from "./WithAutomergeV.js";

const examples: Record<string, ScriptWatcherParams> = {
  "minimal": {
    path: "./tests/minimal.sh",
    cwd: ".",
    env: 'process.env',
  },
  "test": {
    path: "./test.sh",
    cwd: ".",
    env: 'process.env',
  },
  "source-submission": {
    path: "/Users/joshuah/Documents/research/engraft/paper-uist-2023-old/source-submission.fish",
    cwd: "/Users/joshuah/Documents/research/engraft/paper-uist-2023-old",
    env: 'process.env',
  },
}

export const TestbedLinksV = memo(() => {
  return <ul>
    {Object.keys(examples).map(name => <li key={name}>
      <Link to={`/testbed/${name}`}>{name}</Link>
    </li>)}
  </ul>;
});

export const TestbedV = memo(() => {
  const { name } = useParams();
  const params: ScriptWatcherParams = (examples as any)[name as any];
  const [ sessionAutomergeUrl, setSessionAutomergeUrl ] = useState<AutomergeUrl | null>(null);

  // TODO: do proper cleanup so this strict-mode cheat isn't required
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current) {
      return;
    }
    checked.current = true;
    const check = async () => {
      const sessionAutomergeUrlRequest = await fetch(
        "http://localhost:8080/new-session",
        {
          method: "POST",
          body: JSON.stringify(params),
          headers: { "Content-Type": "application/json" },
        }
      );
      const sessionAutomergeUrl = await sessionAutomergeUrlRequest.text() as AutomergeUrl;
      setSessionAutomergeUrl(sessionAutomergeUrl);  // won't rerender if it's the same
    }
    check();
  }, [params]);

  if (!sessionAutomergeUrl) {
    return <div>Loading session document URL from server...</div>
  } else {
    return <WithAutomergeV>
      <CliWithSessionUrlV sessionAutomergeUrl={sessionAutomergeUrl} />
    </WithAutomergeV>
  }
});
