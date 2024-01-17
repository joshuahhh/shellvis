export type ParseError = {
  Error(): String,
}

// const excludedSuffixes = ["Pos", "End"];
const excludedSuffixes: string[] = [];

const excludedKeys: {[key: string]: true} = {
  '__internal_object__': true,
  End: true,
  Lit: true,
  ValuePos: true,
  ValueEnd: true,
};

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
      ) {
        toReturn[propName] = expandObject(obj[propName]);
      }
    }

    if (toReturn.$type.endsWith('*Pos')) {
      toReturn = {
        __line__: toReturn.Line.__return_value__,
        // __position__: toReturn.Offset.__return_value__
      };
    }

    return toReturn;
  } else if (obj instanceof Array) {
    return obj.map(expandObject);
  } else {
    return obj;
  }
}
