import sh from "mvdan-sh";
import { type Node } from "mvdan-sh";
import { isObject, rangeIncl } from "./util.js";
import { weakMapCache } from "@engraft/shared/lib/cache.js";
import { WebHighlighter } from "../client/WebHighlighter.js";
import { TokenWithSettings } from "./highlight.js";

export type ParseError = {
  Error(): string,
}

export function isNode(maybeNode: any): maybeNode is Node {
  return maybeNode !== null && typeof maybeNode === 'object' && '__internal_object__' in maybeNode && 'Pos' in maybeNode && 'End' in maybeNode;
}

function posStr(pos: sh.Pos): string {
  return pos.Line() + '_' + pos.Col();
}

// TODO: more slow Go stuff; idk
export const getNodeId = weakMapCache(_getNodeId);
function _getNodeId(node: Node): string {
  return sh.syntax.NodeType(node) + "_" + posStr(node.Pos()) + '_' + posStr(node.End());
}

const excludedSuffixes = ["Pos", "End"];
// const excludedSuffixes: string[] = [];

const excludedKeys: {[key: string]: true} = {
  '__internal_object__': true,
  '$type': true,
  // End: true,
  // Lit: true,
  // ValuePos: true,
  // ValueEnd: true,
};

const excludedTypes: {[key: string]: true} = {
  'mvdan.cc/sh/v3/syntax.*Pos': true,
}

export type ExpandObjectOptions = {
  calls?: boolean,
  excludedKeys?: string[],
}

const DROP = Symbol("DROP");

