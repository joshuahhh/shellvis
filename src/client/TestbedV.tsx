import { AutomergeUrl } from "@automerge/automerge-repo";
import { memo, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ScriptWatcherParams } from "../shared/types.js";
import { CliWithSessionUrlV } from "./CliV.js";
import { WithAutomergeV } from "./WithAutomergeV.js";

const examples: Record<string, ScriptWatcherParams> = {
  "minimal": {
    path: "./examples/minimal.sh",
    cwd: ".",
    env: 'process.env',
  },
  "pipes": {
    path: "./examples/pipes.sh",
    cwd: ".",
    env: 'process.env',
  },
  "info-types": {
    path: "./examples/info-types.sh",
    cwd: ".",
    env: 'process.env',
  },
  "nested-calls": {
    path: "./examples/nested-calls.sh",
    cwd: ".",
    env: 'process.env',
  },
  "test": {
    path: "./examples/test.sh",
    cwd: ".",
    env: 'process.env',
  },
  "loops": {
    path: "./examples/loops.sh",
    cwd: ".",
    env: 'process.env',
  },
  "source-submission": {
    path: "/Users/joshuah/Documents/research/engraft/paper-uist-2023-old/source-submission.fish",
    cwd: "/Users/joshuah/Documents/research/engraft/paper-uist-2023-old",
    env: 'process.env',
  },
  "git-gone": {
    path: "/Users/joshuah/bin/git-gone",
    cwd: "/Users/joshuah/Documents/research/shell-live/shell",
    env: 'process.env',
    args: "actuallyBroadcast",
  },
  "suppression": {
    path: "./examples/suppression.sh",
    cwd: ".",
    env: 'process.env',
  },
  "convert-css": {
    path: "./examples/convert-css.sh",
    cwd: "/Users/joshuah/Documents/research/engraft/engraft-repo/packages/core-widgets",
    env: 'process.env',
    args: "src lib",
  },
  "pics": {
    path: "./examples/pics/script.sh",
    cwd: "./examples/pics",
    env: 'process.env',
  },
  "pics-finished": {
    path: "./examples/pics/finished.sh",
    cwd: "./examples/pics",
    env: 'process.env',
  },
  "infinite-pipes": {
    path: "./examples/infinite-pipes.sh",
    cwd: ".",
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
  const params: ScriptWatcherParams | undefined = (examples as any)[name as any];
  const [ sessionAutomergeUrl, setSessionAutomergeUrl ] = useState<AutomergeUrl | null>(null);

  // TODO: do proper cleanup so this strict-mode cheat isn't required
  useEffect(() => {
    if (!params) { return; }
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

  if (!params) {
    return <div>Example <code>{name}</code> not found</div>;
  } else if (!sessionAutomergeUrl) {
    return <div>Loading session document URL from server...</div>
  } else {
    return <WithAutomergeV>
      <CliWithSessionUrlV sessionAutomergeUrl={sessionAutomergeUrl} />
    </WithAutomergeV>
  }
});
