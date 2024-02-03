// @ts-check
import fs from "fs"
import express from "express"
import { WebSocketServer } from "ws"
import { DocHandle, PeerId, Repo } from "@automerge/automerge-repo"
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket"
import os from "os"
import http from "http"

export class AutomergeServer {
  socket: WebSocketServer;
  server: http.Server;
  repo: Repo;


  constructor() {
    var hostname = os.hostname()

    this.socket = new WebSocketServer({ noServer: true })

    const PORT =
      process.env.PORT !== undefined ? parseInt(process.env.PORT) : 3030
    const app = express()
    app.use(express.static("public"))

    this.repo = new Repo({
      network: [new NodeWSServerAdapter(this.socket)],
      peerId: `storage-server-${hostname}` as PeerId,
      // Since this is a server, we don't share generously — meaning we only sync documents they already
      // know about and can ask for by ID.
      sharePolicy: async () => false,
    })

    app.get("/", (req, res) => {
      res.send(`👍 @automerge/example-sync-server is running`)
    })

    this.server = app.listen(PORT, () => {
      console.log(`Automerge server listening on port ${PORT}`)
      // this.#readyResolvers.forEach((resolve) => resolve(true))
    })

    this.server.on("upgrade", (request, socket, head) => {
      // console.log("upgrade request", request.url);
      this.socket.handleUpgrade(request, socket, head, (socket) => {
        // console.log("upgrade request callback")
        this.socket.emit("connection", socket, request)
      })
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
    this.socket.close()
    this.server.close()
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
