import { AutomergeUrl } from "@automerge/automerge-repo";
import chokidar from "chokidar";
import * as fs from "node:fs";
import { AutomergeServer } from "./automerge.js";
import { Run } from "./run.js";


// ScriptWatcher is a process that watches a script file and re-runs it when it changes

export class ScriptWatcher {
  currentRun: Run | null = null;

  constructor(
    readonly path: string,
    readonly automergeServer: AutomergeServer,
    readonly onNewTrace?: (traceUrl: AutomergeUrl) => void
  ) {
    chokidar.watch(this.path).on('all', (event, path) => {
      this._onFile();
    });
  }

  async _onFile() {
    if (this.currentRun) {
      await this.currentRun.stop();
    }

    const scriptStr = fs.readFileSync(this.path, { encoding: 'utf-8' });
    this.currentRun = new Run(scriptStr, this.automergeServer);
    this.currentRun.start();
    this.onNewTrace && this.onNewTrace(this.currentRun.traceDoc.url);
  }
}
