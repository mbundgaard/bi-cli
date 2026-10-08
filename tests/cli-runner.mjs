// Unpackaged test-only dependency injection. Production has no directory override.
import path from 'node:path';
import { main } from '../dist/cli.js';
import { StateStore } from '../dist/state.js';
const directory = process.argv[2];
if (!directory || !path.isAbsolute(directory)) throw new Error('Absolute isolated test directory required');
process.exitCode = await main([process.execPath, 'bi', ...process.argv.slice(3)], new StateStore(directory), async () => {});
