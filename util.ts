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
