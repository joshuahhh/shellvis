import { Node } from "mvdan-sh";

export type ParseError = {
  Error(): String,
}

const excludedSuffixes = ["Pos", "End"];
// const excludedSuffixes: string[] = [];

const excludedKeys: {[key: string]: true} = {
  '__internal_object__': true,
  // End: true,
  // Lit: true,
  // ValuePos: true,
  // ValueEnd: true,
};

const excludedTypes: {[key: string]: true} = {
  'mvdan.cc/sh/v3/syntax.*Pos': true,
}

function isObject(obj: any): boolean {
  return obj !== null && typeof obj === 'object';
}

export function isNode(maybeNode: any): maybeNode is Node {
  return maybeNode !== null && typeof maybeNode === 'object' && '__internal_object__' in maybeNode && 'Pos' in maybeNode && 'End' in maybeNode;
}

export function nodeSpan(node: Node): string {
  return node.Pos().String() + '-' + node.End().String();
}

export function expandObject(obj: any): any {
  if (typeof obj === 'function') {
    try {
      return { __return_value__: expandObject(obj()) };
    } catch (e) {
      return { __cannot_call__: true };
    }
  } else if (obj !== null && typeof obj === 'object' && '__internal_object__' in obj) {
    const propNames = Object.getOwnPropertyNames(obj);
    let toReturn: any = {};
    for (const propName of propNames) {
      if (
        excludedSuffixes.every((suffix) => !propName.endsWith(suffix))
        && !excludedKeys[propName]
        && !(isObject(obj[propName]) && excludedTypes[obj[propName].$type])
      ) {
        toReturn[propName] = expandObject(obj[propName]);
      }
    }

    if (isNode(obj)) {
      toReturn.__span__ = nodeSpan(obj);
    }

    return toReturn;
  } else if (obj instanceof Array) {
    return obj.map(expandObject);
  } else {
    return obj;
  }
}
