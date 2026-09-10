#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../subs/cli/src/run-cli.js';

const controller = new AbortController();
const interrupt = (): void => controller.abort();
let outputFailed = false;
const pending: Promise<void>[] = [];
const outputFailure = (): void => { outputFailed = true; controller.abort(); };
const write = (stream: NodeJS.WriteStream, text: string): void => {
  pending.push(new Promise<void>(done => {
    try { stream.write(text, error => { if (error) outputFailure(); done(); }); }
    catch { outputFailure(); done(); }
  }));
};
process.on('SIGINT', interrupt);
process.stdout.on('error', outputFailure);
process.stderr.on('error', outputFailure);
try {
  // The installed entry preserves dist/src; package metadata lives beside dist.
  const manifest = JSON.parse(await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf8')) as { version: string };
  process.exitCode = await runCli(process.argv.slice(2), { cwd: process.cwd(), version: manifest.version,
    stdout: text => write(process.stdout, text), stderr: text => write(process.stderr, text),
    batch: async (invocation, control) => (await import('./batch.js')).runBatch(invocation, control),
  }, { signal: controller.signal });
} catch (error) {
  process.exitCode = controller.signal.aborted ? 130 : 2;
  write(process.stderr, `Error [internal-error]: ${error instanceof Error ? error.message : String(error)}\n`);
} finally {
  await Promise.all(pending);
  if (controller.signal.aborted && !outputFailed && process.exitCode !== 130) {
    process.exitCode = 130;
    await new Promise<void>(done => process.stderr.write('Interrupted; no result claimed.\n', () => done()));
  }
  if (outputFailed) {
    process.exitCode = 2;
    if (!process.stderr.destroyed) await new Promise<void>(done => {
      process.stderr.write('Error [output-failure]: Could not write the complete CLI output.\n', () => done());
    });
  }
  process.off('SIGINT', interrupt);
  process.stdout.off('error', outputFailure);
  process.stderr.off('error', outputFailure);
}
