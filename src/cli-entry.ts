#!/usr/bin/env node
import { writeSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setImmediate as yieldTurn, setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { runCli } from '../subs/cli/src/run-cli.js';
import { createServiceConnector } from './client.js';

const controller = new AbortController();
let published = false;
const streaming = process.argv[2] === 'watch';
const interrupt = (): void => { if (streaming || !published) controller.abort(); };
let outputFailed = false;
const pending = new Set<Promise<void>>();
let publication = Promise.resolve(), queuedBytes = 0;
function track(task: Promise<void>): void {
  pending.add(task);
  void task.then(() => pending.delete(task), () => { pending.delete(task); outputFailure(); });
}
const outputFailure = (): void => { outputFailed = true; controller.abort(); };
const publish = async (text: string): Promise<void> => {
  const bytes = Buffer.from(text);
  // The result is claimed once its last non-whitespace byte is written; only
  // trailing whitespace may still be pending after that commit.
  const document = Buffer.byteLength(text.trimEnd()) || bytes.length;
  let offset = 0;
  while (offset < bytes.length && !controller.signal.aborted) {
    try {
      // POSIX stdout pipes are nonblocking. Write only admitted bytes, leaving
      // no queued document to flush after cancellation. Yield between chunks.
      offset += writeSync(process.stdout.fd, bytes, offset, Math.min(16 * 1024, bytes.length - offset));
    } catch (error) {
      if (!['EAGAIN', 'EWOULDBLOCK'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        outputFailure(); return;
      }
      await delay(10); continue;
    }
    // No await separates the native write completing the document and this
    // commit: a later SIGINT must retain the result's exit code rather than
    // disown a published report, even while its trailing newline is pending.
    if (offset >= document) published = true;
    if (offset < bytes.length) await yieldTurn();
  }
};
const write = (stream: NodeJS.WriteStream, text: string): void => {
  track(new Promise<void>(done => {
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
    stdout: text => {
      const bytes = Buffer.byteLength(text);
      if (queuedBytes + bytes > 64 * 1024 ** 2) {
        outputFailure(); throw new Error('CLI output queue exceeded 64 MiB');
      }
      queuedBytes += bytes;
      publication = publication.then(() => publish(text)).finally(() => { queuedBytes -= bytes; });
      track(publication);
    }, stderr: text => write(process.stderr, text),
    connect: createServiceConnector(manifest.version),
    batch: async (invocation, control) => (await import('./batch.js')).runBatch(invocation, control),
  }, { signal: controller.signal });
} catch (error) {
  process.exitCode = controller.signal.aborted ? 130 : 2;
  write(process.stderr, `Error [internal-error]: ${error instanceof Error ? error.message : String(error)}\n`);
} finally {
  await Promise.allSettled(pending);
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
