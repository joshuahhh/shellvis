import { assertNever } from '@engraft/shared/lib/assert.js';


// adapted from clsx, natch

type ClassValue = ClassArray | ClassDictionary | string | null | false | undefined;
type ClassDictionary = Record<string, any>;
type ClassArray = ClassValue[];

function toClassStr(val: ClassValue): string {
  if (!val) {
    return '';
  } else if (typeof val === 'string') {
		return cleanString(val);
	} else if (typeof val === 'object') {
		if (Array.isArray(val)) {
      let res = '';
      for (const item of val) {
				const itemStr = toClassStr(item);
        if (itemStr) {
          res && (res += ' ');
          res += itemStr;
        }
			}
      return res;
		} else {
      let res = '';
			for (const key in val) {
				if (val[key]) {
					res && (res += ' ');
					res += key;
				}
			}
      return res;
		}
	} else {
    assertNever(val);
  }
}

export function cleanString(str: string): string {
  return str
    .trim()
    .replace(/\/\/.*/g, '')  // remove "//" comments
    .replace(/\s+/g, ' ');  // remove extra whitespace
}

export function isTemplateStringsArray(val: any): val is TemplateStringsArray {
  return Array.isArray(val) && 'raw' in val;
}

export function clsyTemplate(strings: TemplateStringsArray, vals: ClassValue[]): string {
  let res = '';
  for (let i = 0; i < strings.length; i++) {
    res += strings[i];
    if (i < vals.length) {
      res += toClassStr(vals[i]);
    }
  }
  return cleanString(res);
}

export function clsy(...vals: ClassValue[]): string;
export function clsy(templateStrings: TemplateStringsArray, ...vals: ClassValue[]): string;
export function clsy(first: ClassValue | TemplateStringsArray, ...vals: ClassValue[]): string {
  if (isTemplateStringsArray(first)) {
    return clsyTemplate(first, vals);
  }

  vals.unshift(first);

  let res = '';
  for (const val of vals) {
    const valStr = toClassStr(val);
    if (valStr) {
      res && (res += ' ');
      res += valStr;
    }
  }
  return res;
}
