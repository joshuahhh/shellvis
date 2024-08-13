import http from "node:http";
import { WebSocketServer } from "ws";

// supposedly you can call `new WebSocketServer({ server, path })`
// but I'm having weird protocol errors with that
// and this seems to work?

export function connectWsServer(
  wsServer: WebSocketServer,
  httpServer: http.Server,
  path: string,
) {
  httpServer.on("upgrade", (request, socket, head) => {
    if (request.url === path) {
      wsServer.handleUpgrade(request, socket, head, (client) => {
        wsServer.emit("connection", client, request);
      });
    }
  });
}
