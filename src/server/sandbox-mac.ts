import { RawString } from "@automerge/automerge-repo";
import * as fsP from "node:fs/promises";
import path from "node:path";
import { DeltaLogEntry } from "../shared/execution.js";
import { SandboxLayerBase } from "./sandbox-base.js";
import { SandboxLayer } from "./sandbox.js";
import { exec, statOrNull } from "./util.js";

export class SandboxLayerMac extends SandboxLayerBase implements SandboxLayer {
  async make() {
    await Promise.all([fsP.mkdir(this.upperDir), fsP.mkdir(this.unionDir)]);

    await exec(
      `unionfs -o cow ${this.upperDir}=rw:${this.lowerDir}=ro ${this.unionDir}`,
    );

    return this;
  }

  async unmountDir(dir: string) {
    // TODO: force unmount seems necessary to, say, get around daemons. is it ok?
    await exec(`diskutil unmount force ${dir}`);
  }

  async analyzeChanges(): Promise<DeltaLogEntry[]> {
    // stage 1: walk delta's upper dir for changed files

    let deletedDirs: string[] = [];
    let deletedFiles: string[] = [];
    let presentDirs: string[] = [];
    let presentFiles: string[] = [];

    const walkCreationsAndModifications = async (pathInUpper: string) => {
      if (pathInUpper === ".unionfs") {
        return;
      }
      if (pathInUpper !== "") {
        presentDirs.push(pathInUpper);
      }
      for await (const dirent of await fsP.opendir(
        path.join(this.upperDir, pathInUpper),
      )) {
        if (dirent.isDirectory()) {
          await walkCreationsAndModifications(
            path.join(pathInUpper, dirent.name),
          );
        } else if (dirent.isFile()) {
          presentFiles.push(path.join(pathInUpper, dirent.name));
        }
        // TODO: other types?
      }
    };
    await walkCreationsAndModifications("");

    const DELETION_SUFFIX = "_HIDDEN~";
    const walkDeletions = async (pathInUpperMeta: string) => {
      // We can't greedily walk into "my_dir" because there might be a
      // "my_dir_HIDDEN~" which shadows it. So we store up info as we scan, then
      // walk at the end.
      const presentDirsHere = new Set<string>();
      const deletedDirsHere = new Set<string>();
      for await (const dirent of await fsP.opendir(
        path.join(this.upperDir, ".unionfs", pathInUpperMeta),
      )) {
        if (dirent.isFile() && dirent.name.endsWith(DELETION_SUFFIX)) {
          deletedFiles.push(
            path.join(
              pathInUpperMeta,
              dirent.name.slice(0, -DELETION_SUFFIX.length),
            ),
          );
        } else if (dirent.isDirectory()) {
          if (dirent.name.endsWith(DELETION_SUFFIX)) {
            const realName = dirent.name.slice(0, -DELETION_SUFFIX.length);
            deletedDirs.push(path.join(pathInUpperMeta, realName));
            deletedDirsHere.add(realName);
          } else {
            presentDirsHere.add(dirent.name);
          }
        }
      }
      for (const dir of presentDirsHere.values()) {
        if (!deletedDirsHere.has(dir)) {
          await walkDeletions(path.join(pathInUpperMeta, dir));
        }
      }
    };
    const upperMetaStat = await statOrNull(
      path.join(this.upperDir, ".unionfs"),
    );
    if (upperMetaStat?.isDirectory()) {
      await walkDeletions("");
    }

    // TODO: looks like unionfs can have a _HIDDEN~ marker parallel to a modified marker; weird?
    deletedDirs = deletedDirs.filter((dir) => !presentDirs.includes(dir));
    deletedFiles = deletedFiles.filter((file) => !presentFiles.includes(file));

    // stage 2: turn changed files into commands to apply

    let deltaLog: DeltaLogEntry[] = [];
    for (const dir of deletedDirs) {
      deltaLog.push({ event: "deletedDir", path: dir });
    }
    for (const file of deletedFiles) {
      deltaLog.push({ event: "deletedFile", path: file });
    }
    for (const dir of presentDirs) {
      if (!(await statOrNull(path.join(this.lowerDir, dir)))?.isDirectory()) {
        deltaLog.push({ event: "newDir", path: dir });
      }
    }
    for (const file of presentFiles) {
      const pathInLower = path.join(this.lowerDir, file);
      const fileStat = await statOrNull(pathInLower);
      if (!fileStat) {
        deltaLog.push({ event: "newFile", path: file });
      } else if (fileStat.isFile()) {
        const pathInUpper = path.join(this.upperDir, file);
        deltaLog.push({
          event: "modifiedFile",
          path: file,
          oldContents: new RawString(await fsP.readFile(pathInLower, "utf8")),
          newContents: new RawString(await fsP.readFile(pathInUpper, "utf8")),
        });
      } else if (fileStat.isDirectory()) {
        deltaLog.push({ event: "dirReplacedWithFile", path: file });
      }
    }

    return deltaLog;
  }

  static async getActiveMounts() {
    const mount = await exec("mount");
    return mount.stdout
      .split("\n")
      .filter((line) => line.startsWith("unionfs@"))
      .map((line) => line.match(/on ([^ ]+)/)![1]);
  }

  static async canBeSandboxed() {
    return true;
  }
}
