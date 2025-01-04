import { describe, expect, it, onTestFinished } from "vitest";
import { SandboxLayerImpl, mkTmpDir } from "../src/server/sandbox.js";

describe(
  "isOnOverlayLinux",
  {
    skip: process.platform !== "linux",
  },
  () => {
    it("works", async () => {
      // you can sandbox an ordinary directory...
      expect(await SandboxLayerImpl.canBeSandboxed("/")).toBe(true);

      // ...but not a directory that's already on an overlay
      const newLayer = await new SandboxLayerImpl({
        lowerDir: "/",
        layerDir: await mkTmpDir("sandbox-"),
      }).make();
      onTestFinished(() => newLayer.remove());
      expect(
        await SandboxLayerImpl.canBeSandboxed(newLayer.getUnionDir()),
      ).toBe(false);
    });
  },
);
