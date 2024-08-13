// @ts-check
import { DocHandle, PeerId, Repo } from '@automerge/automerge-repo';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import http from 'node:http';
import os from 'os';
import { WebSocketServer } from 'ws';
import { connectWsServer } from './websocket.js';

export class AutomergeServer {
  wsServer: WebSocketServer;
  repo: Repo;

  constructor(public readonly httpServer: http.Server, public readonly path: string) {
    var hostname = os.hostname();

    this.wsServer = new WebSocketServer({ noServer: true });
    connectWsServer(this.wsServer, httpServer, path);

    this.wsServer.on('connection', (ws, req) => {
      console.log('automerge websocket connection', req.socket.remoteAddress);
      // ws.on("message", (message) => {
      //   console.log("automerge websocket message", message);
      // });
    });

    this.repo = new Repo({
      network: [new NodeWSServerAdapter(this.wsServer)],
      peerId: `engine-${hostname}` as PeerId,
      sharePolicy: async () => false,
    });

    if (false) {
      this.repo.addListener('document', ({handle}) => {
        handle.on('change', (payload) => {
          console.log('doc changed', payload.doc);
          console.log('patch info', payload.patchInfo);
          console.log('patches', payload.patches);
        });
      });
    }
  }

  close() {
    this.wsServer.close();
  }
}

// usage: I say:
//   const changeMyProperty = changeAt(doc, doc => doc.myProperty);
// and then you can say
//   changeMyProperty(property => property.subProperty = 100);
// (a weakness here is that you cannot do property = 100)

export function changeAt<T, U>(doc: DocHandle<T>, selector: (doc: T) => U): DocHandle<U>['change'] {
  return (changeFn) => {
    doc.change((doc) => {
      const value = selector(doc);
      changeFn(value);
    });
  };
}
