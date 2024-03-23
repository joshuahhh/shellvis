import { Sh2FrViaTcpNoPipe } from '../src/server/Sh2FrViaTcpNoPipe.js';
import { runTestsWithSh2Fr } from './run-test.js';

runTestsWithSh2Fr('Run with Sh2FrViaTcpNoPipe', () => new Sh2FrViaTcpNoPipe());
