import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import { assertEquivalentReports, parseAnalysisDocument } from './equivalence-comparison.js';
import { withSequenceProcess, object, readTrace } from './equivalence-process.js';
import type { SequenceProcess } from './equivalence-process.js';
import { applySequenceStep, assertSequenceReport, equivalenceSequences, prepareSequence, sequenceFixture } from './equivalence-sequences.js';
import type { EditSequence, SequenceName, SequenceStep } from './equivalence-sequences.js';
import { watchCompletionTimeoutMs, watchEditTargetMs, watchRevision, withLiveWatch } from './equivalence-watch.js';
import { runIsolatedProject } from './mutation.js';
import { analysisEvidence, archiveObservation, recordObservation } from './observations.js';
import { repositoryRoot } from './plan.js';
import { filesBelow } from './reference-baseline.js';
import { Assertions } from './runner.js';
import type { InstanceHandler } from './runner.js';

function oracle(label: string, fixture: EditSequence['fixture'], step: SequenceStep | null,
  baseline: AnalysisReport, report: AnalysisReport, assertions: Assertions): void {
  const local = new Assertions();
  try { assertSequenceReport(fixture, step, baseline, report, local); }
  finally { for (const item of local.finish()) assertions.ok(`${label}: ${item.name}${item.error ? `: ${item.error}` : ''}`, item.status === 'passed'); }
}

async function compare(processes: SequenceProcess, root: string, fixture: EditSequence['fixture'], step: SequenceStep | null,
  baseline: AnalysisReport | null, assertions: Assertions): Promise<AnalysisReport> {
  const batch = await processes.check(root, true);
  const resident = await processes.check(root, false);
  const name = step?.name ?? 'baseline';
  oracle(`${name}/batch`, fixture, step, baseline ?? batch, batch, assertions);
  oracle(`${name}/resident`, fixture, step, baseline ?? batch, resident, assertions);
  assertEquivalentReports(batch, resident);
  assertions.ok(`${name}: complete reports equal except runId`, true);
  const digest = (report: AnalysisReport) => createHash('sha256').update(JSON.stringify({ ...report, runId: 'comparison' })).digest('hex');
  recordObservation('equivalent-reports', { step: name, anchor: step?.anchor, batchSha256: digest(batch), residentSha256: digest(resident),
    evidence: analysisEvidence(resident), linkedStatus: resident.snapshot?.linked?.status,
    raw: await archiveObservation('equivalent-reports', { step: name, anchor: step?.anchor, batch, resident }) });
  return resident;
}

async function fileIdentities(root: string): Promise<readonly (readonly [string, string])[]> {
  return Promise.all((await filesBelow(root)).map(async path => [path,
    createHash('sha256').update(await readFile(join(root, path))).digest('hex')] as const));
}

