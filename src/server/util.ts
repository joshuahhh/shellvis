import * as child_process from "node:child_process";
import { Stats } from "node:fs";
import * as fsP from "node:fs/promises";
import * as util from "node:util";

export const exec = util.promisify(child_process.exec);

export async function statOrNull(path: string): Promise<Stats | null> {
  try {
    return await fsP.stat(path);
  } catch {
    return null;
  }
}
