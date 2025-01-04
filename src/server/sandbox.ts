import * as fsP from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DeltaLogEntry } from "../shared/execution.js";
import { SandboxLayerLinux } from "./sandbox-linux.js";
import { SandboxLayerMac } from "./sandbox-mac.js";
import { statOrNull } from "./util.js";

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

// A "sandbox layer" is a single invocation of UnionFS/OverlayFS.
// ShellVis uses two sandbox layers: one to protect the original FS,
// and a second to isolate individual commands for tracing.
export interface SandboxLayer {
  getUnionDir(): string;
  make(): Promise<this>;
  remove(): Promise<void>;
  clear(): Promise<void>;
  analyzeChanges(): Promise<DeltaLogEntry[]>;
  applyDeltaLogEntry(entry: DeltaLogEntry): Promise<void>;
}

type SandboxLayerConstructor = {
  new (props: { lowerDir: string; layerDir: string }): SandboxLayer;
  getActiveMounts(): Promise<string[]>;
  canBeSandboxed(dir: string): Promise<boolean>;
};

export const SandboxLayerImpl: SandboxLayerConstructor =
  process.platform === "linux" ? SandboxLayerLinux : SandboxLayerMac;

// -------------
// SANDBOX STUFF
// -------------

// a sandbox is two sandbox layers!

export type Sandbox = {
  protectLayer: SandboxLayer;
  deltaLayer: SandboxLayer;
};

export async function makeSandbox(rootDir = "/"): Promise<Sandbox> {
  if (!(await SandboxLayerImpl.canBeSandboxed(rootDir))) {
    throw new Error(`can't sandbox ${rootDir}`);
  }

  const protectLayer = await new SandboxLayerImpl({
    lowerDir: rootDir,
    layerDir: await mkTmpDir("sandbox-"),
  }).make();
  const deltaLayer = await new SandboxLayerImpl({
    lowerDir: protectLayer.getUnionDir(),
    layerDir: await mkTmpDir("delta-"),
  }).make();

  return { protectLayer, deltaLayer };
}

export async function removeSandbox(sandbox: Sandbox) {
  await sandbox.deltaLayer.remove();
  await sandbox.protectLayer.remove();
}

export async function beforeRun(sandbox: Sandbox) {
  await sandbox.deltaLayer.clear();
}

export async function afterRun(sandbox: Sandbox): Promise<DeltaLogEntry[]> {
  const deltaLog = await sandbox.deltaLayer.analyzeChanges();
  for (const entry of deltaLog) {
    await sandbox.deltaLayer.applyDeltaLogEntry(entry);
  }
  return deltaLog;
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
  const deltaUnionDir = sandbox.deltaLayer.getUnionDir();
  // console.log(`pathInSandbox`, path, deltaUnionDir);
  if (!path.startsWith(deltaUnionDir)) {
    // console.log(`path ${path} not in sandbox ${deltaUnionDir}`);
    return null;
  }
  return path.slice(deltaUnionDir.length);
}