export async function runEquivalenceSequence(name: SequenceName, root: string, assertions: Assertions): Promise<void> {
  const sequence: EditSequence = equivalenceSequences[name];
  await withSequenceProcess(async processes => {
    const initial = await processes.status();
    assertions.equal('unique endpoint initially has no daemon', [initial.running, initial.record], [false, null]);
    const initialFiles = sequence.fixture === 'S100' ? await fileIdentities(root) : null;
    const baseline = await compare(processes, root, sequence.fixture, null, null, assertions);
    const status = await processes.status();
    assertions.equal('resident check starts a real daemon', status.running, true);
    const daemon = object(status.status), identity = [daemon.instanceId, daemon.pid, daemon.buildKey];
    assertions.ok('daemon has a live process identity', typeof daemon.pid === 'number' && daemon.pid > 0);
    process.kill(daemon.pid as number, 0);
    const trace = await readTrace(processes.traceFile);
    assertions.ok('compiled daemon entry runs in the reported process', trace.some(e => e.pid === daemon.pid
      && e.event === 'load' && e.url?.endsWith('/dist/src/daemon-entry.js')));
    assertions.ok('reported daemon listens on the owned socket', trace.some(e => e.pid === daemon.pid
      && e.event === 'listen' && e.path?.startsWith(processes.endpoint + '/')));
    if (!name.endsWith('-live')) {
      let previous = baseline;
      for (const step of sequence.steps) {
        const paths = await applySequenceStep(root, step);
        const report = await compare(processes, root, sequence.fixture, step, baseline, assertions);
        if (step.expected === 's100-restored') assertions.equal('revert restores every S100 path and byte',
          await fileIdentities(root), initialFiles);
        assertions.ok(`${step.name}: new input identity after edit`, report.inputId !== previous.inputId);
        recordObservation('sequence-edit', { step: step.name, paths });
        previous = report;
      }
    } else {
      // Watch starts against the already published baseline. No check is issued
      // between a mutation and its observed watch revision.
      await withLiveWatch(processes, root, async next => {
        const first = await next(30_000);
        assertions.equal('watch starts with status', first.value.event, 'status');
        const current = object(first.value.current), published = object(current.published);
        assertions.equal('watch starts on the baseline input', object(published.fingerprints).inputId, baseline.inputId);
        assertions.equal('real watcher is active', current.watcher, 'active');
        let initial = await next(30_000);
        while (initial.value.event === 'status') initial = await next(30_000);
        assertions.equal('initial watch revision matches published status', initial.value.revision, published);
        assertEquivalentReports(parseAnalysisDocument(JSON.stringify(initial.value.report)), baseline);
        let previousSequence = Number(published.sequence), previousInput = baseline.inputId;
        const importer = sequence.fixture === 'F' ? await readFile(join(root, 'subs/consumer/src/probe.ts'), 'utf8') : null;
        for (const step of sequence.steps) {
          const startedAt = performance.now();
          const paths = await applySequenceStep(root, step);
          let line = await next(watchCompletionTimeoutMs - (performance.now() - startedAt));
          while (line.value.event === 'status') line = await next(watchCompletionTimeoutMs - (performance.now() - startedAt));
          const watched = watchRevision(line, current.token, previousSequence, startedAt, step.expectedChangedPaths ?? paths);
          assertions.ok(`${step.name}: watcher publishes within the completion guard`, watched.elapsedMs <= watchCompletionTimeoutMs);
          assertions.ok(`${step.name}: watcher captured changed inputs`, watched.report.inputId !== previousInput);
          oracle(`${step.name}/watch`, sequence.fixture, step, baseline, watched.report, assertions);
          const checked = await compare(processes, root, sequence.fixture, step, baseline, assertions);
          assertEquivalentReports(watched.report, checked);
          assertions.ok(`${step.name}: subsequent synchronized check confirms watch report`, true);
          if (importer !== null) assertions.equal(`${step.name}: unmarked importer bytes are unchanged`,
            await readFile(join(root, 'subs/consumer/src/probe.ts'), 'utf8'), importer);
          recordObservation('watch-edit-timing', { step: step.name, elapsedMs: watched.elapsedMs, targetMs: watchEditTargetMs, enforcement: 'advisory', targetMet: watched.elapsedMs <= watchEditTargetMs, paths });
          previousSequence = watched.sequence; previousInput = watched.report.inputId;
        }
      });
    }
    const after = await processes.status();
    const last = object(after.status);
    assert.deepEqual([last.instanceId, last.pid, last.buildKey], identity, 'Sequence must retain the same daemon instance');
  });
}

export const equivalenceHandlers: ReadonlyMap<string, InstanceHandler> = new Map(
  (Object.keys(equivalenceSequences) as SequenceName[]).map(name => {
    const sequence = equivalenceSequences[name];
    const id = `${name.endsWith('-live') ? 'I2-26' : 'I2-25'}:${name}`;
    return [id, { kind: 'memory', run: async ({ assertions }) => {
      const result = await runIsolatedProject({ workRoot: join(repositoryRoot, '.reference-work'), instanceId: id,
        fixture: sequenceFixture(sequence.fixture) }, async ({ root }) => {
        await prepareSequence(root, sequence.fixture);
        await runEquivalenceSequence(name, root, assertions);
      });
      if (!result.ok) throw result.error;
    } }];
  }),
);
