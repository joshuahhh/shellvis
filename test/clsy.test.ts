import { describe, expect, it } from "vitest";
import { cleanString, clsy } from "../src/client/clsy.js";

describe("cleanString", () => {
  it("works", async () => {
    expect(cleanString("aaa")).toBe("aaa");
    expect(cleanString("  aaa  bbb")).toBe("aaa bbb");
    expect(
      cleanString(`

    aaa

    bbb

    `),
    ).toBe("aaa bbb");
    expect(
      cleanString(`
      aaa  // comment
      // another
      bbb//third
    `),
    ).toBe("aaa bbb");
  });
});

describe("clsy (as function)", () => {
  it("works with strings", async () => {
    expect(clsy("aaa")).toBe("aaa");
  });

  it("works with messy strings", async () => {
    expect(
      clsy(`

      aaa//comment

      //another
      bbb

    `),
    ).toBe("aaa bbb");
  });

  it("works with embedded values", async () => {
    expect(clsy("aaa", "bbb")).toBe("aaa bbb");
    expect(clsy("aaa", false)).toBe("aaa");
    expect(clsy("aaa", { bbb: true, ccc: false })).toBe("aaa bbb");
    expect(clsy("aaa", ["bbb", "ccc"])).toBe("aaa bbb ccc");
  });
});

describe("clsy (as template)", () => {
  it("works with strings", async () => {
    expect(clsy`aaa`).toBe("aaa");
  });

  it("works with messy strings", async () => {
    expect(clsy`

      aaa//comment

      //another
      bbb

    `).toBe("aaa bbb");
  });

  it("works with embedded values", async () => {
    expect(clsy`aaa ${"bbb"}`).toBe("aaa bbb");
    expect(clsy`aaa ${false}`).toBe("aaa");
    expect(clsy`aaa ${{ bbb: true, ccc: false }}`).toBe("aaa bbb");
    expect(clsy`aaa ${["bbb", "ccc"]}`).toBe("aaa bbb ccc");
  });

  it("works with multiple values", async () => {
    expect(clsy`aaa ${"bbb"} ccc ${"ddd"}`).toBe("aaa bbb ccc ddd");
  });
});
