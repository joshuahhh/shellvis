import { weakMapCache } from '@engraft/shared/lib/cache.js';

export function last<T>(arr: T[]): T;
export function last(arr: string): string;
export function last<T>(arr: T[] | string): T | string {
  return arr[arr.length - 1];
}

export const rangeIncl = (start: number, stop: number, step = 1) =>
  Array.from({ length: (stop - start) / step + 1}, (_, i) => start + (i * step));

export function isObject(obj: any): boolean {
  return obj !== null && typeof obj === 'object';
}

export function FATAL(...args: any[]): never {
  console.error('FATAL', ...args);
  process.exit(1);
}

export function weakMapCache2<Arg1 extends object, Arg2 extends object, Return>(
  f: (arg1: Arg1, arg2: Arg2) => Return
): (arg1: Arg1, arg2: Arg2) => Return {
  const cachedF = weakMapCache((arg1: Arg1) => weakMapCache((arg2: Arg2) => f(arg1, arg2)));
  return (arg1: Arg1, arg2: Arg2) => cachedF(arg1)(arg2);
}

// from https://2ality.com/2019/11/nodejs-streams-async-iteration.html
export async function* chunksToLines(chunkIterable: AsyncIterable<string>): AsyncGenerator<string, void, undefined> {
  let previous = '';
  for await (const chunk of chunkIterable) {
    let startSearch = previous.length;
    previous += chunk;
    while (true) {
      const eolIndex = previous.indexOf('\n', startSearch);
      if (eolIndex < 0) break;
      // line includes the EOL
      const line = previous.slice(0, eolIndex+1);
      yield line;
      previous = previous.slice(eolIndex+1);
      startSearch = 0;
    }
  }
  if (previous.length > 0) {
    yield previous;
  }
}

export async function nextAsserted(ait: AsyncIterator<string, void>, msg?: string): Promise<string> {
  const result = await ait.next();
  if (!result.done) {
    return result.value;
  } else {
    throw new Error(msg ?? 'nextAsserted hit end of stream');
  }
}

export async function joinIterable(ait: AsyncIterable<string>): Promise<string> {
  const result: string[] = [];
  for await (const chunk of ait) {
    result.push(chunk);
  }
  return result.join('');
}
