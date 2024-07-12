import { AutomergeUrl } from '@automerge/automerge-repo';
import { memo, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ScriptWatcherParams } from '../shared/types.js';
import { SessionV } from './SessionV.js';
import { WithAutomergeV } from './WithAutomergeV.js';

const examples: Record<string, ScriptWatcherParams & {desc?: string}> = {
  'study-pics': {
    path: './examples/study-pics/script.sh',
    cwd: './examples/study-pics',
    env: 'process.env',
    desc: 'study: pics',
  },
  'study-count': {
    path: './examples/study-count/script.sh',
    cwd: './examples/study-count',
    env: 'process.env',
    desc: 'study: count',
  },
  'minimal': {
    path: './examples/minimal.sh',
    cwd: '.',
    env: 'process.env',
    desc: 'one command',
  },
  'stdouts': {
    path: './examples/stdouts.sh',
    cwd: '.',
    env: 'process.env',
    desc: 'stdouts of varying lengths',
  },
  'pipes': {
    path: './examples/pipes.sh',
    cwd: '.',
    env: 'process.env',
    desc: 'pipeline of three commands',
  },
  'info-types': {
    path: './examples/info-types.sh',
    cwd: '.',
    env: 'process.env',
    desc: 'all the info types',
  },
  'nested-calls': {
    path: './examples/nested-calls.sh',
    cwd: '.',
    env: 'process.env',
    desc: 'calls inside of calls',
  },
  'loops': {
    path: './examples/loops.sh',
    cwd: '.',
    env: 'process.env',
    desc: 'lotsa loops lol',
  },
  'while': {
    path: './examples/while.sh',
    cwd: '.',
    env: 'process.env',
    desc: 'the famed "while" loop',
  },
  'getopts': {
    path: './examples/getopts.sh',
    cwd: '.',
    env: 'process.env',
    args: '-p "hi" -s 50',
    desc: 'while loop with getopts',
  },
  'nice-and-slow': {
    path: './examples/nice-and-slow.sh',
    cwd: '.',
    env: 'process.env',
    desc: 'for testing run status',
  },
  'suppression': {
    path: './examples/suppression.sh',
    cwd: '.',
    env: 'process.env',
    desc: 'suppressing side-effects',
  },
  'pics': {
    path: './examples/pics/script.sh',
    cwd: './examples/pics',
    env: 'process.env',
    desc: 'demo: move images',
  },
  'pics-finished': {
    path: './examples/pics/finished.sh',
    cwd: './examples/pics',
    env: 'process.env',
    desc: 'demo: move images (finished)',
  },
  'source-submission': {
    path: '/Users/joshuah/Documents/research/engraft/paper-uist-2023-old/source-submission.fish',
    cwd: '/Users/joshuah/Documents/research/engraft/paper-uist-2023-old',
    env: 'process.env',
    desc: 'practical',
  },
  'git-gone': {
    path: '/Users/joshuah/bin/git-gone',
    cwd: '/Users/joshuah/Documents/research/shell-live/shell',
    env: 'process.env',
    args: 'actuallyBroadcast',
    desc: 'practical',
  },
  'convert-css': {
    path: './examples/convert-css.sh',
    cwd: '/Users/joshuah/Documents/research/engraft/engraft-repo/packages/core-widgets',
    env: 'process.env',
    args: 'src lib',
    desc: 'practical',
  },
  'infinite-pipes': {
    path: './examples/infinite-pipes.sh',
    cwd: '.',
    env: 'process.env',
    desc: 'problem: pipes with infinite generators',
  },
  'test': {
    path: './examples/test.sh',
    cwd: '.',
    env: 'process.env',
    desc: 'big old mess',
  },
};

export const TestbedLinksV = memo(() => {
  return <ul>
    {Object.entries(examples).map(([name, {desc}]) => <li key={name}>
      <Link to={`/testbed/${name}`}>{name}</Link>
      {desc && <span className='opacity-50'> - {desc}</span>}
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
        'http://localhost:8080/new-session',
        {
          method: 'POST',
          body: JSON.stringify(params),
          headers: { 'Content-Type': 'application/json' },
        }
      );
      const sessionAutomergeUrl = await sessionAutomergeUrlRequest.text() as AutomergeUrl;
      setSessionAutomergeUrl(sessionAutomergeUrl);  // won't rerender if it's the same
    };
    check();
  }, [params]);

  if (!params) {
    return <div>Example <code>{name}</code> not found</div>;
  } else if (!sessionAutomergeUrl) {
    return <div>Loading session document URL from server...</div>;
  } else {
    return <WithAutomergeV>
      <SessionV sessionAutomergeUrl={sessionAutomergeUrl} />
    </WithAutomergeV>;
  }
});
