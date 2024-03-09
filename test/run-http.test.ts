import { Sh2FrViaHttp } from "../src/server/Sh2FrViaHttp.js";
import { runTestsWithSh2Fr } from "./run.js";

runTestsWithSh2Fr("Run with Sh2FrViaTcp", new Sh2FrViaHttp());
