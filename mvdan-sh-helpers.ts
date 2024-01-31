import sh from "mvdan-sh";
import { type Node } from "mvdan-sh";

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

export function posStr(pos: sh.Pos): string {
  return pos.Line() + '_' + pos.Col();
}

export function getNodeId(node: Node): string {
  return posStr(node.Pos()) + '_' + posStr(node.End());
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
      toReturn.__span__ = getNodeId(obj);
    }

    return toReturn;
  } else if (obj instanceof Array) {
    return obj.map(expandObject);
  } else {
    return obj;
  }
}

enum EnterResponse { Continue, Skip, Abort }

enum ExitResponse { Continue, Abort }

type Walker = {
  enter?(node: sh.Node, ancestors: sh.Node[]): EnterResponse | void | (() => void),
  exit?(node: sh.Node, ancestors: sh.Node[]): ExitResponse | void,
}

export function myWalk (
  node: sh.Node,
  walker: Walker,
): void {
  let ancestors: sh.Node[] = [];
  let aborted = false;
  let finalizers: Map<sh.Node, () => void> = new Map();

  sh.syntax.Walk(node, (node: sh.Node | null) => {
    if (aborted) {
      return false;
    }

    if (node !== null) {
      // entering
      const response = walker.enter ? walker.enter(node, ancestors) : EnterResponse.Continue;
      if (response === EnterResponse.Abort) {
        aborted = true;
        return false;
      } else if (response === EnterResponse.Skip) {
        return false;
      } else if (response === EnterResponse.Continue || response === undefined || typeof response === 'function') {
        ancestors.push(node);
        if (typeof response === 'function') {
          finalizers.set(node, response);
        }
        return true;
      } else {
        throw new Error(`unknown EnterResponse ${response}`);
      }
    } else {
      // exiting
      const exitedNode = ancestors.pop()!;
      const finalizer = finalizers.get(exitedNode);
      if (finalizer) {
        finalizer();
        finalizers.delete(exitedNode);
      }
      const response = walker.exit ? walker.exit(exitedNode, ancestors) : ExitResponse.Continue;
      if (response === ExitResponse.Abort) {
        aborted = true;
      }
      return true;  // meaningless but required by API
    }
  });
}

// we can't even clone parsed nodes, so no use trying to cache the parsed template
// make sure that templateStr is a bare command, no top-level redirects or nothing
// (cuz we need to take on stmt's redirects!)
export function wrapStmt(parser: sh.Parser, stmt: sh.Stmt, templateStr: string): void {
  const templateNode = parser.Parse(templateStr, "template");

  // now we walk, looking for the smallest statement containing ___
  myWalk(templateNode, {
    enter(node, ancestors) {
      if (sh.syntax.NodeType(node) === "Lit" && (node as sh.Lit).Value === "___") {
        for (let i = ancestors.length - 1; i >= 0; i--) {
          const node = ancestors[i];
          if (sh.syntax.NodeType(node) === "Stmt") {
            const foundStmt = node as sh.Stmt;
            foundStmt.Cmd = stmt.Cmd;
            return EnterResponse.Abort;
          }
        }
        throw new Error("found ___ outside of Stmt");
      }
    }
  });

  stmt.Cmd = templateNode.Stmts[0]!.Cmd;
}
