import { RawString, Repo } from '@automerge/automerge-repo';
import sh from 'mvdan-sh';
import path from 'node:path';
import R from 'remeda';
import { assert, describe, expect, it, onTestFinished } from 'vitest';
import { Sh2Fr } from '../src/server/Sh2Fr.js';
import { Run } from '../src/server/run.js';
import { DeltaLogEntry, ForInfo, Trace, mkExecId } from '../src/shared/execution.js';
import { Script } from '../src/shared/mvdan-sh-helpers.js';
import { getUnionFSMounts } from '../src/server/sandbox.js';
import { normalizeIndent } from '../src/shared/normalizeIndent.js';

const cwd = process.cwd();

export async function runAndGetTrace(run: Run): Promise<Trace> {
  onTestFinished(async () => await run.stop());
  await run.start();
  await run.isClosedPromise();
  const trace = await run.traceDoc.doc();
  if (!trace) {
    assert.fail('trace missing');
  }
  return trace;
}

function callExprIdWithSrc(src: string, script: Script) {
  const matches =
    Object.entries(script.nodesById)
    .filter(([_, node]) => script.srcForNode(node).startsWith(src) && sh.syntax.NodeType(node) === 'CallExpr');
  if (matches.length !== 1) {
    throw new Error(`${matches.length} CallExprs with src "${src}"`);
  }
  return matches[0][0];
}

