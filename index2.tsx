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

let output = "";
function broadcast(data: string) {
  // console.log('broadcast', +new Date());
  output = data;
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

wss.on('connection', (ws) => {
  ws.send(output);
});

let run: Run | null = null;

function onFile() {
  if (run) {
    run.stop();
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
