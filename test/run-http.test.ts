import { Sh2FrViaHttp } from "../src/server/Sh2FrViaHttp.js";
import { runTestsWithSh2Fr } from "./run-test.js";

runTestsWithSh2Fr("Run with Sh2FrViaHttp", () => new Sh2FrViaHttp());
