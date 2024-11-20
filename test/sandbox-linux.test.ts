import { describe, expect, it } from "vitest";
import { canBeSandboxed } from "../src/server/sandbox.js";

describe(
  "isOnOverlayLinux",
  {
    skip: process.platform !== "linux",
  },
  () => {
    it("works", async () => {
      expect(await canBeSandboxed("/root")).toBe(true);
      expect(await canBeSandboxed("/root/shell")).toBe(false);
      expect(await canBeSandboxed("/mnt")).toBe(true);
    });
  },
);
