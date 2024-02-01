export const rangeIncl = (start: number, stop: number, step = 1) =>
  Array.from({ length: (stop - start) / step + 1}, (_, i) => start + (i * step));

export function isObject(obj: any): boolean {
  return obj !== null && typeof obj === 'object';
}
