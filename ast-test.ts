import sh from "mvdan-sh";
import * as util from "node:util";

enum EnterResponse {
  Continue,
  Skip,
  Abort,
}

enum ExitResponse {
  Continue,
  Abort,
}

type Walker = {
  enter?(node: sh.Node, ancestors: sh.Node[]): EnterResponse | void,
  exit?(node: sh.Node, ancestors: sh.Node[]): ExitResponse | void,
}

function myWalk (
  node: sh.Node,
  walker: Walker,
): void {
  let ancestors: sh.Node[] = [];
  let aborted = false;
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
      } else if (response === EnterResponse.Continue || response === undefined) {
        ancestors.push(node);
        return true;
      } else {
        throw new Error(`unknown EnterResponse ${response}`);
      }
    } else {
      // exiting
      const exitedNode = ancestors.pop()!;
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
function wrapStmt(parser: sh.Parser, stmt: sh.Stmt, templateStr: string): void {
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

const parser = sh.syntax.NewParser();
const parsedScript = parser.Parse(`
first | second;

for i in 1 2 3; do
  echo $i;
done;

`, "script.sh");

myWalk(parsedScript, {
  exit(node) {
    if (sh.syntax.NodeType(node) === "Stmt") {
      wrapStmt(parser, node as sh.Stmt, "{ pre; ___; post; }");
    }
  }
});

const printer = sh.syntax.NewPrinter();

console.log(printer.Print(parsedScript));
