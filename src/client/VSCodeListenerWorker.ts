import { WebSocketListener } from "./WebSocketListener.js";

// eslint-disable-next-line no-restricted-globals
const workerGlobal = self as unknown as SharedWorkerGlobalScope;

workerGlobal.onconnect = function (event) {

  const port = event.ports[0];

  // listen to websockets and
  const onWSMessage = (e: MessageEvent<string>) => {
    port.postMessage(e.data);
  };

  const wsListeners: WebSocketListener[] = [];
  for (let i = 5900; i < 5905; i++) {
    const listener = new WebSocketListener(`ws://localhost:${i}`);
    listener.addEventListener('message', onWSMessage);
    wsListeners.push(listener);
  }

  // port.onmessage = function (e) {
  //   if (e.data === "close") {
  //     workerGlobal.close();
  //   }
  // };
};
