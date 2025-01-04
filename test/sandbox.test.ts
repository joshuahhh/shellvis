import { RawString } from "@automerge/automerge-repo";
import crypto from "node:crypto";
import fsP from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import {
  Sandbox,
  SandboxLayerImpl,
  afterRun,
  beforeRun,
  isMountPoint,
  makeSandbox,
  mkTmpDir,
  removeSandbox,
} from "../src/server/sandbox.js";
import { DeltaLogEntry } from "../src/shared/execution.js";

describe("isMountPoint", () => {
  it("works on root", async () => {
    expect(await isMountPoint("/")).toBe(true);
  });

  it("works on something that isn't a mount point", async () => {
    expect(await isMountPoint("/usr")).toBe(false);
  });

  it("works on something that is a mount point", async () => {
    expect(await isMountPoint("/dev")).toBe(true);
  });
});

describe("sandbox", () => {
  async function setUpSandbox(rootDir?: string) {
    if (!rootDir) {
      // for these tests, we sandbox a fake tmp root directory;
      rootDir = await mkTmpDir("root-");
    }
    const sandbox = await makeSandbox(rootDir);
    onTestFinished(async () => await removeSandbox(sandbox));
    return { rootDir, sandbox };
  }

  async function runInSandbox(
    sandbox: Sandbox,
    f: () => Promise<void>,
  ): Promise<DeltaLogEntry[]> {
    await beforeRun(sandbox);
    await f();
    return await afterRun(sandbox);
  }

  it("works with no changes", async () => {
    const { sandbox, rootDir } = await setUpSandbox();
    await fsP.writeFile(path.join(rootDir, "original-file"), "hello");

    for (let i = 0; i < 2; i++) {
      const deltaLog = await runInSandbox(sandbox, async () => {
        const originalFileContents = await fsP.readFile(
          path.join(sandbox.protectLayer.getUnionDir(), "original-file"),
          "utf8",
        );
        expect(originalFileContents).toBe("hello");
      });
      expect(deltaLog).toEqual([]);
    }
  });

  it("layers can be stacked nice and high", async () => {
    // oh no: https://stackoverflow.com/a/26003167 means we can only do 2
    let lowerDir = await mkTmpDir("root-");
    await fsP.writeFile(path.join(lowerDir, "original-file"), "hello");

    for (let i = 0; i < 2; i++) {
      const newLayer = await new SandboxLayerImpl({
        lowerDir,
        layerDir: await mkTmpDir("sandbox-"),
      }).make();
      onTestFinished(async () => await newLayer.remove());
      lowerDir = newLayer.getUnionDir();
      expect(
        await fsP.readFile(path.join(lowerDir, "original-file"), "utf8"),
      ).toBe("hello");
    }
  });

  it(
    "linux: homedir can be accessed from sandboxed root (in tmp)",
    {
      skip: process.platform !== "linux",
    },
    async () => {
      await fsP.writeFile("/root/hi-there", "hello");

      const newLayer = await new SandboxLayerImpl({
        lowerDir: "/",
        layerDir: await mkTmpDir("sandbox-"),
      }).make();
      onTestFinished(async () => await newLayer.remove());
      expect(
        await fsP.readFile(
          path.join(newLayer.getUnionDir(), "/root/hi-there"),
          "utf8",
        ),
      ).toBe("hello");
    },
  );

  it(
    "linux: tmp can be accessed from sandboxed root (in homedir)",
    {
      skip: process.platform !== "linux",
    },
    async () => {
      let dir = await mkTmpDir("something-in-tmp-");
      await fsP.writeFile(path.join(dir, "original-file"), "hello");

      const layerDirName = crypto.randomUUID();
      const layerDir = path.join("/root/tmp", layerDirName);
      await fsP.mkdir(layerDir, { recursive: true });
      const newLayer = await new SandboxLayerImpl({
        lowerDir: "/",
        layerDir,
      }).make();
      onTestFinished(async () => await newLayer.remove());

      expect(
        await fsP.readFile(
          path.join(newLayer.getUnionDir(), dir, "tmp-file"),
          "utf8",
        ),
      ).toBe("hello");
    },
  );

  it("tmp can be accessed from sandboxed root (in tmp)", async () => {
    let dir = await mkTmpDir("something-in-tmp-");
    await fsP.writeFile(path.join(dir, "original-file"), "hello");

    const layerDir = await mkTmpDir("sandbox-");

    const newLayer = await new SandboxLayerImpl({
      lowerDir: "/",
      layerDir,
    }).make();
    onTestFinished(async () => await newLayer.remove());
    expect(
      await fsP.readFile(
        path.join(newLayer.getUnionDir(), dir, "original-file"),
        "utf8",
      ),
    ).toBe("hello");
  });

  it("tmp can be accessed from double-layer sandboxed root (in tmp)", async () => {
    let dir = await mkTmpDir("something-in-tmp-");
    await fsP.writeFile(path.join(dir, "original-file"), "hello");

    const { sandbox } = await setUpSandbox("/");

    expect(
      await fsP.readFile(
        path.join(sandbox.deltaLayer.getUnionDir(), dir, "original-file"),
        "utf8",
      ),
    ).toBe("hello");
  });

  it("works reading files", async () => {
    const { sandbox, rootDir } = await setUpSandbox();
    await fsP.writeFile(path.join(rootDir, "original-file"), "hello");

    expect(
      await fsP.readFile(
        path.join(sandbox.deltaLayer.getUnionDir(), "original-file"),
        "utf8",
      ),
    ).toBe("hello");
  });

  it("works reading files (sandboxing real root, reaching into tmp)", async () => {
    const { sandbox } = await setUpSandbox("/");

    let dir = await mkTmpDir("something-in-tmp-");
    await fsP.writeFile(path.join(dir, "original-file"), "hello");

    expect(
      await fsP.readFile(
        path.join(sandbox.deltaLayer.getUnionDir(), dir, "original-file"),
        "utf8",
      ),
    ).toBe("hello");
  });

  it(
    "linux: works reading files (sandboxing real root, reaching into home)",
    {
      skip: process.platform !== "linux",
    },
    async () => {
      const { sandbox } = await setUpSandbox("/");

      const tmpInHomeDirName = crypto.randomUUID();
      const tmpInHomeDir = path.join("/root/tmp", tmpInHomeDirName);
      await fsP.mkdir(tmpInHomeDir, { recursive: true });
      await fsP.writeFile(path.join(tmpInHomeDir, "original-file"), "hello");
      onTestFinished(
        async () => await fsP.rm(tmpInHomeDir, { recursive: true }),
      );

      expect(
        await fsP.readFile(
          path.join(
            sandbox.deltaLayer.getUnionDir(),
            tmpInHomeDir,
            "original-file",
          ),
          "utf8",
        ),
      ).toBe("hello");
    },
  );

  it("works writing new files", async () => {
    const { sandbox } = await setUpSandbox();

    const deltaLog1 = await runInSandbox(sandbox, async () => {
      await fsP.writeFile(
        path.join(sandbox.deltaLayer.getUnionDir(), "new-file"),
        "hello",
      );
    });
    expect(deltaLog1).toEqual([{ event: "newFile", path: "new-file" }]);

    await runInSandbox(sandbox, async () => {
      const newFileContents = await fsP.readFile(
        path.join(sandbox.protectLayer.getUnionDir(), "new-file"),
        "utf8",
      );
      expect(newFileContents).toBe("hello");
    });
  });

  it("works deleting files", async () => {
    const { sandbox, rootDir } = await setUpSandbox();
    await fsP.writeFile(path.join(rootDir, "original-file"), "hello");

    const deltaLog = await runInSandbox(sandbox, async () => {
      await fsP.rm(
        path.join(sandbox.deltaLayer.getUnionDir(), "original-file"),
      );
    });
    expect(deltaLog).toEqual([{ event: "deletedFile", path: "original-file" }]);

    expect(
      await fsP
        .stat(path.join(sandbox.protectLayer.getUnionDir(), "original-file"))
        .catch(() => null),
    ).toBe(null);
  });

  it("works modifying files", async () => {
    const { sandbox, rootDir } = await setUpSandbox();
    await fsP.writeFile(path.join(rootDir, "original-file"), "hello");

    const deltaLog = await runInSandbox(sandbox, async () => {
      await fsP.writeFile(
        path.join(sandbox.deltaLayer.getUnionDir(), "original-file"),
        "goodbye",
      );
    });
    expect(deltaLog).toEqual([
      {
        event: "modifiedFile",
        path: "original-file",
        oldContents: new RawString("hello"),
        newContents: new RawString("goodbye"),
      },
    ]);

    const originalFileContents = await fsP.readFile(
      path.join(sandbox.protectLayer.getUnionDir(), "original-file"),
      "utf8",
    );
    expect(originalFileContents).toBe("goodbye");
  });

  it("works creating new directories", async () => {
    const { sandbox } = await setUpSandbox();

    const deltaLog = await runInSandbox(sandbox, async () => {
      await fsP.mkdir(path.join(sandbox.deltaLayer.getUnionDir(), "new-dir"));
    });
    expect(deltaLog).toEqual([{ event: "newDir", path: "new-dir" }]);

    expect(
      (
        await fsP.stat(path.join(sandbox.protectLayer.getUnionDir(), "new-dir"))
      ).isDirectory(),
    ).toBe(true);
  });

  it("works deleting directories", async () => {
    const { sandbox, rootDir } = await setUpSandbox();
    await fsP.mkdir(path.join(rootDir, "original-dir"));
    await fsP.mkdir(path.join(rootDir, "original-dir", "original-subdir"));
    await fsP.writeFile(
      path.join(rootDir, "original-dir", "original-subdir", "file"),
      "hello",
    );

    const deltaLog = await runInSandbox(sandbox, async () => {
      await fsP.rm(
        path.join(sandbox.deltaLayer.getUnionDir(), "original-dir"),
        { recursive: true },
      );
    });
    expect(deltaLog).toEqual([{ event: "deletedDir", path: "original-dir" }]);

    expect(
      await fsP
        .stat(path.join(sandbox.protectLayer.getUnionDir(), "original-dir"))
        .catch(() => null),
    ).toBe(null);
  });

  it("works replacing directories with files", async () => {
    const { sandbox, rootDir } = await setUpSandbox();
    await fsP.mkdir(path.join(rootDir, "original-dir-or-file"));

    const deltaLog = await runInSandbox(sandbox, async () => {
      await fsP.rm(
        path.join(sandbox.deltaLayer.getUnionDir(), "original-dir-or-file"),
        { recursive: true },
      );
      await fsP.writeFile(
        path.join(sandbox.deltaLayer.getUnionDir(), "original-dir-or-file"),
        "goodbye",
      );
    });
    expect(deltaLog).toEqual([
      { event: "dirReplacedWithFile", path: "original-dir-or-file" },
    ]);

    const originalFileContents = await fsP.readFile(
      path.join(sandbox.protectLayer.getUnionDir(), "original-dir-or-file"),
      "utf8",
    );
    expect(originalFileContents).toBe("goodbye");
  });

  it("works replacing files with directories", async () => {
    const { sandbox, rootDir } = await setUpSandbox();
    await fsP.writeFile(path.join(rootDir, "original-dir-or-file"), "hello");

    const deltaLog = await runInSandbox(sandbox, async () => {
      await fsP.rm(
        path.join(sandbox.deltaLayer.getUnionDir(), "original-dir-or-file"),
      );
      await fsP.mkdir(
        path.join(sandbox.deltaLayer.getUnionDir(), "original-dir-or-file"),
      );
    });
    expect(deltaLog).toEqual([
      { event: "deletedFile", path: "original-dir-or-file" },
      { event: "newDir", path: "original-dir-or-file" },
    ]);

    expect(
      (
        await fsP.stat(
          path.join(sandbox.protectLayer.getUnionDir(), "original-dir-or-file"),
        )
      ).isDirectory(),
    ).toBe(true);
  });

  it("works twice", async () => {
    const { sandbox } = await setUpSandbox();

    const deltaLog1 = await runInSandbox(sandbox, async () => {
      await fsP.writeFile(
        path.join(sandbox.deltaLayer.getUnionDir(), "new-file-1"),
        "hello-1",
      );
    });
    expect(deltaLog1).toEqual([{ event: "newFile", path: "new-file-1" }]);

    const deltaLog2 = await runInSandbox(sandbox, async () => {
      const newFile1Contents = await fsP.readFile(
        path.join(sandbox.protectLayer.getUnionDir(), "new-file-1"),
        "utf8",
      );
      expect(newFile1Contents).toBe("hello-1");
      await fsP.writeFile(
        path.join(sandbox.deltaLayer.getUnionDir(), "new-file-2"),
        "hello-2",
      );
    });
    expect(deltaLog2).toEqual([{ event: "newFile", path: "new-file-2" }]);

    const newFileContents = await fsP.readFile(
      path.join(sandbox.protectLayer.getUnionDir(), "new-file-2"),
      "utf8",
    );
    expect(newFileContents).toBe("hello-2");
  });

  it("cleans up unionfs ok", async () => {
    const sandbox = await makeSandbox("/");
    onTestFinished(() => removeSandbox(sandbox)); // for backup

    const unionFSMounts = await SandboxLayerImpl.getActiveMounts();
    expect(unionFSMounts).toContain(sandbox.protectLayer.getUnionDir());
    expect(unionFSMounts).toContain(sandbox.deltaLayer.getUnionDir());

    await removeSandbox(sandbox);

    const unionFSMountsAfter = await SandboxLayerImpl.getActiveMounts();
    expect(unionFSMountsAfter).not.toContain(
      sandbox.protectLayer.getUnionDir(),
    );
    expect(unionFSMountsAfter).not.toContain(sandbox.deltaLayer.getUnionDir());

    await removeSandbox(sandbox); // should be idempotent
  });
});
