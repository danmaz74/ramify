import { describe, expect, it, vi } from 'vitest';
import { analyzeProject } from '../index.js';
import type { AnalysisReport, RetainedSession, SessionInputs, SessionRevision } from '../index.js';
import { ReportDraft, byteOrder } from '../report.js';
import { draftReport } from '../session-facts.js';
import type { SessionState } from '../session-revision.js';
import { audited, comparable, equalToBatch, fixture, fixtureFiles, opened, parentExposure, paths, put, replace, revised,
  timeout } from './session-test-fixture.js';

const copies = vi.hoisted(() => ({ count: 0 }));
vi.mock('../report-copy.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../report-copy.js')>();
  return { ...actual, copyReport: <T>(input: T): T => { copies.count++; return actual.copyReport(input); } };
});

const tools = 'tools/outside.ts';
/** Findings, an outside-source warning and coverage notes, so every list a revision keeps is non-empty. */
const evidence: Record<string, string> = {
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
    types: [], skipLibCheck: true }, include: ['src', 'subs', 'tools'] }),
  [tools]: 'export const outside = 1;\n',
  [paths.sibling]: "import { rootValue, privateValue } from '../../../src/interfaces/api.js';\n"
    + "import { outside } from '../../../tools/outside.js';\ndeclare const target: string;\n"
    + 'void import(target);\nvoid rootValue; void privateValue; void outside;\n',
};

const kept = (value: Pick<AnalysisReport, 'outcome' | 'summary' | 'diagnostics' | 'warnings' | 'coverage'>): string =>
  JSON.stringify({ outcome: value.outcome, summary: value.summary, diagnostics: value.diagnostics, warnings: value.warnings, coverage: value.coverage });

/** Count the work a full report does while an operation publishes. */
async function publishing<T>(operation: () => Promise<T>): Promise<{ result: T; patches: number; builds: number; bounds: number; copies: number }> {
  const patch = vi.spyOn(ReportDraft.prototype, 'patch'), build = vi.spyOn(ReportDraft.prototype, 'build');
  const bounded = vi.spyOn(ReportDraft.prototype, 'bounded');
  copies.count = 0;
  try {
    const result = await operation();
    return { result, patches: patch.mock.calls.length, builds: build.mock.calls.length, bounds: bounded.mock.calls.length, copies: copies.count };
  } finally { patch.mockRestore(); build.mockRestore(); bounded.mockRestore(); }
}

/** The revision's kept fields equal a full `finish()` of the same retained facts and the requested report. */
async function expectFullFields(handle: RetainedSession, state: SessionState, revision: SessionRevision): Promise<AnalysisReport> {
  const invalid = revision.outcome.execution === 'invalid';
  const full = draftReport(state.facts!, state.request, revision.inputs, invalid ? null : revision.inputId).finish();
  expect(kept(revision)).toBe(kept(full));
  const requested = await handle.report();
  expect(comparable(requested)).toEqual(comparable(full));
  return full;
}

async function batch(inputs: SessionInputs): Promise<AnalysisReport> {
  const { session: _session, ...request } = inputs;
  const run = await analyzeProject(request);
  if (run.status !== 'reported') throw new Error('Expected a batch report');
  return run.report;
}

