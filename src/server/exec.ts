import * as child_process from "node:child_process";
import * as util from "node:util";

// sick and tired of recreating this every 5 minutes
export const exec = util.promisify(child_process.exec);
