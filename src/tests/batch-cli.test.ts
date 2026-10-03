import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAffectedBatch, runBatch } from '../batch.js';
import { runCli } from '../../subs/cli/src/run-cli.js';
import type { AnalysisDiagnostic, AnalysisReport } from '../../subs/analysis/src/interfaces/analysis.js';
import type { AffectedBatchInvocation, BatchInvocation } from '../interfaces/batch.js';
import type { AffectedDocument } from '../../subs/cli/src/interfaces/cli.js';
import { affectedFixture, fixture, invoke, put } from './fixture.js';

describe('CLI with real batch sessions', () => {
  for (const selection of ['resolved', 'unresolved'] as const) it(`labels ${selection} batch output without altering the JSON report`, async () => fixture(async root => {
    const cwd = selection === 'resolved' ? root : '/';
    const expected = await runBatch({ cwd, capabilities: ['static-access'] });
    if (expected.status !== 'reported') throw new Error('Expected real batch report');
    const batch = async () => expected;
    const human = await invoke(cwd, ['check', '--batch'], batch);
    const json = await invoke(cwd, ['check', '--batch', '--format', 'json'], batch);
    expect([human.exitCode, json.exitCode]).toEqual([selection === 'resolved' ? 0 : 2, selection === 'resolved' ? 0 : 2]);
    expect([human.stderr, json.stderr]).toEqual(['', '']);
    const lines = human.stdout.split('\n');
    expect(lines[1]).toBe(`Configuration: ${expected.report.scope?.configuration ?? 'unavailable'}`);
    expect(lines[2]).toBe('Mode: batch');
    expect(lines.filter(line => line.startsWith('Mode:'))).toEqual(['Mode: batch']);
    expect(json.stdout).toBe(JSON.stringify(expected.report) + '\n');
    expect(json.writes).toBe(1);
  }), 20_000);

  it('preserves the public report in JSON and formats the same completed evidence for humans', async () => fixture(async root => {
    const result = await runBatch({ cwd: root, root, capabilities: ['static-access'] });
    expect(result.status).toBe('reported');
    if (result.status !== 'reported') throw new Error('Expected report');
    const json = await invoke(root, ['check', '--batch', '--root', root, '--format', 'json']);
    const report = JSON.parse(json.stdout) as AnalysisReport;
    expect(json).toMatchObject({ exitCode: 0, stderr: '', writes: 1 });
    expect(report.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'complete' });
    expect(report.summary).toEqual(result.report.summary);
    expect(report.snapshot).toEqual(result.report.snapshot);
    const human = await invoke(root, ['check', '--batch', '--root', root], async () => ({ ...result, report }));
    expect(human).toMatchObject({ exitCode: 0, stderr: '' });
    expect(human.stdout).toContain(`Root: ${root} (given)`);
    expect(human.stdout).toContain(`Configuration: ${root}/tsconfig.json`);
    expect(human.stdout).toContain('Completed scope: 2 owners, 2 source files');
  }), 20_000);

  it('leaves only the snapshot out of the JSON report with --no-snapshot, before the batch result is returned', async () => fixture(async root => {
    await put(root, 'subs/consumer/src/use.ts', "import { privateValue } from '../../../src/interfaces/api.js'; void privateValue;\n");
    const full = await invoke(root, ['check', '--batch', '--root', root, '--format', 'json']);
    const invocations: BatchInvocation[] = [];
    const returned: (AnalysisReport['snapshot'])[] = [];
    const lean = await invoke(root, ['check', '--batch', '--root', root, '--format', 'json', '--no-snapshot'], async (invocation, control) => {
      invocations.push(invocation);
      const result = await runBatch(invocation, control);
      if (result.status === 'reported') returned.push(result.report.snapshot);
      return result;
    });
    expect([full.exitCode, lean.exitCode, lean.stderr, lean.writes]).toEqual([1, 1, '', 1]);
    expect(invocations).toEqual([{ cwd: root, root, capabilities: expect.any(Array), snapshot: false }]);
    expect(returned).toEqual([null]);
    const expected = JSON.parse(full.stdout) as AnalysisReport, report = JSON.parse(lean.stdout) as AnalysisReport;
    expect(expected.snapshot).not.toBeNull();
    expect(report).toEqual({ ...expected, runId: report.runId, snapshot: null });
    expect(report.summary.denied).toBe(1);
    expect(Buffer.byteLength(lean.stdout)).toBeLessThan(Buffer.byteLength(full.stdout));
  }), 20_000);

  it('uses discovery and accepts batch without narrowing the whole-project scope', async () => fixture(async root => {
    const result = await invoke(join(root, 'subs/consumer/src'), ['check', '--batch', '--format', 'json']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).scope).toMatchObject({ root, selection: 'found',
      walkedAreas: expect.arrayContaining(['src', 'subs/consumer/src']) });
  }), 15_000);

  it('prints failures before outside-source warnings, coverage and the completed scope', async () => fixture(async root => {
    await put(root, 'tests/helper.ts', 'export const helper = 1;');
    await put(root, 'subs/consumer/src/use.ts', "import { privateValue } from '../../../src/interfaces/api.js'; void privateValue; declare const target: string; void import(target);\n");
    const result = await invoke(root, ['check', '--batch']);
    expect(result.exitCode).toBe(1);
    const ordered = ['Error [not-visible] subs/consumer/src/use.ts:1:', 'Warning [outside-module-source] tests: 1',
      'Analysis limit [nonliteral-target]', 'Completed scope:'];
    const positions = ordered.map(text => result.stdout.indexOf(text));
    expect(positions.every(index => index >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(result.stdout).toContain('Original: fixture/interfaces/api.ts#privateValue');
    expect(result.stdout).toContain('Importer: fixture/consumer (ordinary; tags: none)');
  }), 15_000);

  it('allows bounded coverage and warnings while retaining their structured evidence', async () => fixture(async root => {
    await put(root, 'tests/helper.ts', 'export const helper = 1;');
    // A module: a script's ambient declaration would add a shared-global note.
    await put(root, 'subs/consumer/src/use.ts', "declare const path: string; void import(path); export {};\n");
    const result = await invoke(root, ['check', '--batch', '--format', 'json']);
    const report = JSON.parse(result.stdout) as AnalysisReport;
    expect(result.exitCode).toBe(0);
    expect(report.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'partial' });
    expect(report.warnings).toEqual([{ code: 'outside-module-source', entry: 'tests', count: 1, files: ['tests/helper.ts'] }]);
    expect(report.coverage[0].code).toBe('nonliteral-target');
    expect(report.snapshot!.inventory.files.some(file => file.path === 'tests/helper.ts')).toBe(false);
  }), 15_000);

  it('fails invalid descriptions with blocked checking as exit 1', async () => fixture(async root => {
    await put(root, 'module.ramify', 'ramify 1\nroot module fixture\nexpose-src value from "missing.ts" to descendants\n');
    const result = await invoke(root, ['check', '--batch', '--format', 'json']);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome: { execution: 'invalid', check: 'failed' },
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'missing-file' })]),
      stages: expect.arrayContaining([expect.objectContaining({ stage: 'decide', status: 'blocked' })]) });
  }), 15_000);

  it('reports no project without searching described projects below the working directory', async () => fixture(async root => {
    // Explicitly place the working directory outside all described ancestors.
    const result = await invoke('/', ['check', '--batch', '--format', 'json']);
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout).diagnostics).toEqual([expect.objectContaining({ code: 'root-not-found', message: 'No marked project root at or above /' })]);
  }), 15_000);

  it('selects only a marked root: an unmarked --root exits 1 and an unmarked climb exits 2, each saying to add the marker', async () => fixture(async root => {
    const explicit = await invoke(root, ['check', '--batch', '--format', 'json', '--root', 'subs/consumer']);
    expect(explicit.exitCode).toBe(1);
    expect(JSON.parse(explicit.stdout).diagnostics).toEqual([expect.objectContaining({ code: 'unmarked-root-description', category: 'layout',
      message: `${join(root, 'subs/consumer/module.ramify')} does not carry the root marker: add root before module on its module line to declare the project root` })]);
    await put(root, 'module.ramify', 'ramify 1\nmodule fixture\nexpose-src value from "interfaces/api.ts" to descendants\n');
    const found = await invoke(join(root, 'subs/consumer/src'), ['check', '--batch', '--format', 'json']);
    expect(found.exitCode).toBe(2);
    expect(JSON.parse(found.stdout).diagnostics).toEqual([expect.objectContaining({ code: 'root-not-found',
      message: `No marked project root at or above ${join(root, 'subs/consumer/src')}; the nearest description is ${join(root, 'subs/consumer/module.ramify')}: add root before module on its module line if it is the project root` })]);
  }), 15_000);

  it('refuses browser verification through the batch capability contract', async () => fixture(async root => {
    const unavailable = await runBatch({ cwd: root, root, capabilities: ['browser-verification'] });
    expect(unavailable).toMatchObject({ status: 'reported', exitCode: 2,
      report: { outcome: { execution: 'unavailable', check: 'not-run' }, diagnostics: [expect.objectContaining({ code: 'unavailable-capability' })] } });
    expect((await runBatch({ cwd: root, root, capabilities: ['tags-origin'] })).exitCode).toBe(0);
  }), 15_000);

  for (const status of ['missing', 'not-requested', 'blocked', 'failed'] as const) it(`rejects an injected ${status} access stage with empty findings`, async () => fixture(async root => {
    const result = await invoke(root, ['check', '--batch', '--format', 'json'], async (invocation, control) => {
      const baseline = await runBatch(invocation, control);
      if (baseline.status !== 'reported') throw new Error('Expected report');
      expect(baseline.exitCode).toBe(0);
      const stages = status === 'missing' ? baseline.report.stages.filter(stage => stage.stage !== 'access')
        : baseline.report.stages.map(stage => stage.stage === 'access' ? { ...stage, status } : stage);
      return { ...baseline, report: { ...baseline.report, stages } };
    });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome: { execution: 'incomplete', check: 'not-run' },
      diagnostics: [expect.objectContaining({ code: 'missing-stage' })], summary: { complete: false } });
  }), 15_000);

  it('keeps existing denials when a later report failure supersedes exit 1', async () => fixture(async root => {
    await put(root, 'subs/consumer/src/use.ts', "import { privateValue } from '../../../src/interfaces/api.js'; void privateValue;\n");
    const result = await invoke(root, ['check', '--batch', '--format', 'json'], async (invocation, control) => {
      const baseline = await runBatch(invocation, control);
      if (baseline.status !== 'reported') throw new Error('Expected report');
      expect(baseline.exitCode).toBe(1);
      const failure: AnalysisDiagnostic = { id: 'fault', code: 'resource-limit', category: 'limit', message: 'Report budget exhausted',
        location: null, related: [], importer: null, original: null, accessId: null };
      return { ...baseline, exitCode: 2, report: { ...baseline.report,
        outcome: { ...baseline.report.outcome, execution: 'incomplete', check: 'not-run' },
        stages: baseline.report.stages.map(stage => stage.stage === 'report' ? { ...stage, status: 'failed' } : stage),
        summary: { ...baseline.report.summary, complete: false, errors: 2 }, diagnostics: [...baseline.report.diagnostics, failure] } };
    });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout).diagnostics.map((issue: AnalysisDiagnostic) => issue.code)).toEqual(['not-visible', 'resource-limit']);
    expect(JSON.parse(result.stdout).summary.denied).toBe(1);
  }), 15_000);

  it('suppresses results when cancellation arrives through the injected binding', async () => fixture(async root => {
    const controller = new AbortController();
    const result = await invoke(root, ['check', '--batch', '--format', 'json'], async (invocation, control) => {
      const completed = await runBatch(invocation, control); controller.abort(); return completed;
    }, { signal: controller.signal });
    expect(result).toMatchObject({ exitCode: 130, stdout: '', stderr: 'Interrupted; no result claimed.\n' });
  }), 15_000);

  it('retains a known denial when an injected report exceeds the output budget', async () => fixture(async root => {
    await put(root, 'subs/consumer/src/use.ts', "import { privateValue } from '../../../src/interfaces/api.js'; void privateValue;\n");
    const result = await invoke(root, ['check', '--batch', '--format', 'json'], async (invocation, control) => {
      const baseline = await runBatch(invocation, control);
      if (baseline.status !== 'reported' || !baseline.report.snapshot) throw new Error('Expected denied baseline');
      expect(baseline.exitCode).toBe(1);
      const { report } = baseline, snapshot = report.snapshot!;
      return { ...baseline, report: { ...report, request: { ...report.request, limits: { ...report.request.limits, maxReportBytes: 64 * 1024 } },
        snapshot: { ...snapshot, inventory: { ...snapshot.inventory, modules: snapshot.inventory.modules.map(module => ({ ...module,
          purpose: { state: 'present', readme: 'README.md', paragraph: 'x'.repeat(100_000) } })) } } } };
    });
    expect([result.exitCode, result.stderr, result.writes]).toEqual([2, '', 1]);
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(64 * 1024 + 1);
    const report = JSON.parse(result.stdout) as AnalysisReport;
    expect(report).toMatchObject({ snapshot: null, outcome: { execution: 'incomplete', check: 'not-run' }, summary: { complete: false, denied: 1 } });
    expect(report.diagnostics.map(issue => issue.code)).toEqual(['not-visible', 'resource-limit']);
    expect(report.stages.find(stage => stage.stage === 'report')?.status).toBe('failed');
  }), 15_000);

  it('handles synchronous output failures after a real session releases its resources', async () => fixture(async root => {
    const errors: string[] = [];
    expect(await runCli(['check', '--batch', '--format', 'json'], { cwd: root, version: '1', connect: async () => { throw new Error('Unexpected daemon connection'); }, batch: runBatch,
      stdout: () => { throw new Error('Broken sink'); }, stderr: text => { errors.push(text); } })).toBe(2);
    expect(errors.join('')).toContain('output-failure');
  }), 15_000);

  it('A7-11: affected --batch hands the seeds to the affected batch operation alone and never connects', () => affectedFixture(async root => {
    const invocations: AffectedBatchInvocation[] = [];
    const stdout: string[] = [];
    const exitCode = await runCli(['affected', 'example/lone', '--path', 'subs/mid/src/interfaces/api.ts', '--path', 'docs/notes.md',
      '--batch', '--root', root, '--format', 'json'], { cwd: join(root, 'subs/lone'), version: '1', stdout: text => { stdout.push(text); },
      stderr: text => { throw new Error(text); }, connect: async () => { throw new Error('Unexpected daemon connection'); },
      batch: async () => { throw new Error('Unexpected check batch'); },
      affectedBatch: async (invocation, control) => { invocations.push(invocation); return runAffectedBatch(invocation, control); } });
    expect([exitCode, stdout.length]).toEqual([0, 1]);
    expect(invocations).toEqual([{ cwd: join(root, 'subs/lone'), root, modules: ['example/lone'],
      paths: ['subs/mid/src/interfaces/api.ts', 'docs/notes.md'] }]);
    const document = JSON.parse(stdout[0]!) as AffectedDocument;
    expect(document).toMatchObject({ mode: 'batch', root, revision: { sequence: null } });
    expect(document.selection).toMatchObject({ changedModules: [{ id: 'example/lone', directory: 'subs/lone' }, { id: 'example/mid', directory: 'subs/mid' }],
      affectedModules: [{ id: 'example/app', directory: 'subs/app' }], selection: 'all-modules', widening: ['unowned-path'],
      testModules: ['example', 'example/app', 'example/core', 'example/lone', 'example/mid'].map(id => expect.objectContaining({ id })) });
  }), 30_000);

  it('A7-11: affected --batch without an affected batch operation is unavailable, not a check', () => affectedFixture(async root => {
    const result = await invoke(root, ['affected', 'example/core', '--batch', '--format', 'json']);
    expect([result.exitCode, result.stderr, result.writes]).toEqual([2, '', 1]);
    expect(JSON.parse(result.stdout)).toMatchObject({ schemaVersion: 'ramify.cli/1', diagnostics: [{ code: 'unavailable' }] });
  }), 15_000);

  it('A7-11: handles an output failure after a real affected batch session', () => affectedFixture(async root => {
    const errors: string[] = [];
    expect(await runCli(['affected', 'example/core', '--batch', '--format', 'json'], { cwd: root, version: '1',
      connect: async () => { throw new Error('Unexpected daemon connection'); }, batch: runBatch, affectedBatch: runAffectedBatch,
      stdout: () => { throw new Error('Broken sink'); }, stderr: text => { errors.push(text); } })).toBe(2);
    expect(errors.join('')).toContain('output-failure');
  }), 15_000);
});
