import { Sh2FrViaTcp } from "../src/server/Sh2FrViaTcp.js";
import { runTestsWithSh2Fr } from "./run-test.js";

runTestsWithSh2Fr("Run with Sh2FrViaTcp", () => new Sh2FrViaTcp());
