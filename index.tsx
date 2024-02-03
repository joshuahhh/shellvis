import chokidar from "chokidar";
import * as fs from "node:fs";
import WebSocket, { WebSocketServer } from 'ws';
import yargs from "yargs";
import { Run } from "./run.js";
import { AutomergeServer } from "./automerge.js";
import express from "express";
import cors from "cors";
import { Session } from "./types.js";

console.log("welcome to funrun")

const argv = yargs(process.argv.slice(2))
  .command('* <script>', 'run a script', (yargs) =>
    yargs
    .positional('script', {
      type: 'string',
    })
  )
  .parseSync() as unknown as { script: string };

const wss = new WebSocketServer({ noServer: true });

function wsSend(ws: WebSocket, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.send(data, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

let output = "";
async function actuallyBroadcast(data: string): Promise<void> {
  // console.log('broadcast', +new Date());
  let sends: Promise<void>[] = [];
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      sends.push(wsSend(client, data));
    }
  });
  await Promise.all(sends);
}

function broadcast(data: string): void {
  output = data;
  actuallyBroadcast(data);
}

wss.on('connection', (ws) => {
  ws.send(output);
});

const automergeServer = new AutomergeServer();

const sessionHandle = automergeServer.repo.create<Session>({ traceAutomergeUrl: null });

const app = express()

app.use(cors());

app.get("/session-automerge-url", (req, res) => {
  res.send(sessionHandle.url);
});

const PORT = 8080;
const server = app.listen(PORT, () => {
  console.log(`Automerge server listening on port ${PORT}`)
  // this.#readyResolvers.forEach((resolve) => resolve(true))
})

server.on("upgrade", (request, socket, head) => {
  console.log("upgrade request", request.url);
  wss.handleUpgrade(request, socket, head, (socket) => {
    console.log("upgrade request callback")
    wss.emit("connection", socket, request)
  })
})

let run: Run | null = null;

async function onFile() {
  if (run) {
    await run.stop();
  }

  const scriptStr = fs.readFileSync(argv.script, { encoding: 'utf-8' });
  run = new Run(scriptStr, broadcast, automergeServer);
  sessionHandle.change((session) => {
    session.traceAutomergeUrl = run!.traceDoc.url;
  });
  run.start();
}

chokidar.watch(argv.script).on('all', (event, path) => {
  console.log('chokidar event', event, path);
  onFile();
});

// chokidar will send an initial event for the file
