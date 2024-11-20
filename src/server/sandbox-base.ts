import { Stats } from "node:fs";
import * as fsP from "node:fs/promises";
import * as path from "node:path";
import { DeltaLogEntry } from "../shared/execution.js";
import { SandboxLayer, isMountPoint } from "./sandbox.js";

export async function statOrNull(path: string): Promise<Stats | null> {
  try {
    return await fsP.stat(path);
  } catch {
    return null;
  }
}

export abstract class SandboxLayerBase implements SandboxLayer {
  unionDir: string;
  upperDir: string;

  constructor(
    public lowerDir: string,
    public layerDir: string,
  ) {
    this.unionDir = path.join(this.layerDir, "union");
    this.upperDir = path.join(this.layerDir, "upper");
  }

  getUnionDir() {
    return this.unionDir;
  }

  abstract make(): Promise<this>;

  async remove() {
    while (true) {
      if (!(await isMountPoint(this.unionDir))) {
        break;
      }
      try {
        await this.unmountDir(this.unionDir);
        break;
      } catch (e) {
        // wait and retry
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    await fsP.rm(this.layerDir, { recursive: true, force: true });
  }

  abstract unmountDir(dir: string): Promise<void>;

  abstract analyzeChanges(): Promise<DeltaLogEntry[]>;

  async applyDeltaLogEntry(entry: DeltaLogEntry) {
    switch (entry.event) {
      case "deletedDir":
        await fsP.rm(path.join(this.lowerDir, entry.path), {
          recursive: true,
          force: true,
        });
        break;
      case "deletedFile":
        await fsP.rm(path.join(this.lowerDir, entry.path));
        break;
      case "newDir":
        await fsP.mkdir(path.join(this.lowerDir, entry.path), {
          recursive: true,
        });
        break;
      case "modifiedFile":
        await fsP.copyFile(
          path.join(this.upperDir, entry.path),
          path.join(this.lowerDir, entry.path),
        );
        break;
      case "dirReplacedWithFile":
        await fsP.rm(path.join(this.lowerDir, entry.path), {
          recursive: true,
          force: true,
        });
        await fsP.copyFile(
          path.join(this.upperDir, entry.path),
          path.join(this.lowerDir, entry.path),
        );
        break;
      case "newFile":
        await fsP.copyFile(
          path.join(this.upperDir, entry.path),
          path.join(this.lowerDir, entry.path),
        );
        break;
    }
  }

  async clear() {
    // TODO: We could do this cleanup after afterRun, obviating the need for beforeRun entirely.
    //       For now, I'm leaving this here, for flexibility's sake.
    for (const file of await fsP.readdir(this.upperDir)) {
      await fsP.rm(path.join(this.upperDir, file), {
        recursive: true,
        force: true,
      });
    }
  }
}
