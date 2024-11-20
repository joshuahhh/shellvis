import { RawString } from "@automerge/automerge-repo";
import { Stats } from "node:fs";
import * as fsP from "node:fs/promises";
import * as path from "node:path";
import { DeltaLogEntry } from "../shared/execution.js";
import { normalizeIndent } from "../shared/normalizeIndent.js";
import { exec } from "./exec.js";
import { SandboxLayerBase, statOrNull } from "./sandbox-base.js";
import { SandboxLayer } from "./sandbox.js";

function isWhiteoutFile(stats: Stats) {
  // The relevant line from try is:
  //   [ -c "$file" ] && ! [ -s "$file" ] && [ "$(stat -c %t,%T "$file")" = "0,0" ]
  // #3 is the weird one. %t & %T are `major (statbuf->st_rdev)` & `minor
  // (statbuf->st_rdev)`, respectively. Pretty sure that means we can just check
  // rdev.
  return stats.isCharacterDevice() && stats.size === 0 && stats.rdev === 0;
}

export class SandboxLayerLinux
  extends SandboxLayerBase
  implements SandboxLayer
{
  workDir: string;

  constructor(
    public lowerDir: string,
    public layerDir: string,
  ) {
    super(lowerDir, layerDir);
    this.workDir = path.join(this.layerDir, "work");
  }

  async make() {
    await Promise.all([
      fsP.mkdir(this.upperDir),
      fsP.mkdir(this.unionDir),
      fsP.mkdir(this.workDir),
    ]);

    console.log("made dirs:");
    console.log(this.upperDir);
    console.log(this.unionDir);
    console.log(this.workDir);

    const mountCmd = normalizeIndent`
      mount -t overlay \\
        -o lowerdir=${this.lowerDir},upperdir=${this.upperDir},workdir=${this.workDir} \\
        overlay \\
        ${this.unionDir}
    `;

    console.log("gonna run:");
    console.log(mountCmd);

    await exec(mountCmd);

    console.log("ran mount");

    return this;
  }

  async unmountDir(dir: string) {
    // TODO: investigate how robust this is
    await exec(`umount ${dir}`);
  }

  async analyzeChanges(): Promise<DeltaLogEntry[]> {
    // stage 1: get changed files from upper dir

    const changedFiles = (
      await exec(
        String.raw`find "${this.upperDir}" -type f -o \( -type c -size 0 \) -o -type d -o -type l`,
      )
    ).stdout
      .split("\n")
      .filter((line) => line !== "");

    // stage 2: turn changed files into commands to apply

    const deltaLog: DeltaLogEntry[] = [];
    for (const file of changedFiles) {
      const pathInUpper = path.relative(this.upperDir, file);
      const pathInLower = path.join(this.lowerDir, pathInUpper);

      const stats = await fsP.stat(file);
      if (isWhiteoutFile(stats)) {
        const lowerStats = await fsP.stat(pathInLower);
        const event = lowerStats.isDirectory() ? "deletedDir" : "deletedFile";
        deltaLog.push({ event, path: pathInUpper });
      } else if (stats.isDirectory()) {
        const lowerStats = await statOrNull(pathInLower);
        if (lowerStats) {
          if (!lowerStats.isDirectory()) {
            deltaLog.push({ event: "deletedFile", path: pathInUpper });
            deltaLog.push({ event: "newDir", path: pathInUpper });
          } else {
            // no change
          }
        } else {
          deltaLog.push({ event: "newDir", path: pathInUpper });
        }
      } else {
        // non-whiteout file
        const lowerStats = await statOrNull(pathInLower);
        if (lowerStats) {
          if (lowerStats.isFile()) {
            deltaLog.push({
              event: "modifiedFile",
              path: pathInUpper,
              oldContents: new RawString(
                await fsP.readFile(pathInLower, "utf8"),
              ),
              newContents: new RawString(
                await fsP.readFile(pathInUpper, "utf8"),
              ),
            });
          } else {
            deltaLog.push({ event: "dirReplacedWithFile", path: pathInUpper });
          }
        } else {
          deltaLog.push({ event: "newFile", path: pathInUpper });
        }
      }
    }

    return deltaLog;
  }

  static async getActiveMounts() {
    const mount = await exec("mount");
    return mount.stdout
      .split("\n")
      .filter((line) => line.startsWith("overlay"))
      .map((line) => line.match(/on ([^ ]+)/)![1]);
  }
}

async function getFstype(p: string): Promise<string> {
  const dfStdout = (await exec(`df "${p}" --output=fstype`)).stdout;
  const dfLines = dfStdout.split("\n");
  if (dfLines[0] !== "Type") {
    throw new Error(`unexpected output from df; first line is ${dfLines[0]}`);
  }
  return dfLines[1];
}

export async function canBeSandboxedLinux(p: string) {
  const fstype = await getFstype(p);
  return fstype !== "overlay";
}
