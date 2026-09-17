import { analyzeDependencyDiagram } from '../subs/analysis/src/index.js';
import type { DependencyAnalyzerOutcome } from '../subs/analysis/src/index.js';
import { limits } from './batch.js';
import { dependencyAnalyzerCapacity } from './dependency-analyzer-process.js';

// Node child of the dependency diagram runner: one analyzer run over the
// { project, report } request read from standard input, and one JSON outcome
// written to standard output. The analyzer deadline leaves the runner's
// disposal allowance for this process and its compiler helper to exit.
const controller = new AbortController();
const cancel = (): void => controller.abort();
process.on('SIGINT', cancel);
process.on('SIGTERM', cancel);

async function request(): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    bytes += chunk.length;
    if (bytes > dependencyAnalyzerCapacity.requestBytes) throw new Error('The dependency analyzer request exceeds its capacity');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
}

let outcome: DependencyAnalyzerOutcome;
try {
  const value = await request() as { project?: unknown; report?: unknown } | null;
  const project = value?.project as { cwd?: unknown } | undefined;
  if (!project || typeof project.cwd !== 'string' || !value?.report || typeof value.report !== 'object') {
    outcome = { status: 'unavailable', reason: 'invalid-report', message: 'The dependency analyzer request needs a project and a report' };
  } else {
    outcome = await analyzeDependencyDiagram({ project: value.project as never, report: value.report as never,
      limits: { source: limits.source, maxResultBytes: dependencyAnalyzerCapacity.maxResultBytes, deadlineMs: dependencyAnalyzerCapacity.analysisDeadlineMs } },
    { signal: controller.signal });
  }
} catch (error) {
  outcome = controller.signal.aborted ? { status: 'cancelled' }
    : { status: 'unavailable', reason: 'invalid-report', message: `Invalid dependency analyzer request: ${error instanceof Error ? error.message : String(error)}` };
}
await new Promise<void>(done => { process.stdout.write(`${JSON.stringify(outcome)}\n`, () => done()); });
process.off('SIGINT', cancel);
process.off('SIGTERM', cancel);
// The compiler helper is already disposed; nothing else may keep this process alive.
process.exit(0);
