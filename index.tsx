import * as fs from "node:fs";
import yargs from "yargs";
import live from "./live";
import * as child_process from "node:child_process";
import * as util from "node:util";
import * as sh from "mvdan-sh";
import * as repl from "node:repl";
import * as tmp from "tmp";
import AnsiToHtml from "ansi-to-html";
import { parse } from "node:path";
// import serveHandler from "serve-handler";
// import * as http from "node:http";

// fun-run


// TODO: multi-char delimiter would take different logic
const delimiterCode = 31;
const delimiterChar = String.fromCharCode(delimiterCode);
const delimiterOctal = `\\${delimiterCode.toString(8).padStart(3, '0')}`;

const ansiToHtml = new AnsiToHtml({});

const parser = sh.syntax.NewParser(sh.syntax.KeepComments());
const printer = sh.syntax.NewPrinter();

const argv = yargs(process.argv.slice(2))
  .command('* <script> <out>', 'run a script', (yargs) =>
    yargs
    .positional('script', {
      type: 'string',
    })
    .positional('out', {
      type: 'string',
    })
    .options({
      live: { type: 'boolean', default: true },
    })
  )
  .parseSync();

const opts = argv as unknown as { script: string, out: string, live: boolean };

const scriptStr = fs.readFileSync(opts.script, { encoding: 'utf-8' });

const ast = parser.Parse(scriptStr);

// const excludedSuffixes = ["Pos", "End"];
const excludedSuffixes: string[] = [];

const excludedKeys: {[key: string]: true} = {
  '__internal_object__': true,
};

function expandObject(obj: any): any {
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
      toReturn = { __position__: toReturn.Offset.__return_value__ };
    }

    return toReturn;
  } else if (obj instanceof Array) {
    return obj.map(expandObject);
  } else {
    return obj;
  }
}

// console.log(util.inspect(expandObject(ast), {showHidden: false, depth: null, colors: true}))

function parseStmt(s: string): sh.Stmt {
  const stmts = parser.Parse(s).Stmts;
  if (stmts.length !== 1 || !stmts[0]) {
    throw new Error("need one stmt");
  }
  return stmts[0];
}

function messageStmt(message: any): sh.Stmt {
  const messageStr = JSON.stringify(message).replaceAll('"', '\\"');
  return parseStmt(`echo -e -n "${delimiterOctal}${messageStr}${delimiterOctal}"`);
}

function augmentStmts(stmts: (sh.Stmt | null)[]): sh.Stmt[] {
  return stmts.flatMap((stmt) => {
    if (!stmt) { return []; }
    return [
      messageStmt({type: "stmt-start", stmtLine: stmt.Pos().Line()}),
      stmt,
      messageStmt({type: "stmt-done", stmtLine: stmt.Pos().Line()}),
    ];
  });
}

const pipe = tmp.tmpNameSync();
// TODO: do it in node?
child_process.execSync(`mkfifo ${pipe}`);

sh.syntax.Walk(ast, (node) => {
  if (sh.syntax.NodeType(node) == "File") {
    const file = node as sh.File;
    file.Stmts = augmentStmts(file.Stmts);
    file.Stmts = [
      // parseStmt(`exec 3>${pipe}`),
      ...file.Stmts,
      // parseStmt(`exec 3>&-`),
    ]
  }
  if (sh.syntax.NodeType(node) == "ForClause") {
    const forClause = node as sh.ForClause;
    forClause.Do = augmentStmts(forClause.Do);

    const loop = forClause.Loop;
    if (sh.syntax.NodeType(loop) == "WordIter") {
      const wordIter = loop as sh.WordIter;
      const name = wordIter.Name;
      if (name) {
        const value = name.Value;
        forClause.Do = [
          // parseStmt(`echo "for loop; ${value} = \$${value}" >&3`),
          ...forClause.Do,
        ]
      }
    }
  }
  return true
});

const transformed = printer.Print(ast);

const tmpFile = tmp.fileSync();
fs.writeFileSync(tmpFile.name, transformed, { encoding: 'utf-8' });

