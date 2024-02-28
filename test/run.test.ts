import { Repo } from "@automerge/automerge-repo";
import { normalizeIndent } from "@engraft/shared/lib/normalizeIndent.js";
import sh from "mvdan-sh";
import { assert, describe, expect, it } from "vitest";
import { Run } from "../src/server/run.js";
import { Trace, mkExecId } from "../src/shared/execution.js";
import { Script } from "../src/shared/mvdan-sh-helpers.js";

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
      cwd: ".",
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
      cwd: ".",
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
      cwd: ".",
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
      cwd: ".",
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
});
