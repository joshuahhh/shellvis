import cors from 'cors';
import express from 'express';
import yargs from 'yargs';
import { ScriptWatcher } from './ScriptWatcher.js';
import { AutomergeServer } from './automerge.js';
import { ScriptWatcherParams, Session } from '../shared/types.js';

console.log('welcome to funrun');

const argv = yargs(process.argv.slice(2))
  .command('* <script>', 'run a script', (yargs) =>
    yargs
    .positional('script', {
      type: 'string',
    })
  )
  .parseSync() as unknown as { script: string };

const app = express();

app.use(cors());

app.get('/cli-session-automerge-url', (req, res) => {
  res.send(sessionHandle.url);
});

const PORT = 8080;
const httpServer = app.listen(PORT, () => {
  console.log(`Automerge server listening on port ${PORT}`);
  // this.#readyResolvers.forEach((resolve) => resolve(true))
});

const automergeServer = new AutomergeServer(httpServer, '/automerge');
const sessionHandle = automergeServer.repo.create<Session>({ traceAutomergeUrl: null });

const params: ScriptWatcherParams = {
  path: argv.script,
  cwd: process.cwd(),
  env: process.env,
  // TODO: other stuff
};

new ScriptWatcher(
  params,
  automergeServer,
  (traceUrl) => {
    sessionHandle.change((session) => {
      session.traceAutomergeUrl = traceUrl;
    });
  }
);
