import chokidar from "chokidar";
import cors from "cors";
import express from "express";
import * as fs from "node:fs";
import yargs from "yargs";
import { AutomergeServer } from "./automerge.js";
import { Run } from "./run.js";
import { Session } from "./types.js";
import { ScriptWatcher, ScriptWatcherParams } from "./ScriptWatcher.js";

console.log("welcome to funrun")

const argv = yargs(process.argv.slice(2))
  .command('* <script>', 'run a script', (yargs) =>
    yargs
    .positional('script', {
      type: 'string',
    })
  )
  .parseSync() as unknown as { script: string };

const app = express()

app.use(cors());

app.get("/session-automerge-url", (req, res) => {
  res.send(sessionHandle.url);
});

const PORT = 8080;
const httpServer = app.listen(PORT, () => {
  console.log(`Automerge server listening on port ${PORT}`)
  // this.#readyResolvers.forEach((resolve) => resolve(true))
})

const automergeServer = new AutomergeServer(httpServer, "/automerge");
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
