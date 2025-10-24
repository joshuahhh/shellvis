import { Repo } from "@automerge/automerge-repo";
import fsP from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
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
  await fsP.writeFile(fileOutside, "hello");

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
  expect(pipeData(trace.execInfos[rmExecId].stdout)).toEqual(["hello"]);
});

it("directory outside sandbox IS NOT writable", async () => {
  const dirOutside = await mkTmpDir("outside-");
  const fileOutside = path.join(dirOutside, "hello.txt");
  await fsP.writeFile(fileOutside, "hello");

  expect(await fsP.readFile(fileOutside, "utf-8")).toBe("hello");

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

  expect(await fsP.readFile(fileOutside, "utf-8")).toBe("hello");
});