const child = child_process.spawn(
  'try',
  ['-n', 'bash', tmpFile.name],
  // { cwd: '/Users/joshuah/Documents/research/engraft/paper-uist-2023-old' }
);

type Message = any;

type LogEntry =
  | {
    type: 'stdout',
    data: string,
  }
  | {
    type: 'message',
    data: Message,
  };

let log: LogEntry[] = [];
let exitCode: number | null = null;

let messageInProgress: string | null = null;

child.stdout.on('data', (data: string) => {
  data = data.toString();
  let stdoutInProgress: string = '';
  for (const char of data) {
    if (char === delimiterChar) {
      // we're starting or ending a message
      if (messageInProgress !== null) {
        // ending
        try {
          log.push({ type: 'message', data: JSON.parse(messageInProgress) });
      } catch (e) {
          console.error(e);
        }
        messageInProgress = null;
      } else {
        // starting
        if (stdoutInProgress) {
          log.push({ type: 'stdout', data: stdoutInProgress });
          stdoutInProgress = '';
        }
        messageInProgress = '';
      }
    } else {
      if (messageInProgress !== null) {
        messageInProgress += char;
      } else {
        stdoutInProgress += char;
      }
    }
  }
  if (stdoutInProgress) {
    log.push({ type: 'stdout', data: stdoutInProgress });
  }
  writeHtml();
});

child.stderr.on('data', (data: string) => {
  // TODO: not implemented
});

child.on('close', (exitCodeIn: number) => {
  exitCode = exitCodeIn;
  writeHtml();
});

// const pipeStream = fs.createReadStream(pipe, { encoding: 'utf-8' });

// pipeStream.on('data', (data: string) => {
//   outputBits.push({ type: 'meta', data });
//   writeHtml();
// });

const startTime = new Date();

function writeHtml() {
  const html = `
  <script>
  ${live}
  </script>
  <style>
    body {
      background-color: #333;
      color: white;
      margin: 50px;
    }

    .output-stderr {
      color: red;
    }
    pre {
      white-space: pre-wrap;
    }

    .row {
      display: flex;
      flex-direction: row;
    }

    .row > * {
      flex-grow: 1;
      flex-basis: 0;
    }
  </style>
  <div>
  <h1>code</h1>
  </div>
  <div class="row">
  <div>
  <h1>log</h1>
  <div>started @ ${startTime.toLocaleTimeString()}</div>
  <div>updated @ ${new Date().toLocaleTimeString()}</div>
  <ul>
    ${log.map(({ data, type }) => {
      if (type === 'stdout') {
        return `<li><pre>${data}</pre></li>`;
      } else if (type === 'message') {
        return `<li><pre>${ansiToHtml.toHtml(util.inspect(expandObject(data), {showHidden: false, depth: null, colors: true}))}</pre></li>`;
      }
  }).join('')}
  </ul>
  ${exitCode !== null ? `<div>exit code: ${exitCode}</div>` : ''}
  </div>
  </div>
  <div class="row">
  <div>
  <h1>script</h1>
  <pre>${scriptStr}</pre>
  <h1>ast</h1>
  <details>
  <pre>${ansiToHtml.toHtml(util.inspect(expandObject(ast), {showHidden: false, depth: null, colors: true}))}</pre>
  </details>
  </div>
  <div>
  <h1>transformed</h1>
  <pre>${transformed}</pre>
  </div>
  </div>
  `;

  fs.writeFileSync(opts.out, html, { encoding: 'utf-8' });

  // fs.writeFile(opts.out, html, { encoding: 'utf-8' }, () => {
  //   console.log("wrote html");
  // });
}

console.log("done");

// const server = http.createServer((request, response) => {
//   return serveHandler(request, response);
// });

// server.listen(3000, () => {
//   console.log('Running at http://localhost:3000');
// });


// const server = repl.start({ prompt: '> ' });
// server.context.ast = ast;
// server.context.expandObject = expandObject;
