import { weakMapCache } from "@engraft/shared/lib/cache.js";

export const rangeIncl = (start: number, stop: number, step = 1) =>
  Array.from({ length: (stop - start) / step + 1}, (_, i) => start + (i * step));

export function isObject(obj: any): boolean {
  return obj !== null && typeof obj === 'object';
}

export function FATAL(...args: any[]): never {
  console.error("FATAL", ...args);
  process.exit(1);
}

export const __dirname = new URL('.', import.meta.url).pathname;

export function weakMapCache2<Arg1 extends object, Arg2 extends object, Return>(
  f: (arg1: Arg1, arg2: Arg2) => Return
): (arg1: Arg1, arg2: Arg2) => Return {
  const cachedF = weakMapCache((arg1: Arg1) => weakMapCache((arg2: Arg2) => f(arg1, arg2)));
  return (arg1: Arg1, arg2: Arg2) => cachedF(arg1)(arg2);
}
