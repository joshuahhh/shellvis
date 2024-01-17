import sh from "mvdan-sh";
import AnsiToHtml from "ansi-to-html";
import { ParseError, expandObject } from "./mvdan-sh-helpers";
import * as child_process from "node:child_process";
import * as util from "node:util";
import * as repl from "node:repl";
import * as tmp from "tmp";
import * as os from "os";
import * as path from "node:path";
import * as fs from "node:fs";
import { renderToString } from "react-dom/server";

type Message =
  | {
    type: 'stmt-start',
    stmtLine: number,
    pwd: string,
    }
  | {
    type: 'stmt-done',
    stmtLine: number,
    pwd: string,
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

type Sandbox = {
  sandboxDir: string,
  sandboxUnionDir: string,
  deltaDir: string,
  deltaLogFile: string,
}

function makeSandbox(): Sandbox {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-'));
  const sandboxUnionDir = path.join(sandboxDir, 'union');
  const deltaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delta-'));
  const deltaLogFile = tmp.tmpNameSync();

  child_process.execSync(`fr-sandbox make ${sandboxDir} /`);
  child_process.execSync(`fr-sandbox make ${deltaDir} ${sandboxUnionDir}`);

  return { sandboxDir, sandboxUnionDir, deltaDir, deltaLogFile };
}

function execHandler(error: child_process.ExecException | null, stdout: string, stderr: string) {
  if (error) {
    console.error(`exec error: ${error}`);
    return;
  }
  if (stdout) {
    console.log(`stdout: ${stdout}`);
  }
  if (stderr) {
    console.error(`stderr: ${stderr}`);
  }
};

function removeSandbox(sandbox: Sandbox) {
  child_process.exec(`fr-sandbox remove ${sandbox.deltaDir}`, execHandler);
  child_process.exec(`fr-sandbox remove ${sandbox.sandboxDir}`, execHandler);
}

// TODO: multi-char delimiter would take different logic
const delimiterCode = 31;
const delimiterChar = String.fromCharCode(delimiterCode);
const delimiterOctal = `\\${delimiterCode.toString(8).padStart(3, '0')}`;

const ansiToHtml = new AnsiToHtml({});

const parser = sh.syntax.NewParser(sh.syntax.KeepComments(true));
const printer = sh.syntax.NewPrinter();

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


function inspectHtml(value: any) {
  return <pre dangerouslySetInnerHTML={{ __html:
    ansiToHtml.toHtml(util.inspect(value, { showHidden: false, depth: null, colors: true }))
  }} />;
}

export class Run {
  sandbox: Sandbox = undefined as any;  // TODO: don't care
  childProcess: child_process.ChildProcessWithoutNullStreams = undefined as any;  // TODO: don't care
  startTime: Date = undefined as any;  // TODO: don't care
  log: LogEntry[] = [];
  exitCode: number | null = null;
  transformedSrc: string = undefined as any;  // TODO: don't care

  constructor(public scriptSrc: string, public broadcast: (data: string) => void) { }

  start() {
    console.log("starting");

    // parse

    let ast: sh.File;
    try {
      ast = parser.Parse(this.scriptSrc);
    } catch (e) {
      console.error("error parsing script", expandObject((e as ParseError).Error()));
      process.exit(1);  // TODO: report problem intelligently
    }

    // transform

    this.sandbox = makeSandbox();

    sh.syntax.Walk(ast, (node) => {
      if (sh.syntax.NodeType(node) == "File") {
        const file = node as sh.File;
        file.Stmts = this._augmentStmts(file.Stmts);
        file.Stmts = [
          // parseStmt(`exec 3>${pipe}`),
          ...file.Stmts,
          // parseStmt(`exec 3>&-`),
        ]
      }
      if (sh.syntax.NodeType(node) == "ForClause") {
        const forClause = node as sh.ForClause;
        forClause.Do = this._augmentStmts(forClause.Do);

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
              messageStmt({type: "for-body-done", forLine}),
            ]
          }
        }
      }
      return true
    });

    this.transformedSrc = printer.Print(ast);

    // run

    const tmpFile = tmp.fileSync();
    fs.writeFileSync(tmpFile.name, this.transformedSrc, { encoding: 'utf-8' });

    this.startTime = new Date();

    this.childProcess = child_process.spawn(
      'bash',
      [ tmpFile.name ],
      { cwd: path.join(this.sandbox.deltaDir, 'union', process.cwd()) }
    );

    // collect output

    let messageInProgress: string | null = null;
    this.childProcess.stdout.on('data', (data: string) => {
      data = data.toString();
      let stdoutInProgress: string = '';
      for (const char of data) {
        if (char === delimiterChar) {
          // we're starting or ending a message
          if (messageInProgress !== null) {
            // ending
            try {
              this.log.push({ type: 'message', data: JSON.parse(messageInProgress) });
          } catch (e) {
              console.error(e);
            }
            messageInProgress = null;
          } else {
            // starting
            if (stdoutInProgress) {
              this.log.push({ type: 'stdout', data: stdoutInProgress });
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
        this.log.push({ type: 'stdout', data: stdoutInProgress });
      }
      this._writeHtml();
    });

    this.childProcess.stderr.on('data', (data: string) => {
      // TODO: not implemented
      console.error("got stderr", data.toString());
    });

    this.childProcess.on('close', (exitCodeIn: number) => {
      this.exitCode = exitCodeIn;
      this._writeHtml();
      this.stop();
    });
  }

  stop() {
    console.log("stopping");
    if (this.exitCode === null) {
      this.childProcess.kill();
    }
    removeSandbox(this.sandbox);
  }

  _augmentStmts(stmts: (sh.Stmt | null)[]): sh.Stmt[] {
    return stmts.flatMap((stmt) => {
      if (!stmt) { return []; }
      return [
        messageStmt({type: "stmt-start", stmtLine: stmt.Pos().Line(), pwd: "$PWD"}),
        parseStmt(`fr-sandbox before-run ${this.sandbox.deltaDir}`),
        stmt,
        parseStmt(`fr-sandbox after-run ${this.sandbox.deltaDir} ${this.sandbox.sandboxDir} ${this.sandbox.deltaLogFile}`),
        parseStmt(`[ -s ${this.sandbox.deltaLogFile} ] && (echo -e "\\033[3mFile changes:\\033[0m"; cat ${this.sandbox.deltaLogFile} | awk '{ print "  " $0 }')`),
        messageStmt({type: "stmt-done", stmtLine: stmt.Pos().Line(), pwd: "$PWD"}),
      ];
    });
  }

  _writeHtml() {
    const outputPerLine: { [line: number]: string } = {};
    let currentLine = null;
    for (const { type, data } of this.log) {
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
      {/* <script dangerouslySetInnerHTML={{
        __html: live
      }} /> */}
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
          margin-top: 8px;
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

        .code-command {
          margin-bottom: 8px;
        }
      `}</style>
      <div>
        {this.scriptSrc.split('\n').map((line, i) => {
          const lineIndent = line.match(/^\s*/)?.[0] || '';
          return <div key={i} className="code-line">
            <div className="code-linenum">{i + 1}</div>
            <div className="code-linecode">
              <div className="code-command">{line}</div>
              { outputPerLine[i + 1] &&
                <div className="row">
                  <div>{lineIndent}</div>
                  <div className="code-stdout" dangerouslySetInnerHTML={{__html: ansiToHtml.toHtml(outputPerLine[i + 1])}}/>
                </div>
              }
            </div>
          </div>;
        })}
      </div>
      {true && <div className="row" style={{marginTop: 1000}}>
        <div>
          <h1>log</h1>
          <div>started @ {this.startTime.toLocaleTimeString()}</div>
          <div>updated @ {new Date().toLocaleTimeString()}</div>
          <ul>
            {this.log.map(({ data, type }, i) =>
              <li key={i}>
                { type === 'stdout'
                ? <pre>{data}</pre>
                : inspectHtml(expandObject(data))
                }
              </li>
            )}
          </ul>
          {this.exitCode !== null && <div>exit code: {this.exitCode}</div>}
        </div>
      </div>}
      {true &&
        <div>
          <h1>script</h1>
          <pre>{this.scriptSrc}</pre>
          <h1>ast</h1>
          <details>
            {inspectHtml(expandObject(
              parser.Parse(this.scriptSrc)
            ))}
          </details>
        </div>
      }
      {true && <div>
        <div>
          <h1>transformed</h1>
          <pre>{this.transformedSrc}</pre>
        </div>
      </div>}
    </>;

    const html = renderToString(jsx);

    this.broadcast(html);
  }
}
