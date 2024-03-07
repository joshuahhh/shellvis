import { Repo } from "@automerge/automerge-repo";
import { normalizeIndent } from "@engraft/shared/lib/normalizeIndent.js";
import sh from "mvdan-sh";
import { assert, describe, expect, it } from "vitest";
import { Run } from "../src/server/run.js";
import { Trace, mkExecId } from "../src/shared/execution.js";
import { Script } from "../src/shared/mvdan-sh-helpers.js";
import R from "remeda";
import path from "node:path";

const cwd = process.cwd();

async function runAndGetTrace(run: Run): Promise<Trace> {
  await run.start();
  await run.isClosedPromise();
  const trace = await run.traceDoc.doc();
  if (!trace) {
    assert.fail("trace missing");
  }
  return trace;
}

function callExprIdWithSrc(src: string, script: Script) {
  const matches =
    Object.entries(script.nodesById)
    .filter(([_, node]) => script.srcForNode(node) === src && sh.syntax.NodeType(node) === "CallExpr");
  if (matches.length !== 1) {
    throw new Error(`${matches.length} CallExprs with src "${src}"`);
  }
  return matches[0][0];
}

describe('Run', () => {
  it('basically works', async () => {
    const repo = new Repo({ network: [] });
    const run = new Run({
      path: "DUMMY-PATH",
      cwd,
      env: process.env,
      scriptSrc: "echo hello",
    }, repo);
    const trace = await runAndGetTrace(run);

    expect(trace.exitCode).toEqual(0);
  });

  it('exit codes work', async () => {
    const repo = new Repo({ network: [] });
    const run = new Run({
      path: "DUMMY-PATH",
      cwd,
      env: process.env,
      scriptSrc: "exit 42",
    }, repo);
    const trace = await runAndGetTrace(run);

    expect(trace.exitCode).toEqual(42);
  });

  it('stdout works', async () => {
    const repo = new Repo({ network: [] });
    const run = new Run({
      path: "DUMMY-PATH",
      cwd,
      env: process.env,
      scriptSrc: "echo hello",
    }, repo);
    const trace = await runAndGetTrace(run);

    const badExec = mkExecId("", callExprIdWithSrc("echo hello", run.script!));
    expect(trace.execInfos[badExec].stdout.data.join("\n"))
      .toEqual("hello\n");
  });

  it('stderr works', async () => {
    const repo = new Repo({ network: [] });
    const run = new Run({
      path: "DUMMY-PATH",
      cwd,
      env: process.env,
      scriptSrc: normalizeIndent`
        function bad() {
          echo "bad" >&2
        }
        bad
      `,
    }, repo);
    const trace = await runAndGetTrace(run);

    const badExec = mkExecId("", callExprIdWithSrc("bad", run.script!));
    expect(trace.execInfos[badExec].stderr.data.join("\n"))
      .toEqual("bad\n");
  });

  it('pipes work', async () => {
    const repo = new Repo({ network: [] });
    const run = new Run({
      path: "DUMMY-PATH",
      cwd,
      env: process.env,
      scriptSrc: normalizeIndent`
        yes hello | rev | head -10
      `,
    }, repo);
    const trace = await runAndGetTrace(run);

    const yesExec = mkExecId("", callExprIdWithSrc("yes hello", run.script!));
    expect(trace.execInfos[yesExec].stdout.data.join("\n")
      .startsWith(R.range(0, 10).map(() => `hello\n`).join(""))).toBeTruthy();
    const revExec = mkExecId("", callExprIdWithSrc("rev", run.script!));
    expect(trace.execInfos[revExec].stdout.data.join("\n")
      .startsWith(R.range(0, 10).map(() => `olleh\n`).join(""))).toBeTruthy();
    const headExec = mkExecId("", callExprIdWithSrc("head -10", run.script!));
    expect(trace.execInfos[headExec].stdout.data.join("\n"))
      .toBe(R.range(0, 10).map(() => `olleh\n`).join(""));
  });

  it('file addition works', async () => {
    const repo = new Repo({ network: [] });
    const run = new Run({
      path: "DUMMY-PATH",
      cwd,
      env: process.env,
      scriptSrc: normalizeIndent`
        touch testfile.txt
      `,
    }, repo);
    const trace = await runAndGetTrace(run);

    const touchExec = mkExecId("", callExprIdWithSrc("touch testfile.txt", run.script!));
    expect(trace.execInfos[touchExec].exitInfo!.deltaLog).toEqual([
      { event: "new file", path: path.resolve(cwd, "testfile.txt") }
    ]);
  });

  it('file deletion works', async () => {
    const repo = new Repo({ network: [] });
    const run = new Run({
      path: "DUMMY-PATH",
      cwd,
      env: process.env,
      scriptSrc: normalizeIndent`
        rm package.json
      `,
    }, repo);
    const trace = await runAndGetTrace(run);

    const rmExec = mkExecId("", callExprIdWithSrc("rm package.json", run.script!));
    expect(trace.execInfos[rmExec].exitInfo!.deltaLog).toEqual([
      { event: "deleted", path: path.resolve(cwd, "package.json") }
    ]);
  });

  it.todo('file modification works');
});