export function runTestsWithSh2Fr(name: string, mkSh2Fr: () => Sh2Fr) {
  describe(name, {  }, () => {
    it('basically works', async () => {
      const repo = new Repo({ network: [] });
      const run = new Run({
        path: 'DUMMY-PATH',
        cwd,
        env: process.env,
        scriptSrc: 'echo hello',
      }, repo, mkSh2Fr());
      const trace = await runAndGetTrace(run);

      expect(trace.exitCode).toEqual(0);
    });

    it('cleans up sandbox unionfs ok', async () => {
      const repo = new Repo({ network: [] });
      const run = new Run({
        path: 'DUMMY-PATH',
        cwd,
        env: process.env,
        scriptSrc: 'echo hello',
      }, repo, mkSh2Fr());
      await runAndGetTrace(run);

      const unionFSMounts = await getUnionFSMounts();
      expect(unionFSMounts).not.toContain(run.sandbox!.sandboxUnionDir);
      expect(unionFSMounts).not.toContain(run.sandbox!.deltaUnionDir);
    });

    it('exit codes work', async () => {
      const repo = new Repo({ network: [] });
      const run = new Run({
        path: 'DUMMY-PATH',
        cwd,
        env: process.env,
        scriptSrc: 'exit 42',
      }, repo, mkSh2Fr());
      const trace = await runAndGetTrace(run);

      expect(trace.exitCode).toEqual(42);
    });

    it('stdout works', async () => {
      const repo = new Repo({ network: [] });
      const run = new Run({
        path: 'DUMMY-PATH',
        cwd,
        env: process.env,
        scriptSrc: 'echo hello',
      }, repo, mkSh2Fr());
      const trace = await runAndGetTrace(run);

      const echoExecId = mkExecId({ context: '', nodeId: callExprIdWithSrc('echo', run.script!) });
      expect(trace.execInfos[echoExecId]).toBeDefined();
      expect(trace.execInfos[echoExecId].stdout.data.join(''))
        .toEqual('hello\n');
      expect(trace.execInfos[echoExecId].stderr.data.join(''))
        .toEqual('');
    });

    it('stdout from function works', async () => {
      const repo = new Repo({ network: [] });
      const run = new Run({
        path: 'DUMMY-PATH',
        cwd,
        env: process.env,
        scriptSrc: normalizeIndent`
          function good() {
            echo "hello"
          }
          good
        `,
      }, repo, mkSh2Fr());
      const trace = await runAndGetTrace(run);

      const goodExecId = mkExecId({ context: '', nodeId: callExprIdWithSrc('good', run.script!) });
      expect(trace.execInfos[goodExecId].stdout.data.join(''))
        .toEqual('hello\n');
      expect(trace.execInfos[goodExecId].stderr.data.join(''))
        .toEqual('');
    });

    it('stderr works', async () => {
      const repo = new Repo({ network: [] });
      const run = new Run({
        path: 'DUMMY-PATH',
        cwd,
        env: process.env,
        scriptSrc: normalizeIndent`
          function bad() {
            echo "bad" >&2
          }
          bad
        `,
      }, repo, mkSh2Fr());
      const trace = await runAndGetTrace(run);

      const badExecId = mkExecId({ context: '', nodeId: callExprIdWithSrc('bad', run.script!) });
      expect(trace.execInfos[badExecId].stdout.data.join(''))
        .toEqual('');
      expect(trace.execInfos[badExecId].stderr.data.join(''))
        .toEqual('bad\n');
    });

    it('pipes work', async () => {
      const repo = new Repo({ network: [] });
      const run = new Run({
        path: 'DUMMY-PATH',
        cwd,
        env: process.env,
        scriptSrc: normalizeIndent`
          jot -b hello 10 | rev | tr a-z A-Z
        `,
      }, repo, mkSh2Fr());
      const trace = await runAndGetTrace(run);

      const jotExecId = mkExecId({ context: '', nodeId: callExprIdWithSrc('jot', run.script!) });
      expect(trace.execInfos[jotExecId].stdout.data.join(''))
        .toBe(R.range(0, 10).map(() => 'hello\n').join(''));
      const revExecId = mkExecId({ context: '', nodeId: callExprIdWithSrc('rev', run.script!) });
      expect(trace.execInfos[revExecId].stdout.data.join(''))
        .toBe(R.range(0, 10).map(() => 'olleh\n').join(''));
      const trExecId = mkExecId({ context: '', nodeId: callExprIdWithSrc('tr', run.script!) });
      expect(trace.execInfos[trExecId].stdout.data.join(''))
        .toBe(R.range(0, 10).map(() => 'OLLEH\n').join(''));
    });

    it.todo('pipes work even with an eager generator', async () => {
      const repo = new Repo({ network: [] });
      const run = new Run({
        path: 'DUMMY-PATH',
        cwd,
        env: process.env,
        scriptSrc: normalizeIndent`
          function gen() {
            while true; do
              echo "hello"
              sleep 0.1
            done
          }
          gen | head -n 4
        `,
      }, repo, mkSh2Fr());
      const trace = await runAndGetTrace(run);

      const headExecId = mkExecId({ context: '', nodeId: callExprIdWithSrc('head', run.script!) });
      expect(trace.execInfos[headExecId].stdout.data.join(''))
        .toBe(R.range(0, 4).map(() => 'olleh\n').join(''));
    });

    it('file addition works', async () => {
      const repo = new Repo({ network: [] });
      const run = new Run({
        path: 'DUMMY-PATH',
        cwd,
        env: process.env,
        scriptSrc: normalizeIndent`
          touch testfile.txt
        `,
      }, repo, mkSh2Fr());
      const trace = await runAndGetTrace(run);

      const touchExecId = mkExecId({ context: '', nodeId: callExprIdWithSrc('touch testfile.txt', run.script!) });
      expect(trace.execInfos[touchExecId].deltaLog).toEqual([
        { event: 'newFile', path: path.resolve(cwd, 'testfile.txt') },
      ] satisfies DeltaLogEntry[]);
    });

    it('file deletion works', async () => {
      const repo = new Repo({ network: [] });
      const run = new Run({
        path: 'DUMMY-PATH',
        cwd,
        env: process.env,
        scriptSrc: normalizeIndent`
          rm package.json
        `,
      }, repo, mkSh2Fr());
      const trace = await runAndGetTrace(run);

      const rmExecId = mkExecId({ context: '', nodeId: callExprIdWithSrc('rm package.json', run.script!) });
      expect(trace.execInfos[rmExecId].deltaLog).toEqual([
        { event: 'deletedFile', path: path.resolve(cwd, 'package.json') },
      ] satisfies DeltaLogEntry[]);
    });

    it('file modification works', async () => {
      const repo = new Repo({ network: [] });
      const run = new Run({
        path: 'DUMMY-PATH',
        cwd,
        env: process.env,
        scriptSrc: normalizeIndent`
          touch testfile.txt

          modify () {
            echo "hello" > testfile.txt
          }

          modify
        `,
      }, repo, mkSh2Fr());
      const trace = await runAndGetTrace(run);

      const touchExecId = mkExecId({ context: '', nodeId: callExprIdWithSrc('modify', run.script!) });
      expect(trace.execInfos[touchExecId].deltaLog).toEqual([
        {
          event: 'modifiedFile', path: path.resolve(cwd, 'testfile.txt'),
          oldContents: new RawString(''),
          newContents: new RawString('hello\n'),
        },
      ] satisfies DeltaLogEntry[]);
    });


    it('for loops work', async () => {
      const repo = new Repo({ network: [] });
      const run = new Run({
        path: 'DUMMY-PATH',
        cwd,
        env: process.env,
        scriptSrc: normalizeIndent`
          for i in {1..3}; do
            echo $i
          done
        `,
      }, repo, mkSh2Fr());
      const trace = await runAndGetTrace(run);

      const forInfos = Object.entries(trace.forInfos);
      if (forInfos.length !== 1) {
        assert.fail(`expected 1 for loop, got ${forInfos.length}`);
      }
      const [forId, forInfo] = forInfos[0];

      expect(forInfo).toEqual({
        iterations: [
          { counter: 0, loopVarValue: '1' },
          { counter: 1, loopVarValue: '2' },
          { counter: 2, loopVarValue: '3' },
        ],
      } satisfies ForInfo);

      for (const iteration of forInfo.iterations) {
        const echoExecId = mkExecId({
          context: `${forId}-${iteration.counter}`,
          nodeId: callExprIdWithSrc('echo $i', run.script!),
        });
        expect(trace.execInfos[echoExecId].stdout.data.join(''))
          .toEqual(`${iteration.loopVarValue}\n`);
      }
    });
  });
}
