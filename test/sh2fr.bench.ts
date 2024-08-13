import { Repo } from "@automerge/automerge-repo";
import { bench, describe } from "vitest";
import { Sh2Fr } from "../src/server/Sh2Fr.js";
import { Sh2FrViaHttp } from "../src/server/Sh2FrViaHttp.js";
import { Sh2FrViaTcp } from "../src/server/Sh2FrViaTcp.js";
import { Sh2FrViaTcpNoPipe } from "../src/server/Sh2FrViaTcpNoPipe.js";
import { Run } from "../src/server/run.js";
import { normalizeIndent } from "../src/shared/normalizeIndent.js";
import { runAndGetTrace } from "./run-test.js";

const cwd = process.cwd();

describe("sh2fr-benchmark", {}, () => {
  function go(name: string, mkSh2Fr: () => Sh2Fr) {
    bench(name, async () => {
      const repo = new Repo({ network: [] });
      const run = new Run(
        {
          path: "DUMMY-PATH",
          cwd,
          env: process.env,
          scriptSrc: normalizeIndent`
          for i in {1..10}; do
            echo $i
          done
        `,
        },
        repo,
        mkSh2Fr(),
      );
      await runAndGetTrace(run);
    });
  }

  go("Sh2FrViaHttp", () => new Sh2FrViaHttp());
  go("Sh2FrViaTcp", () => new Sh2FrViaTcp());
  go("Sh2FrViaTcpNoPipe", () => new Sh2FrViaTcpNoPipe());
});
