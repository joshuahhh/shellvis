import { TypedEventTarget } from '../shared/TypedEventTarget.js';


// we put the actual listening in a worker because otherwise there's no way to
// make the console shut up about websocket connection problems. I am sorry
// about this.

type EventMap = {
  message: MessageEvent<string>,
};

export class VSCodeListener extends (EventTarget as TypedEventTarget<EventMap>) {
  private worker: SharedWorker;

  constructor() {
    super();

    this.worker = new SharedWorker(
      new URL('VSCodeListenerWorker.js', import.meta.url),
      { name: 'VSCodeListenerWorker', type: 'module' }
    );

    this.worker.port.addEventListener('message', (e) => {
      this.dispatchEvent(new MessageEvent('message', { data: e.data }));
    });

    this.worker.port.start();
  }

  // close() {
  //   this.worker.port.postMessage('close');
  // }
}
