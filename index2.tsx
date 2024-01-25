import chokidar from "chokidar";
import * as fs from "node:fs";
import WebSocket, { WebSocketServer } from 'ws';
import yargs from "yargs";
import { Run } from "./run2";


console.log("welcome to funrun")

const argv = yargs(process.argv.slice(2))
  .command('* <script>', 'run a script', (yargs) =>
    yargs
    .positional('script', {
      type: 'string',
    })
  )
  .parseSync() as unknown as { script: string };

const wss = new WebSocketServer({ port: 8080 });

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

let latestJob: (() => Promise<void>) | null = null;
let jobsAreRunning: boolean = false;
function submitJob(job: () => Promise<void>): void  {
  latestJob = job;
  if (!jobsAreRunning) {
    setImmediate(() => runJobs());
    // setTimeout(() => runJobs(), 300);
  }
}
async function runJobs() {
  if (jobsAreRunning) { return; }
  jobsAreRunning = true;
  while (latestJob) {
    const job = latestJob;
    latestJob = null;
    await job();
  }
  jobsAreRunning = false;
}

function broadcast(data: string): void {
  output = data;
  submitJob(() => actuallyBroadcast(data));
}

wss.on('connection', (ws) => {
  ws.send(output);
});

let run: Run | null = null;

async function onFile() {
  if (run) {
    await run.stop();
  }

  const scriptStr = fs.readFileSync(argv.script, { encoding: 'utf-8' });
  run = new Run(scriptStr, broadcast);
  run.start();
}

chokidar.watch(argv.script).on('all', (event, path) => {
  console.log('chokidar event', event, path);
  onFile();
});

// chokidar will send an initial event for the file
