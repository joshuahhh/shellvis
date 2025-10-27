import { Repo } from "@automerge/automerge-repo";
import fsP from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { Sh2FrViaHttp } from "../src/server/Sh2FrViaHttp.js";
import { Run } from "../src/server/run.js";
import { mkTmpDir } from "../src/server/sandbox.js";
import { mkExecId, pipeData } from "../src/shared/execution.js";
import { callExprIdWithSrc, runAndGetTrace } from "./run-test.js";

// TODO: test other Sh2Fr implementations?
const sh2Fr = new Sh2FrViaHttp();

it("directory outside sandbox IS readable", async () => {
  const dirOutside = await mkTmpDir("outside-");
  const fileOutside = path.join(dirOutside, "hello.txt");
  await fsP.writeFile(fileOutside, "hello\n");

  const scriptSrc = `cat ${fileOutside}`;

  const run = new Run(
    {
      path: "DUMMY-PATH",
      cwd: await mkTmpDir("test-"),
      env: process.env,
      scriptSrc,
    },
    new Repo({ network: [] }),
    sh2Fr,
  );
  const trace = await runAndGetTrace(run);

  const rmExecId = mkExecId({
    context: "",
    nodeId: callExprIdWithSrc(scriptSrc, run.script!),
  });
  expect(pipeData(trace.execInfos[rmExecId].stdout)).toEqual(["hello\n"]);
});

it("directory outside sandbox (in cwd) IS NOT writable", async () => {
  const fileOutside =
    "./file-for-shellvis-test-that-certainly-does-not-exist.txt";
  await fsP.writeFile(fileOutside, "hello\n");
  onTestFinished(async () => {
    await fsP.unlink(fileOutside);
  });

  expect(await fsP.readFile(fileOutside, "utf-8")).toBe("hello\n");

  const scriptSrc = `rm ${fileOutside}`;

  const run = new Run(
    {
      path: "DUMMY-PATH",
      cwd: await mkTmpDir("test-"),
      env: process.env,
      scriptSrc,
    },
    new Repo({ network: [] }),
    sh2Fr,
  );
  const trace = await runAndGetTrace(run);

  expect(await fsP.readFile(fileOutside, "utf-8")).toBe("hello\n");
});

it("directory outside sandbox (outside cwd) IS NOT writable", async () => {
  // NOTE: we can't use a tmp dir because sandbox-runtime specially
  // allows them! you can prevent this by messing with
  // process.env.TMPDIR, but I'd rather not. so we'll just use the
  // homedir.
  const fileOutside = path.join(
    homedir(),
    "file-for-shellvis-test-that-certainly-does-not-exist.txt",
  );
  await fsP.writeFile(fileOutside, "hello\n");
  onTestFinished(async () => {
    await fsP.unlink(fileOutside);
  });

  expect(await fsP.readFile(fileOutside, "utf-8")).toBe("hello\n");

  const scriptSrc = `rm ${fileOutside}`;

  const run = new Run(
    {
      path: "DUMMY-PATH",
      cwd: await mkTmpDir("test-"),
      env: process.env,
      scriptSrc,
    },
    new Repo({ network: [] }),
    sh2Fr,
  );
  const trace = await runAndGetTrace(run);

  expect(await fsP.readFile(fileOutside, "utf-8")).toBe("hello\n");
});

it("directory inside sandbox IS writable", async () => {
  const cwd = await mkTmpDir("test-");
  const fileInside = path.join(cwd, "hello.txt");

  const scriptSrc = `echo "hello" > ${fileInside}`;

  const run = new Run(
    {
      path: "DUMMY-PATH",
      cwd,
      env: process.env,
      scriptSrc,
    },
    new Repo({ network: [] }),
    sh2Fr,
  );
  const trace = await runAndGetTrace(run);

  expect(await fsP.readFile(fileInside, "utf-8")).toBe("hello\n");
});
