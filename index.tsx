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
import { renderToString } from "react-dom/server";
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

// console.log(util.inspect(expandObject(ast), {showHidden: false, depth: null, colors: true}))

function parseStmt(s: string): sh.Stmt {
  const stmts = parser.Parse(s).Stmts;
  if (stmts.length !== 1 || !stmts[0]) {
    throw new Error("need one stmt");
  }
  return stmts[0];
}

function messageStmt(message: Message): sh.Stmt {
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
        const forLine = forClause.Pos().Line();
        const value = name.Value;
        const counterName = `__fun_run_loop_counter_${forLine}__`;
        forClause.Do = [
          parseStmt(`let ${counterName}+=1`),
          messageStmt({type: "for-body-start", forLine, counter: "$" + counterName}),
          // parseStmt(`echo "for loop; ${value} = \$${value}" >&3`),
          ...forClause.Do,
          messageStmt({type: "for-body-done", forLine, counter: "$" + counterName}),
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
  { cwd: '/Users/joshuah/Documents/research/engraft/paper-uist-2023-old' }
);

type Message =
  | {
    type: 'stmt-start',
    stmtLine: number,
    }
  | {
    type: 'stmt-done',
    stmtLine: number,
    }
  | {
      type: 'for-body-start',
      forLine: number,
      counter: string,
    }
  | {
      type: 'for-body-done',
      forLine: number
    };

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
  console.error("got stderr", data);
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

function inspectHtml(value: any) {
  return <pre dangerouslySetInnerHTML={{ __html:
    ansiToHtml.toHtml(util.inspect(value, { showHidden: false, depth: null, colors: true }))
  }} />;
}

function writeHtml() {
  const outputPerLine: { [line: number]: string } = {};
  let currentLine = null;
  for (const { type, data } of log) {
    if (type === 'message') {
      const message = data as Message;
      if (message.type === 'stmt-start') {
        currentLine = message.stmtLine;
      } else if (message.type === 'stmt-done') {
        currentLine = null;
      }
    } else if (type === 'stdout') {
      if (currentLine === null) {
        console.error("got stdout without a current line", data);
      } else {
        outputPerLine[currentLine] = (outputPerLine[currentLine] || '') + data;
      }
    }
  }

  const jsx = <>
    <script dangerouslySetInnerHTML={{
      __html: live
    }} />
    <style>{`
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

      .code-line {
        display: flex;
        flex-direction: row;
        font-size: 16px;
      }

      .code-linenum {
        color: #999;
        margin-right: 20px;
        text-align: right;
        min-width: 30px;
        font-family: monospace;
      }

      .code-linecode {
        flex-grow: 1;
        flex-basis: 0;
        white-space: pre;
        font-family: monospace;
      }

      .code-stdout {
        color: #999;
      }
    `}</style>
    <div>
      {scriptStr.split('\n').map((line, i) => {
        const lineIndent = line.match(/^\s*/)?.[0] || '';
        return <div key={i} className="code-line">
          <div className="code-linenum">{i + 1}</div>
          <div className="code-linecode">
            <div>{line}</div>
            { outputPerLine[i + 1] &&
              <div className="row">
                <div>{lineIndent}</div>
                <div className="code-stdout">{outputPerLine[i + 1]}</div>
              </div>
            }
          </div>
        </div>;
      })}
    </div>
    {true && <div className="row">
      <div>
        <h1>log</h1>
        <div>started @ {startTime.toLocaleTimeString()}</div>
        <div>updated @ {new Date().toLocaleTimeString()}</div>
        <ul>
          {log.map(({ data, type }, i) =>
            <li key={i}>
              { type === 'stdout'
              ? <pre>{data}</pre>
              : inspectHtml(expandObject(data))
              }
            </li>
          )}
        </ul>
        {exitCode !== null && <div>exit code: {exitCode}</div>}
      </div>
    </div>}
    {true &&
      <div>
        <h1>script</h1>
        <pre>{scriptStr}</pre>
        <h1>ast</h1>
        <details>
          {inspectHtml(expandObject(
            parser.Parse(scriptStr)
          ))}
        </details>
      </div>
    }
    {true && <div>
      <div>
        <h1>transformed</h1>
        <pre>{transformed}</pre>
      </div>
    </div>}
  </>;

  const html = renderToString(jsx);

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
