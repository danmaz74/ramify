import { runBatch } from './batch.js';
import type { BatchInvocation } from './interfaces/batch.js';

// Node child of the compiled client: one batch run, its BatchResult written to stdout as JSON.
// Rendering, exit codes and fallback wording stay with the client.
const controller = new AbortController();
const cancel = (): void => controller.abort();
process.on('SIGINT', cancel);
process.on('SIGTERM', cancel);
try {
  const invocation = JSON.parse(process.argv[2] ?? '') as BatchInvocation;
  const result = await runBatch(invocation, { signal: controller.signal });
  await new Promise<void>((done, fail) => { process.stdout.write(`${JSON.stringify(result)}\n`, error => error ? fail(error) : done()); });
} catch (error) {
  process.exitCode = 2;
  await new Promise<void>(done => { process.stderr.write(error instanceof Error ? error.message : String(error), () => done()); });
} finally {
  process.off('SIGINT', cancel);
  process.off('SIGTERM', cancel);
}
