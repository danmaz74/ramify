import { writeSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setImmediate as yieldTurn, setTimeout as delay } from 'node:timers/promises';
import { runCli } from '../subs/cli/src/run-cli.js';
import type { BatchOperation } from './interfaces/batch.js';
import { createBuildRefusal, createServiceConnector, type ClientLocation } from './client.js';
import { reportCapacity } from './report-capacity.js';
import { createPublicationQueue } from './publication-queue.js';

export interface CliProcessOptions {
  /** Installed package root; its manifest supplies the version. */
  readonly packageRoot: string;
  readonly batch: BatchOperation;
  readonly location?: ClientLocation;
  /** The runtime identity a compiled client embeds; commands refuse an installed build with another. */
  readonly buildIdentity?: string;
}

/** One CLI invocation bound to this process's argv, signals and standard streams.
 * Shared by the Node entry and the compiled client, which differ only in location and batch. */
export async function runCliProcess(options: CliProcessOptions): Promise<void> {
  const controller = new AbortController();
  let published = false;
  const streaming = process.argv[2] === 'watch';
  const interrupt = (): void => { if (streaming || !published) controller.abort(); };
  let outputFailed = false;
  const pending = new Set<Promise<void>>();
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
  const publications = createPublicationQueue(publish, reportCapacity.cliOutputBytes);
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
    const manifest = JSON.parse(await readFile(join(options.packageRoot, 'package.json'), 'utf8')) as { version: string };
    process.exitCode = await runCli(process.argv.slice(2), { cwd: process.cwd(), version: manifest.version,
      stdout: text => {
        try { track(publications.append(text)); }
        catch (error) { outputFailure(); throw error; }
      }, stderr: text => write(process.stderr, text),
      connect: createServiceConnector(manifest.version, options.location),
      batch: options.batch,
      ...(options.buildIdentity === undefined ? {} : { buildRefusal: createBuildRefusal(manifest.version, options.packageRoot, options.buildIdentity) }),
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
}
