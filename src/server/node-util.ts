import util from "node:util";

export function inspect<T>(val: T): T {
  console.log(util.inspect(val, { depth: null, colors: true }));
  return val;
}
