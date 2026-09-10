import { runBatch } from '../../src/batch.js';
import { runCli } from '../../subs/cli/src/index.js';

// A real handler with a real injected session; OS-level faults come from the
// isolated process probe, never from a substitute catalog/checker.
process.exitCode = await runCli(process.argv.slice(2), { cwd: process.cwd(), version: 'test',
  stdout: text => { process.stdout.write(text); }, stderr: text => { process.stderr.write(text); }, batch: runBatch });
