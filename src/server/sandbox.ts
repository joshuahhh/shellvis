import { RawString } from "@automerge/automerge-repo";
import { isBinaryFile } from "isbinaryfile";
import * as child_process from "node:child_process";
import { Stats } from "node:fs";
import * as fsP from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as util from "node:util";
import { DeltaLogEntry } from "../shared/execution.js";

const exec = util.promisify(child_process.exec);

export async function statOrNull(path: string): Promise<Stats | null> {
  try {
    return await fsP.stat(path);
  } catch {
    return null;
  }
}

export async function isMountPoint(p: string): Promise<boolean> {
  // The root directory is always a mount point
  if (p === path.parse(p).root) {
    return true;
  }

  // If the device ID is different from its parent, then it's a mount point
  const stats = await statOrNull(p);
  if (!stats) {
    return false;
  } // if it doesn't exist, it's not a mount point
  const parentStats = await statOrNull(path.dirname(p));
  return stats.dev !== parentStats?.dev;
}

export async function mkTmpDir(prefix?: string) {
  const tmpdir = os.tmpdir();
  const unreal = await fsP.mkdtemp(prefix ? path.join(tmpdir, prefix) : tmpdir);
  return await fsP.realpath(unreal);
}

// --------------------
// GENERAL SYSTEM STUFF
// --------------------

function getUpperDir(systemDir: string) {
  return path.join(systemDir, "upper");
}

function getUnionDir(systemDir: string) {
  return path.join(systemDir, "union");
}

export async function makeSystem(systemDir: string, rootDir: string) {
  const upperDir = getUpperDir(systemDir);
  const unionDir = getUnionDir(systemDir);

  await Promise.all([fsP.mkdir(upperDir), fsP.mkdir(unionDir)]);

  await exec(`unionfs -o cow ${upperDir}=rw:${rootDir}=ro ${unionDir}`);
}