describe('hook publication builds only what a revision keeps', () => {
  it('publication-without-snapshot: open and updates build, measure and copy no full report, and keep the fields a full finish() yields', () => fixture(async (root, inputs) => {
    const open = await publishing(() => opened(inputs));
    const { handle, revision, state } = open.result;
    try {
      expect([open.patches, open.builds, open.bounds, open.copies]).toEqual([0, 0, 0, 0]);
      expect(revision.outcome).toEqual({ execution: 'completed', check: 'failed', coverage: 'partial' });
      expect([revision.diagnostics.length, revision.warnings.length, revision.coverage.length].every(count => count > 0)).toBe(true);
      expect(revision.summary).toMatchObject({ owners: 4, originals: 5, accesses: 7, allowed: 4, denied: 1, errors: 1,
        warnings: 1, coverageNotes: 2 });
      const opening = await expectFullFields(handle, state, revision);
      expect(opening.snapshot?.accesses).toHaveLength(revision.summary.accesses);

      // A further denial on the source path, then an invalid link and an invalid acquisition, then recovery.
      const steps: [string, () => Promise<unknown>, readonly string[], SessionRevision['outcome']['execution']][] = [
        ['source', () => replace(root, paths.leaf, 'void value;', "void value;\nimport { privateValue } from '../../../../../src/interfaces/api.js';\nvoid privateValue;"), [paths.leaf], 'completed'],
        ['link', () => replace(root, paths.description, parentExposure, 'expose-src value to parent\n'), [paths.description], 'invalid'],
        ['acquisition', () => put(root, 'subs/sibling/module.ramify', 'ramify 1\nmodule\n'), ['subs/sibling/module.ramify'], 'invalid'],
        ['recovery', async () => { await put(root, paths.description, fixtureFiles[paths.description]!);
          await put(root, 'subs/sibling/module.ramify', fixtureFiles['subs/sibling/module.ramify']!); },
        [paths.description, 'subs/sibling/module.ramify'], 'completed'],
      ];
      let previous = revision;
      for (const [label, edit, changed, execution] of steps) {
        await edit();
        const update = await publishing(() => revised(handle, changed));
        expect([label, update.patches, update.builds, update.bounds, update.copies]).toEqual([label, 0, 0, 0, 0]);
        expect([label, update.result.outcome.execution]).toEqual([label, execution]);
        expect(update.result.sequence).toBe(previous.sequence + 1);
        await expectFullFields(handle, state, update.result);
        previous = update.result;
      }
      expect(previous.summary.denied).toBe(2);
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }, evidence), timeout);

  it('full-report-on-request: a requested report equals batch and still fails over maxReportBytes where it is built', () => fixture(async (root, inputs) => {
    // A long purpose enlarges only the snapshot, past the envelope reserve.
    await put(root, paths.readme, `# Branch\n\n${'Long purpose. '.repeat(8 * 1024)}\n`);
    const baseline = await opened(inputs);
    let lists: number;
    try {
      const report = await equalToBatch(baseline.handle, inputs);
      expect(report.snapshot).not.toBeNull();
      lists = Buffer.byteLength(JSON.stringify({ diagnostics: report.diagnostics, warnings: report.warnings, coverage: report.coverage }));
      // Only the snapshot pushes the full report's evidence past the bounded limit below.
      expect(Buffer.byteLength(JSON.stringify(report))).toBeGreaterThan(64 * 1024 + lists + 4096);
    } finally { await baseline.handle.dispose(); }
    const maximum = 64 * 1024 + lists + 1024;
    const bounded = { ...inputs, limits: { ...inputs.limits, maxReportBytes: maximum } };
    const { handle, revision, state } = await opened(bounded);
    try {
      expect(kept(revision)).toBe(kept(baseline.revision));
      const report = await handle.report();
      expect(report?.outcome).toEqual({ execution: 'incomplete', check: 'not-run', coverage: 'partial' });
      expect(report?.snapshot).toBeNull();
      expect(report?.stages.find(stage => stage.stage === 'report')?.status).toBe('failed');
      expect(report?.diagnostics).toContainEqual(expect.objectContaining({ code: 'resource-limit', category: 'limit',
        limit: expect.objectContaining({ name: 'maxReportBytes', maximum, collectedPrefix: true }) }));
      expect(Buffer.byteLength(JSON.stringify(report))).toBeLessThanOrEqual(maximum);
      // The report built on request, a full finish() of the retained facts and batch agree byte for byte.
      const full = draftReport(state.facts!, state.request, revision.inputs, revision.inputId).finish();
      expect(JSON.stringify({ ...report, runId: null })).toBe(JSON.stringify({ ...full, runId: null }));
      expect(JSON.stringify({ ...report, runId: null })).toBe(JSON.stringify({ ...await batch(bounded), runId: null }));
      expect(await handle.report(undefined, revision.sequence)).toEqual({ ...report, runId: expect.any(String) });
    } finally { await handle.dispose(); }
  }, evidence), timeout);

  it('orders strings by UTF-8 bytes without encoding them, as Buffer.compare does', () => {
    const samples = ['', 'a', 'ab', 'b', 'z', '\u007f', '\u0080', 'é', '\u07ff', '\u0800', '\ud7ff', '\ue000', '\uffff', '\ufffd',
      '\u{10000}', '\u{1f600}', '\u{10ffff}', '\ud800', '\udc00', '\udc00\ud800', 'a\ud800b', 'names/é.ts', 'names/\u{1f600}.ts', 'names/\ue000.ts'];
    for (const a of samples) for (const b of samples) {
      expect([a, b, byteOrder(a, b)]).toEqual([a, b, Buffer.compare(Buffer.from(a), Buffer.from(b))]);
    }
  });
});
