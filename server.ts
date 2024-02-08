import cors from "cors";
import express from "express";
import { ScriptWatcher, ScriptWatcherParams } from "./ScriptWatcher.js";
import { AutomergeServer } from "./automerge.js";
import { Session } from "./types.js";

console.log("welcome to funrun")

const app = express()

app.use(cors());
app.use(express.json());

const PORT = 8080;
const httpServer = app.listen(PORT, () => {
  console.log(`Automerge server listening on port ${PORT}`)
  // this.#readyResolvers.forEach((resolve) => resolve(true))
})

const automergeServer = new AutomergeServer(httpServer, "/automerge");

app.post("/new-session", (req, res) => {
  const sessionHandle = automergeServer.repo.create<Session>({ traceAutomergeUrl: null });
  new ScriptWatcher(
    req.body,
    automergeServer,
    (traceUrl) => {
      sessionHandle.change((session) => {
        session.traceAutomergeUrl = traceUrl;
      });
    }
  );
  res.send(sessionHandle.url);
});