export async function removeSystem(systemDir: string) {
  const unionDir = getUnionDir(systemDir);

  while (true) {
    if (!(await isMountPoint(unionDir))) {
      break;
    }
    try {
      // TODO: force unmount seems necessary to, say, get around daemons. is it ok?
      await exec(`diskutil unmount force ${unionDir}`);
      break;
    } catch {
      // wait and retry
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  await fsP.rm(systemDir, { recursive: true, force: true });
}

// -------------
// SANDBOX STUFF
// -------------

// a sandbox is two UnionFS systems!

export type Sandbox = {
  sandboxDir: string;
  sandboxUnionDir: string;
  deltaDir: string;
  deltaUnionDir: string;
};

export async function makeSandbox(rootDir = "/"): Promise<Sandbox> {
  const sandboxDir = await mkTmpDir("sandbox-");
  const sandboxUnionDir = path.join(sandboxDir, "union");
  const deltaDir = await mkTmpDir("delta-");
  const deltaUnionDir = path.join(deltaDir, "union");

  await makeSystem(sandboxDir, rootDir);
  await makeSystem(deltaDir, sandboxUnionDir);

  return { sandboxDir, sandboxUnionDir, deltaDir, deltaUnionDir };
}

export async function removeSandbox(sandbox: Sandbox) {
  await removeSystem(sandbox.deltaDir);
  await removeSystem(sandbox.sandboxDir);
}

export async function beforeRun(sandbox: Sandbox) {
  // TODO: We could do this cleanup after afterRun, obviating the need for beforeRun entirely.
  //       For now, I'm leaving this here, for flexibility's sake.
  const upperDir = getUpperDir(sandbox.deltaDir);
  await fsP.rm(upperDir, { recursive: true, force: true });
  // TODO: catch is here because of race conditions with concurrent runs;
  //       we really just shouldn't have concurrent runs someday
  await fsP.mkdir(upperDir).catch(() => null);
}

export async function afterRun(sandbox: Sandbox): Promise<DeltaLogEntry[]> {
  // stage 1: walk delta's upper dir for changed files

  const upperDir = getUpperDir(sandbox.deltaDir);

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
      path.join(upperDir, pathInUpper),
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
      path.join(upperDir, ".unionfs", pathInUpperMeta),
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
  const upperMetaStat = await statOrNull(path.join(upperDir, ".unionfs"));
  if (upperMetaStat?.isDirectory()) {
    await walkDeletions("");
  }

  // TODO: looks like unionfs can have a _HIDDEN~ marker parallel to a modified marker; weird?
  deletedDirs = deletedDirs.filter((dir) => !presentDirs.includes(dir));
  deletedFiles = deletedFiles.filter((file) => !presentFiles.includes(file));

  // stage 2: turn changed files into commands to apply

  const sandboxUnionDir = getUnionDir(sandbox.sandboxDir);

  let deltaLog: DeltaLogEntry[] = [];
  for (const dir of deletedDirs) {
    deltaLog.push({ event: "deletedDir", path: dir });
  }
  for (const file of deletedFiles) {
    deltaLog.push({ event: "deletedFile", path: file });
  }
  for (const dir of presentDirs) {
    if (!(await statOrNull(path.join(sandboxUnionDir, dir)))?.isDirectory()) {
      deltaLog.push({ event: "newDir", path: dir });
    }
  }
  for (const file of presentFiles) {
    const oldPath = path.join(sandboxUnionDir, file);
    const fileStat = await statOrNull(oldPath);
    if (!fileStat) {
      deltaLog.push({ event: "newFile", path: file });
    } else if (fileStat.isFile()) {
      const newPath = path.join(upperDir, file);
      const oldAndNewAreText =
        !(await isBinaryFile(oldPath)) && !(await isBinaryFile(newPath));
      deltaLog.push({
        event: "modifiedFile",
        path: file,
        oldContents: oldAndNewAreText
          ? new RawString(await fsP.readFile(oldPath, "utf8"))
          : null,
        newContents: oldAndNewAreText
          ? new RawString(await fsP.readFile(newPath, "utf8"))
          : null,
      });
    } else if (fileStat.isDirectory()) {
      deltaLog.push({ event: "dirReplacedWithFile", path: file });
    }
  }

  // stage 3: apply commands

  for (const entry of deltaLog) {
    await applyDeltaLogEntry(entry, upperDir, sandboxUnionDir);
  }

  return deltaLog;
}

async function applyDeltaLogEntry(
  entry: DeltaLogEntry,
  upperDir: string,
  sandboxUnionDir: string,
) {
  switch (entry.event) {
    case "deletedDir":
      await fsP.rm(path.join(sandboxUnionDir, entry.path), {
        recursive: true,
        force: true,
      });
      break;
    case "deletedFile":
      await fsP.rm(path.join(sandboxUnionDir, entry.path));
      break;
    case "newDir":
      await fsP.mkdir(path.join(sandboxUnionDir, entry.path), {
        recursive: true,
      });
      break;
    case "modifiedFile":
      await fsP.copyFile(
        path.join(upperDir, entry.path),
        path.join(sandboxUnionDir, entry.path),
      );
      break;
    case "dirReplacedWithFile":
      await fsP.rm(path.join(sandboxUnionDir, entry.path), {
        recursive: true,
        force: true,
      });
      await fsP.copyFile(
        path.join(upperDir, entry.path),
        path.join(sandboxUnionDir, entry.path),
      );
      break;
    case "newFile":
      await fsP.copyFile(
        path.join(upperDir, entry.path),
        path.join(sandboxUnionDir, entry.path),
      );
      break;
  }
}

export function makeDeltaLogEntryAbsolute(
  entry: DeltaLogEntry,
  rootDir: string,
): DeltaLogEntry {
  return {
    ...entry,
    path: path.join(rootDir, entry.path),
  };
}

// null if path is not in sandbox
export function pathInSandbox(path: string, sandbox: Sandbox): string | null {
  if (!path.startsWith(sandbox.deltaUnionDir)) {
    return null;
  }
  return path.slice(sandbox.deltaUnionDir.length);
}

export async function getUnionFSMounts(): Promise<string[]> {
  const mount = await exec("mount");
  return mount.stdout
    .split("\n")
    .filter((line) => line.startsWith("unionfs@"))
    .map((line) => line.match(/on ([^ ]+)/)![1]);
}
