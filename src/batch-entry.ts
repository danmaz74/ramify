import { runAffectedBatch, runBatch } from './batch.js';
import type { AffectedBatchInvocation, BatchInvocation } from './interfaces/batch.js';

// Node child of the compiled client: one batch run, its result written to stdout as JSON.
// A lone argument is a check's BatchInvocation; `affected` followed by an
// AffectedBatchInvocation runs the affected-module form. Rendering, exit codes and
// fallback wording stay with the client.
const controller = new AbortController();
const cancel = (): void => controller.abort();
process.on('SIGINT', cancel);
process.on('SIGTERM', cancel);
try {
  const affected = process.argv[2] === 'affected' && process.argv.length === 4;
  const invocation: unknown = JSON.parse((affected ? process.argv[3] : process.argv[2]) ?? '');
  const control = { signal: controller.signal };
  const result = affected ? await runAffectedBatch(invocation as AffectedBatchInvocation, control)
    : await runBatch(invocation as BatchInvocation, control);
  await new Promise<void>((done, fail) => { process.stdout.write(`${JSON.stringify(result)}\n`, error => error ? fail(error) : done()); });
} catch (error) {
  process.exitCode = 2;
  await new Promise<void>(done => { process.stderr.write(error instanceof Error ? error.message : String(error), () => done()); });
} finally {
  process.off('SIGINT', cancel);
  process.off('SIGTERM', cancel);
}