export function expandObject(obj: any, opts: ExpandObjectOptions = {}): any {
  if (typeof obj === 'function') {
    if (!opts.calls) { return DROP; }
    try {
      return { __return_value__: expandObject(obj(), opts) };
    } catch (e) {
      return { __cannot_call__: true };
    }
  } else if (obj !== null && typeof obj === 'object' && '__internal_object__' in obj) {
    const propNames = Object.getOwnPropertyNames(obj);
    let toReturn: any = {};
    if ("$type" in obj) {
      toReturn.Type = obj.$type.match("mvdan.cc/sh/v3/syntax\\.\\*(.*)")[1];
    }
    for (const propName of propNames) {
      if (
        excludedSuffixes.every((suffix) => !propName.endsWith(suffix))
        && !excludedKeys[propName]
        && !(isObject(obj[propName]) && excludedTypes[obj[propName].$type])
      ) {
        const expanded = expandObject(obj[propName], opts);
        if (expanded !== DROP) {
          toReturn[propName] = expanded;
        }
      }
    }

    // if (isNode(obj)) {
    //   toReturn.__span__ = getNodeId(obj);
    // }

    return toReturn;
  } else if (obj instanceof Array) {
    return obj.map((obj) => expandObject(obj, opts));
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
  let templateNode: sh.File;
  try {
    templateNode = parser.Parse(templateStr, "template");
  } catch (e) {
    console.error(e);
    throw new Error((e as ParseError).Error());
  }

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

type NodeTypes = {
  File: sh.File,
  Comment: sh.Comment,
  Stmt: sh.Stmt,
  Assign: sh.Assign,
  Redirect: sh.Redirect,
  CallExpr: sh.CallExpr,
  Subshell: sh.Subshell,
  Block: sh.Block,
  IfClause: sh.IfClause,
  WhileClause: sh.WhileClause,
  ForClause: sh.ForClause,
  WordIter: sh.WordIter,
  CStyleLoop: sh.CStyleLoop,
  BinaryCmd: sh.BinaryCmd,
  FuncDecl: sh.FuncDecl,
  Word: sh.Word,
  Lit: sh.Lit,
  SglQuoted: sh.SglQuoted,
  DblQuoted: sh.DblQuoted,
  CmdSubst: sh.CmdSubst,
  ParamExp: sh.ParamExp,
  ArithmExp: sh.ArithmExp,
  ArithmCmd: sh.ArithmCmd,
  BinaryArithm: sh.BinaryArithm,
  UnaryArithm: sh.UnaryArithm,
  ParenArithm: sh.ParenArithm,
  CaseClause: sh.CaseClause,
  CaseItem: sh.CaseItem,
  TestClause: sh.TestClause,
  BinaryTest: sh.BinaryTest,
  UnaryTest: sh.UnaryTest,
  ParenTest: sh.ParenTest,
  DeclClause: sh.DeclClause,
  ArrayExpr: sh.ArrayExpr,
  ArrayElem: sh.ArrayElem,
  ExtGlob: sh.ExtGlob,
  ProcSubst: sh.ProcSubst,
  TimeClause: sh.TimeClause,
  CoprocClause: sh.CoprocClause,
  LetClause: sh.LetClause,
  BraceExp: sh.BraceExp,
  TestDecl: sh.TestDecl,
}

type AssertTrue<A extends true> = A
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type NodeTypesAreAllNodes = AssertTrue<
  NodeTypes[keyof NodeTypes] extends sh.Node ? true : false
>
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type NodeTypesAreNotJustNodes = AssertTrue<
  sh.Node extends NodeTypes[keyof NodeTypes] ? false : true
>

export function hasNodeType<T extends keyof NodeTypes>(node: sh.Node, nodeType: T): node is NodeTypes[T] {
  return sh.syntax.NodeType(node) === nodeType;
}

export function parseFirstOfType<T extends keyof NodeTypes>(parser: sh.Parser, src: string, nodeType: T): NodeTypes[T] | null {
  const file = parser.Parse(src);
  let foundNode: NodeTypes[T] | null = null;
  myWalk(file, {
    enter(node) {
      if (hasNodeType(node, nodeType)) {
        foundNode = node;
        return EnterResponse.Abort;
      }
    }
  });
  return foundNode;
}

const trackedNodeTypes = [
  "ForClause", "CallExpr", "Stmt"
] satisfies (keyof NodeTypes)[];

// info about immutable src
export class Script {
  ast: sh.File;
  lines: string[];
  lineTree: LineTreeNode[];
  nodesByTypeById: {[Key in (typeof trackedNodeTypes)[number]]: {[id: string]: NodeTypes[Key]}};
  nodesById: {[id: string]: sh.Node} = {};
  tokensByLine: TokenWithSettings[][] | null = null;

  constructor (
    readonly src: string,
    private parser: sh.Parser,
    private highlighter?: WebHighlighter,
  ) {
    try {
      this.ast = this.freshAst();
    } catch (e) {
      throw new Error((e as ParseError).Error());
    }

    this.lines = this.src.split("\n");

    this.lineTree = lineTreeNodesFromAst(this.ast, this.lines);

    if (this.highlighter) {
      this.tokensByLine = this.highlighter.tokenizeLines(this.lines);
    }

    this.nodesByTypeById = Object.fromEntries(trackedNodeTypes.map((nodeType) => [nodeType, {}] as const)) as any;

    myWalk(this.ast, {
      enter: (node) => {
        const nodeId = getNodeId(node);
        this.nodesById[nodeId] = node;
        for (const nodeType of trackedNodeTypes) {
          if (hasNodeType(node, nodeType)) {
            this.nodesByTypeById[nodeType][nodeId] = node;
          }
        }
      }
    });
  }

  srcForNode(node: sh.Node): string {
    const info = nodePosInfo(node);
    return this.src.slice(info.pos.offset, info.end.offset);
  }

  freshAst(): sh.File {
    return this.parser.Parse(this.src);
  }
}

// TODO: this is a performance help cuz the Go stuff is slow; not sure how best to handle this
export const nodePosInfo = weakMapCache((node: sh.Node) => {
  const pos = node.Pos();
  const end = node.End();
  return {
    pos: {
      line: pos.Line(),
      col: pos.Col(),
      offset: pos.Offset(),
    },
    end: {
      line: end.Line(),
      col: end.Col(),
      offset: end.Offset(),
    },
  };
});


// LineTreeNode is the kinda dumb way we handle loops right now.
// It's a static representation of a tree of lines, grouped by loop bodies.

export type LineTreeNode =
  // note: lineNumEnd is exclusive, not inclusive
  // also note: these are 1-indexed line numbers
  { lineNumStart: number, lineNumEnd: number } & (
    | { type: 'line', line: string }
    | { type: 'loop-body', forClause: sh.ForClause, children: LineTreeNode[] }
  )

function lineTreeNodesFromAst(ast: sh.File, lines: string[]): LineTreeNode[] {
  const result: LineTreeNode[] = [];
  let stack: LineTreeNode[][] = [result];
  myWalk(ast, {
    enter: (node) => {
      if (hasNodeType(node, "ForClause")) {
        const lineTreeNode = {
          type: 'loop-body',
          forClause: node,
          children: [],
          lineNumStart: node.DoPos.Line() + 1,
          lineNumEnd: node.DonePos.Line(),
        } satisfies LineTreeNode;
        stack[stack.length - 1].push(lineTreeNode);
        stack.push(lineTreeNode.children);
        return () => {
          stack.pop();
        }
      }
    }
  });
  addLinesToNodes(result, 1, lines.length + 1, lines);
  return result;
}

function addLinesToNodes(nodes: LineTreeNode[], lineNumStart: number, lineNumEnd: number, lines: string[]) {
  let newNodes: LineTreeNode[] = [];
  let lineNum = lineNumStart;
  function addLinesUpTo(lineNumEnd: number) {
    rangeIncl(lineNum, lineNumEnd - 1).forEach((i) => {
      newNodes.push({
        type: 'line',
        line: lines[i - 1],
        lineNumStart: i,
        lineNumEnd: i + 1,
      });
    });
    lineNum = lineNumEnd;
  }
  for (const child of nodes) {
    addLinesUpTo(child.lineNumStart);
    if (child.type === 'loop-body') {
      addLinesToNodes(child.children, child.lineNumStart, child.lineNumEnd, lines);
    }
    newNodes.push(child);
    lineNum = child.lineNumEnd;
  }
  addLinesUpTo(lineNumEnd);
  nodes.splice(0, nodes.length, ...newNodes);
};
