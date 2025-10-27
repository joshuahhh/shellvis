import {
  SandboxManager,
  SandboxRuntimeConfig,
} from "@anthropic-ai/sandbox-runtime";
import { exec } from "node:child_process";
import fsP from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it, onTestFinished } from "vitest";
import { mkTmpDir } from "../src/server/sandbox.js";

// This is an AI-assisted testbed for anthropic-ai/sandbox-runtime usage.

const execAsync = promisify(exec);

function createSandboxConfig(sandboxDir: string): SandboxRuntimeConfig {
  return {
    filesystem: {
      allowWrite: [sandboxDir],
      denyWrite: ["."], // override default allow-write to cwd
      denyRead: [],
    },
    network: {
      allowedDomains: ["*"],
      deniedDomains: [],
      allowAllUnixSockets: true,
      allowLocalBinding: true,
      allowUnixSockets: ["*"],
    },
  };
}

async function execNoThrow(
  ...args: Parameters<typeof execAsync>
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execAsync(...args);
    return {
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      code: 0,
    };
  } catch (error: any) {
    // execAsync throws on non-zero exit, but we want to return the result
    return {
      stdout: error.stdout?.toString() || "",
      stderr: error.stderr?.toString() || "",
      code: error.code ?? 1,
    };
  }
}

async function runSandboxedCommand(
  command: string,
  cwd: string,
  config: SandboxRuntimeConfig,
) {
  try {
    await SandboxManager.initialize(config);

    // Save and delete TMPDIR to prevent sandbox-runtime from automatically
    // allowing writes to the temp directory parent
    const savedTmpDir = process.env.TMPDIR;
    delete process.env.TMPDIR;

    const sandboxedCommand = await SandboxManager.wrapWithSandbox(command);

    // Restore TMPDIR immediately after wrapping (before executing the command)
    process.env.TMPDIR = savedTmpDir;

    return await execNoThrow(sandboxedCommand, { cwd });
  } finally {
    await SandboxManager.reset();
  }
}

it("directory outside sandbox IS readable", async () => {
  onTestFinished(async () => {
    await SandboxManager.reset();
  });

  const sandboxDir = await mkTmpDir("sandbox-");
  const dirOutside = await mkTmpDir("outside-");
  const fileOutside = path.join(dirOutside, "hello.txt");
  await fsP.writeFile(fileOutside, "hello\n");

  const config = createSandboxConfig(sandboxDir);

  const result = await runSandboxedCommand(
    `cat ${fileOutside}`,
    sandboxDir,
    config,
  );

  expect(result.stdout).toEqual("hello\n");
  expect(result.code).toEqual(0);
});

it("directory outside sandbox IS NOT writable", async () => {
  onTestFinished(async () => {
    await SandboxManager.reset();
  });

  const sandboxDir = await mkTmpDir("sandbox-");
  const dirOutside = await mkTmpDir("outside-");
  const fileOutside = path.join(dirOutside, "hello.txt");
  await fsP.writeFile(fileOutside, "hello\n");

  expect(await fsP.readFile(fileOutside, "utf-8")).toBe("hello\n");

  const config = createSandboxConfig(sandboxDir);

  const result = await runSandboxedCommand(
    `rm ${fileOutside}`,
    sandboxDir,
    config,
  );

  // File should still exist after attempted deletion
  expect(await fsP.readFile(fileOutside, "utf-8")).toBe("hello\n");
  // Command should have failed
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain("Operation not permitted");
});

it("directory inside sandbox IS writable", async () => {
  onTestFinished(async () => {
    await SandboxManager.reset();
  });

  const sandboxDir = await mkTmpDir("sandbox-");
  const fileInside = path.join(sandboxDir, "hello.txt");

  const config = createSandboxConfig(sandboxDir);

  const result = await runSandboxedCommand(
    `echo "hello" > ${fileInside}`,
    sandboxDir,
    config,
  );

  expect(await fsP.readFile(fileInside, "utf-8")).toBe("hello\n");
  expect(result.code).toEqual(0);
});

it("current working directory IS NOT writable", async () => {
  onTestFinished(async () => {
    await SandboxManager.reset();
  });

  const sandboxDir = await mkTmpDir("sandbox-");
  // Try to write to a file in the current working directory (process.cwd())
  const fileInCwd = path.join(process.cwd(), "test-forbidden-file.txt");

  const config = createSandboxConfig(sandboxDir);

  const result = await runSandboxedCommand(
    `echo "should fail" > ${fileInCwd}`,
    sandboxDir,
    config,
  );

  console.log("result:", result);
  const fileExists = await fsP.access(fileInCwd).then(
    () => true,
    () => false,
  );
  console.log("file created in cwd?", fileExists);

  // Clean up if it was created
  if (fileExists) {
    await fsP.unlink(fileInCwd);
  }

  // File should not have been created
  expect(fileExists).toBe(false);
  // Command should have failed
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain("Operation not permitted");
});
