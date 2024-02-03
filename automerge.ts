// @ts-check
import fs from "fs"
import express from "express"
import { WebSocketServer } from "ws"
import { DocHandle, PeerId, Repo } from "@automerge/automerge-repo"
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket"
import os from "os"
import http from "node:http"

export class AutomergeServer {
  wsServer: WebSocketServer;
  repo: Repo;

  constructor(public readonly httpServer: http.Server, public readonly path: string) {
    var hostname = os.hostname()

    this.wsServer = new WebSocketServer({ server: httpServer, path })

    this.repo = new Repo({
      network: [new NodeWSServerAdapter(this.wsServer)],
      peerId: `engine-${hostname}` as PeerId,
      sharePolicy: async () => false,
    })

    if (false) {
      this.repo.addListener("document", ({handle, isNew}) => {
        handle.on("change", (payload) => {
          console.log("doc changed", payload.doc)
          console.log("patch info", payload.patchInfo)
          console.log("patches", payload.patches)
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

export function changeAt<T, U>(doc: DocHandle<T>, selector: (doc: T) => U): DocHandle<U>["change"] {
  return (changeFn) => {
    doc.change((doc) => {
      const value = selector(doc);
      changeFn(value);
    });
  };
}
