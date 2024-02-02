import sh from "mvdan-sh";
import * as util from "node:util";
import { myWalk, wrapStmt } from "./mvdan-sh-helpers.js";

const parser = sh.syntax.NewParser();
const parsedScript = parser.Parse(`
for i in 1 2 3; do
  echo "hello $i" | rev;
done;

`, "script.sh");

myWalk(parsedScript, {
  exit(node) {
    // if (sh.syntax.NodeType(node) === "Stmt") {
    if (sh.syntax.NodeType(node) === "Stmt" && sh.syntax.NodeType((node as sh.Stmt).Cmd) === "CallExpr") {
      wrapStmt(parser, node as sh.Stmt, "{ echo before; ___; echo after; }");
    }
  }
});

const printer = sh.syntax.NewPrinter();

console.log("\n\n\n\n\n\n\n\n");
console.log(printer.Print(parsedScript));
