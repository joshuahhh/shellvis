export type WebSocketListenerEvent = Event & (
  | { type: 'message', data: string }
);

// TODO: make this typed
export class WebSocketListener extends EventTarget {
  ws: WebSocket | null = null;
  timeout: NodeJS.Timeout | null = null;

  constructor(readonly url: string) {
    super();
    this.connect();
  }

  connect() {
    console.log('Connecting...');
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('Socket connected');
    };

    this.ws.onmessage = (e) => {
      this.dispatchEvent(new MessageEvent('message', { data: e.data }));
    };

    this.ws.onclose = (e) => {
      console.log('Socket is closed. Reconnect will be attempted in 1 second.', e.reason);
      this.timeout = setTimeout(() => {
        this.connect();
      }, 1000);
      // TODO: report status
    };

    this.ws.onerror = (err) => {
      // console.error('Socket encountered error: ', err, 'Closing socket');
      this.ws?.close();
    };
  }

  close() {
    this.ws?.close();
    if (this.timeout !== null) {
      clearTimeout(this.timeout);
    }
  }
}
