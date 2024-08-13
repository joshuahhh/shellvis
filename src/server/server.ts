import { AutomergeUrl } from "@automerge/automerge-repo";
import cors from "cors";
import express from "express";
import * as child_process from "node:child_process";
import { ExecuteRequest, Session } from "../shared/types.js";
import { ScriptWatcher } from "./ScriptWatcher.js";
import { AutomergeServer } from "./automerge.js";

console.log("welcome to funrun");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 8080;
const httpServer = app.listen(PORT, () => {
  console.log(`Automerge server listening on port ${PORT}`);
  // this.#readyResolvers.forEach((resolve) => resolve(true))
});

const automergeServer = new AutomergeServer(httpServer, "/automerge");

const sessionUrlCache: { [paramsStr: string]: string } = {};
const watchers: { [sessionUrl: string]: ScriptWatcher } = {};

app.post("/new-session", async (req, res) => {
  const paramsStr = JSON.stringify(req.body);
  let sessionUrl = sessionUrlCache[paramsStr] as AutomergeUrl | undefined;
  if (sessionUrl === undefined) {
    console.log("params not found; creating new session");
    const sessionHandle = automergeServer.repo.create<Session>({
      traceAutomergeUrl: null,
    });
    sessionUrl = sessionUrlCache[paramsStr] = sessionHandle.url;
    watchers[sessionUrl] = new ScriptWatcher(
      req.body,
      automergeServer,
      (traceUrl) => {
        sessionHandle.change((session) => {
          session.traceAutomergeUrl = traceUrl;
        });
      },
    );
  } else {
    console.log("params found; using existing session", sessionUrl);
    const sessionHandle = automergeServer.repo.find<Session>(sessionUrl);
    const doc = await sessionHandle.doc();
    if (doc === undefined) {
      console.log("  session not found");
      res.status(404).send("session not found");
      return;
    } else {
      console.log(
        "  session found, traceAutomergeUrl is",
        doc.traceAutomergeUrl,
      );
    }
  }
  res.send(sessionUrl);
});

app.post("/restart/:sessionUrl", (req, res) => {
  console.log("restarting", req.params.sessionUrl);
  const watcher = watchers[req.params.sessionUrl];
  if (watcher) {
    console.log("  session found");
    watcher.restart();
    res.send("ok");
  } else {
    console.log("  session not found");
    res.status(404).send("session not found");
  }
});

app.post("/execute", (req, res) => {
  const { command, cwd } = req.body as ExecuteRequest;
  console.log("executing", command);
  child_process.exec(command, { cwd }, (error, stdout, stderr) => {
    // TODO: send this stuff back to front end
  });
  res.send("ok");
});
