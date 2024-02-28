import { AutomergeUrl } from "@automerge/automerge-repo";
import chokidar from "chokidar";
import * as fs from "node:fs";
import { AutomergeServer } from "./automerge.js";
import { Run } from "./run.js";
import path from "node:path";
import { RunParams, ScriptWatcherParams } from "../shared/types.js";


// ScriptWatcher is a process that watches a script file and re-runs it when it changes

export class ScriptWatcher {
  currentRun: Run | null = null;

  constructor(
    readonly params: ScriptWatcherParams,
    readonly automergeServer: AutomergeServer,
    readonly onNewTrace?: (traceUrl: AutomergeUrl) => void
  ) {
    // TODO: this is so that we ultimately put an absolute path into the trace
    this.params.path = path.resolve(this.params.path);
    chokidar.watch(this.params.path).on('all', (event, path) => {
      this._onFile();
    });
  }

  async _onFile() {
    if (this.currentRun) {
      await this.currentRun.stop();
    }

    const scriptStr = fs.readFileSync(this.params.path, { encoding: 'utf-8' });
    const runParams: RunParams = {
      ...this.params,
      scriptSrc: scriptStr,
    }
    this.currentRun = new Run(runParams, this.automergeServer);
    this.currentRun.start();
    this.onNewTrace && this.onNewTrace(this.currentRun.traceDoc.url);
  }
}
