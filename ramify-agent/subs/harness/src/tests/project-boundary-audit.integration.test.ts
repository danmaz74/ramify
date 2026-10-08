import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { gateDiagnostics } from '../checks/diagnostics.js';
import type { GateAttempt } from '../checks/records.js';
import { gateViewSchema } from '../interfaces/protocol/runs.js';
import { runView } from '../projections/inputs.js';
import { gateOf } from '../projections/work.js';
import { gateAttemptSchema } from '../run/records.js';
import { constructedRun } from './helpers/constructed.js';
import {
  auditDefinition, commandCheck, configuredGate, configuredRepository, privateConfiguredAudit, recordingOwnership,
  type ConfiguredRepository,
} from './helpers/configured-repository.js';
import { rootDescription } from './helpers/root-description.js';

/*
 * F4's nested sequence through the installed provider: a final gate asks a
 * full nested audit of a Ramify root that declares an owned nested project
 * and an external tree. The owned nested project (not a Ramify project, with
 * an ignored documentation tree) encloses a grandchild project of its own;
 * the external tree holds a definition discovery must skip. Every check is a
 * command that appends its project's name to a counter outside the
 * repository, so a test sees exactly which projects executed. Setting
 * PLAN21_ITERATION10_EVIDENCE to a directory writes each witness's attempts
 * and provider artifacts there.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

beforeAll(() => {
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  process.env.GIT_CONFIG_SYSTEM = '/dev/null';
});

async function scratch(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  cleanups.push(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function audit(ownership = recordingOwnership()) {
  const created = await privateConfiguredAudit(ownership);
  cleanups.push(created.remove);
  return { ...created, ownership };
}

async function evidence(name: string, value: unknown): Promise<void> {
  const directory = process.env['PLAN21_ITERATION10_EVIDENCE'];
  if (directory === undefined) return;
  await writeFile(join(directory, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

interface F4 {
  readonly repository: ConfiguredRepository & { readonly head: string };
  /** How many times each project's check executed. */
  runs(): Promise<Record<string, number>>;
  /** While this file exists, the grandchild's check records its process and waits. */
  readonly hold: string;
  readonly held: string;
}

async function f4(state: 'pass' | 'fail'): Promise<F4> {
  const outside = await scratch('ramify-agent-f4-nested-');
  const counter = join(outside, 'runs');
  const hold = join(outside, 'hold');
  const held = join(outside, 'held');
  const count = (project: string) => `require('fs').appendFileSync(${JSON.stringify(counter)}, ${JSON.stringify(`${project}\n`)})`;
  const command = (project: string, program = count(project)) => commandCheck(`${project.replaceAll('/', '-')}-check`, [
    { name: project.replaceAll('/', '-'), cmd: 'node', args: ['-e', program] },
  ]);
  const grandchild = [
    count('engine/tools'),
    `const fs = require('fs')`,
    `if (fs.existsSync(${JSON.stringify(hold)})) { fs.writeFileSync(${JSON.stringify(held)}, String(process.pid)); setInterval(() => {}, 1000); } `
      + `else if (fs.readFileSync('state.txt', 'utf8').trim() !== 'pass') { console.error('grandchild state is not pass'); process.exit(1); }`,
  ].join('; ');
  const repository = await configuredRepository({
    'module.ramify': rootDescription('f4', 'owned-unwired "docs"\nowned-nested-project "engine"\nexternal "vendor"\n'),
    'tsconfig.json': '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","target":"ES2022","strict":true,"skipLibCheck":true},"include":["src"]}\n',
    'package.json': '{"name":"f4","private":true,"type":"module"}\n',
    'src/index.ts': 'export const value = 1;\n',
    'docs/guide.md': '# F4\n',
    'ramify-audit.json': auditDefinition([command('root')]),
    'engine/package.json': '{"name":"f4-engine","private":true}\n',
    'engine/index.js': 'module.exports = 1;\n',
    'engine/docs/notes.md': '# Engine\n',
    'engine/ramify-audit.json': auditDefinition([command('engine')], { ignorePaths: ['docs/**'], packageDirectories: [] }),
    'engine/tools/state.txt': `${state}\n`,
    'engine/tools/ramify-audit.json': auditDefinition([command('engine/tools', grandchild)], { packageDirectories: [] }),
    'vendor/lib/ramify-audit.json': auditDefinition([command('vendor/lib')], { packageDirectories: [] }),
  }, 'ramify-agent-f4-nested-');
  cleanups.push(repository.remove);
  return {
    repository, hold, held,
    async runs() {
      const lines = existsSync(counter) ? (await readFile(counter, 'utf8')).split('\n').filter(Boolean) : [];
      return Object.fromEntries(['root', 'engine', 'engine/tools', 'vendor/lib'].map(project => [project, lines.filter(line => line === project).length]));
    },
  };
}

/**
 * The gate views the harness serves for these attempts once a run recorded
 * them: each durable attempt replayed through the run projection, exactly
 * as the web receives it. The browser witness renders them.
 */
async function exportGateViews(name: string, gates: Readonly<Record<string, GateAttempt>>): Promise<void> {
  const durable = Object.values(gates).map(gate => {
    const { auditOverall: _overall, ...attempt } = gate;
    return gateAttemptSchema.parse(JSON.parse(JSON.stringify(attempt)));
  });
  const view = runView(constructedRun(durable.map(attempt => ({
    type: 'gate-attempted', data: { gate: attempt.id, checkpoint: attempt.checkpoint, verdict: attempt.verdict, next: attempt.next },
    records: [{ path: `gates/${attempt.id}/attempt.json`, body: attempt }],
  }))));
  await evidence(name, {
    schema: 'plan21.iteration10.gate-views/1', source: 'project-boundary-audit.integration.test.ts',
    gates: Object.fromEntries(Object.entries(gates).map(([label, gate]) => [label, gateViewSchema.parse(gateOf(view, gate.id))])),
  });
}

/** What a final gate shows a reviewer, with each project's identities, and the provider artifacts. */
function digest(gate: GateAttempt) {
  return {
    verdict: gate.verdict, cause: gate.cause, audited: gate.audited, evidence: gate.evidence,
    audit: gate.audit, invocation: (gate.provider?.result as { invocationVerdict?: unknown } | undefined)?.invocationVerdict ?? null,
  };
}

const projectsOf = (gate: GateAttempt) => gate.audit?.projects?.map(project => [project.projectRoot, project.verdict, project.execution]) ?? null;

async function settled(pid: number): Promise<boolean> {
  for (let tries = 0; tries < 200; tries += 1) {
    try { process.kill(pid, 0); } catch { return true; }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return false;
}

describe('a full nested final audit over F4 (PB3-E05)', () => {
  it('audits every eligible project, skips the external tree with its reason, and fails on a nested failure under a passing root', { timeout: 300_000 }, async () => {
    const fixture = await f4('fail');
    const { repository } = fixture;
    const { audit: port } = await audit();
    const failing = await configuredGate(port, repository, {
      captured: repository.head, sourceCommit: repository.head, attemptId: 'ga-0001', checkpoint: 'final', mode: 'full', nested: true,
    });
    // The attempt persists as the run records it: the in-memory overall is not durable.
    const { auditOverall: _overall, ...durable } = failing;
    expect(gateAttemptSchema.safeParse(JSON.parse(JSON.stringify(durable))).error?.issues ?? []).toEqual([]);
    expect([failing.verdict, failing.cause]).toEqual(['failed', 'check-failed']);
    expect(failing.audit).toMatchObject({ mode: 'full', nested: true, status: 'completed', executedMode: 'full', verdict: 'fail' });
    // The root's own record passed; the invocation's verdict is the nested failure.
    expect((failing.provider?.result as { composition: { verdict: string } }).composition.verdict).toBe('pass');
    expect(projectsOf(failing)).toEqual([['.', 'pass', 'ran'], ['engine', 'pass', 'ran'], ['engine/tools', 'fail', 'ran']]);
    for (const project of failing.audit!.projects!) {
      expect(project).toMatchObject({ status: 'completed', executedMode: 'full', auditedSourceCommit: repository.head });
      expect(project.evidence?.reportCommit).toMatch(/^[0-9a-f]{40}$/u);
      expect(project.counts?.checks.total).toBe(1);
      expect(project.retrievalCommands.length).toBeGreaterThan(0);
    }
    expect(new Set(failing.audit!.projects!.map(project => project.evidence?.reportCommit)).size).toBe(3);
    expect(failing.audit!.projects![2]!.failures.length).toBeGreaterThan(0);
    expect(failing.audit!.discovery).toEqual({
      status: 'complete', unavailable: [],
      skipped: [{ projectRoot: 'vendor/lib', enclosingProject: '.', reason: 'external', directory: 'vendor' }],
    });
    // The grandchild's own published record holds the failing command's output.
    const toolsRecord = JSON.parse(await repository.git('show', `${failing.audit!.projects![2]!.evidence!.runRef}:reports/audit/summary.json`)) as {
      readonly overall: string; readonly coverage: { readonly projectRoot: string };
      readonly checks: Record<string, { readonly output: string }>;
    };
    expect([toolsRecord.overall, toolsRecord.coverage.projectRoot]).toEqual(['fail', 'engine/tools']);
    expect(toolsRecord.checks['engine-tools-check']?.output).toContain('grandchild state is not pass');
    expect(await fixture.runs()).toEqual({ root: 1, engine: 1, 'engine/tools': 1, 'vendor/lib': 0 });
    const briefing = (await gateDiagnostics(failing, 'engineer')).summary;
    expect(briefing).toContain('- the nested request answered 3 projects:');
    expect(briefing.some(line => line.startsWith('  - `engine/tools`: `fail`, ran, executed full'))).toBe(true);
    expect(briefing).toContain('- not audited: `vendor/lib` inside `.`, skipped as external (`vendor`)');

    const repaired = await repository.commit('repair the grandchild', { 'engine/tools/state.txt': 'pass\n' });
    const passing = await configuredGate(port, repository, {
      captured: repository.head, sourceCommit: repaired, attemptId: 'ga-0002', checkpoint: 'final', mode: 'full', nested: true,
    });
    expect([passing.verdict, passing.audit?.verdict, passing.audit?.discovery?.status]).toEqual(['passed', 'pass', 'complete']);
    expect(passing.audit?.projects?.map(project => [project.projectRoot, project.verdict])).toEqual([['.', 'pass'], ['engine', 'pass'], ['engine/tools', 'pass']]);
    expect((await fixture.runs())['vendor/lib']).toBe(0);
    const executions = await fixture.runs();

    // A documentation change of the non-Ramify nested project: it reuses its
    // own applicable full evidence, while the other projects audit the change.
    const docs = await repository.commit('engine notes', { 'engine/docs/notes.md': '# Engine notes\n' });
    const reused = await configuredGate(port, repository, {
      captured: repository.head, sourceCommit: docs, attemptId: 'ga-0003', checkpoint: 'final', mode: 'full', nested: true,
    });
    expect(reused.verdict).toBe('passed');
    const engine = reused.audit!.projects!.find(project => project.projectRoot === 'engine')!;
    expect(engine).toMatchObject({ execution: 'reused', auditedSourceCommit: repaired, reuse: { auditedCommit: repaired, ignoredChangedPaths: ['engine/docs/notes.md'] } });
    expect((await fixture.runs()).engine).toBe(executions.engine);

    await evidence('iteration10-f4-nested-final', {
      schema: 'plan21.iteration10.f4-nested/1', providerVersion: 'ramify-audit@0.7.2', ramifyVersion: 'ramify.ts@0.4.1',
      commits: { failing: repository.head, repaired, docs },
      gates: { failing: digest(failing), passing: digest(passing), reused: digest(reused) },
      grandchildRecord: toolsRecord, briefing, executions: await fixture.runs(),
    });
    await exportGateViews('iteration10-gate-views-final', { failing, passing, reused });
  });

  it('indeterminate nested discovery leaves the final gate unverified, whatever the root answered', { timeout: 300_000 }, async () => {
    const fixture = await f4('pass');
    const { repository } = fixture;
    const { audit: port } = await audit();
    const invalid = await repository.commit('an invalid root description', { 'module.ramify': 'ramify 1\nroot module f4\nexternal\n' });
    const gate = await configuredGate(port, repository, {
      captured: invalid, sourceCommit: invalid, attemptId: 'ga-0001', checkpoint: 'final', mode: 'full', nested: true,
    });
    expect(gate.audit?.discovery?.status).toBe('indeterminate');
    expect(gate.audit?.discovery?.unavailable.map(gap => gap.enclosingProject)).toEqual(['.']);
    expect(gate.audit?.verdict).toBe('indeterminate');
    expect(gate.verdict).not.toBe('passed');
    await evidence('iteration10-f4-indeterminate-discovery', {
      schema: 'plan21.iteration10.f4-indeterminate/1', commit: invalid, gate: digest(gate), executions: await fixture.runs(),
    });
  });
});

describe('recovering and cancelling a nested final audit over F4 (PB3-E06)', () => {
  it('retrieves a completed invocation\'s exact root and nested records by their identities, running nothing again', { timeout: 300_000 }, async () => {
    const fixture = await f4('fail');
    const { repository } = fixture;
    const { audit: port, ownership } = await audit();
    const ask = (attemptId: string, on = port) => on.read(repository.root, repository.head).then(configuration => on.run({
      projectRoot: repository.root, sourceCommit: repository.head, configuration, mode: 'full', nested: true, runId: 'run-f4', attemptId,
    }));
    const first = await ask('ga-0001');
    const executed = await fixture.runs();
    expect(ownership.invocations.get('run-f4:ga-0001')?.projects.map(project => project.projectRoot)).toEqual(['.', 'engine', 'engine/tools']);

    // Restart after the provider answered: the receipt names every record.
    const recovered = await ask('ga-0001');
    expect(await fixture.runs()).toEqual(executed);
    const identities = (result: typeof first) => result.projects?.map(project => ({
      projectRoot: project.projectRoot, verdict: project.verdict, execution: project.execution, failures: project.failures,
      reportCommit: project.reportCommit, runRef: project.runRef, treeRef: project.treeRef, counts: project.counts,
    }));
    expect(identities(recovered)).toEqual(identities(first));
    expect([recovered.verdict, recovered.discovery, recovered.reportCommit]).toEqual([first.verdict, first.discovery, first.reportCommit]);
    expect(recovered.verdict).toBe('fail');

    // Interrupted before the receipt was written: the provider is asked
    // again and answers every project from the evidence it published.
    const { audit: restarted, ownership: fresh } = await audit();
    const reasked = await ask('ga-0001', restarted);
    expect(await fixture.runs()).toEqual(executed);
    expect(reasked.projects?.map(project => [project.projectRoot, project.execution, project.reportCommit]))
      .toEqual(first.projects?.map(project => [project.projectRoot, 'reused', project.reportCommit]));
    expect(reasked.verdict).toBe('fail');
    expect(fresh.invocations.size).toBe(1);

    // A receipt of another request is refused, never adopted.
    ownership.invocations.set('run-f4:ga-0002', { ...ownership.invocations.get('run-f4:ga-0001')!, attemptId: 'ga-0002' });
    await expect(ask('ga-0002')).rejects.toThrow(/answers request run-f4:ga-0001/u);
    expect(await fixture.runs()).toEqual(executed);

    await evidence('iteration10-f4-recovery', {
      schema: 'plan21.iteration10.f4-recovery/1', commit: repository.head,
      receipt: ownership.invocations.get('run-f4:ga-0001'), first: identities(first), recovered: identities(recovered),
      reasked: reasked.projects?.map(project => ({ projectRoot: project.projectRoot, execution: project.execution, reportCommit: project.reportCommit, reuse: project.reuse })),
      executions: await fixture.runs(),
    });
  });

  it('cancellation during a nested project settles its process and workspace before a replacement attempt', { timeout: 300_000 }, async () => {
    const fixture = await f4('pass');
    const { repository } = fixture;
    const { audit: port, ownership } = await audit();
    await writeFile(fixture.hold, 'hold');
    const controller = new AbortController();
    const cancelling = configuredGate(port, repository, {
      captured: repository.head, sourceCommit: repository.head, attemptId: 'ga-0001', checkpoint: 'final', mode: 'full', nested: true,
      signal: controller.signal,
    });
    for (let tries = 0; !existsSync(fixture.held) && tries < 2400; tries += 1) await new Promise(resolve => setTimeout(resolve, 25));
    if (!existsSync(fixture.held)) {
      controller.abort();
      const early = await cancelling;
      throw new Error(`The held check never started: ${JSON.stringify(digest(early))} ${JSON.stringify(await fixture.runs())}`);
    }
    const pid = Number(await readFile(fixture.held, 'utf8'));
    controller.abort();
    const cancelled = await cancelling;
    // The enclosing projects completed; the cancelled grandchild did not
    // run to a verdict, so the invocation is indeterminate and the gate is
    // not verified.
    expect([cancelled.verdict, cancelled.cause, cancelled.audit?.status, cancelled.audit?.verdict])
      .toEqual(['not-verified', 'infrastructure', 'completed', 'indeterminate']);
    expect(cancelled.audit?.projects?.map(project => [project.projectRoot, project.status, project.verdict, project.execution]))
      .toEqual([['.', 'completed', 'pass', 'ran'], ['engine', 'completed', 'pass', 'ran'], ['engine/tools', 'cancelled', 'indeterminate', 'not-run']]);
    expect(await settled(pid)).toBe(true);
    expect(ownership.cleaned.map(workspace => workspace.worktreePath)).toEqual(ownership.intended.map(workspace => workspace.worktreePath));
    expect(ownership.intended.length).toBeGreaterThan(0);
    for (const workspace of ownership.intended) expect(existsSync(workspace.worktreePath)).toBe(false);
    expect(await repository.git('worktree', 'list', '--porcelain')).not.toContain(ownership.intended[0]!.worktreePath);
    expect(ownership.invocations.size).toBe(0);

    await rm(fixture.hold);
    const replacement = await configuredGate(port, repository, {
      captured: repository.head, sourceCommit: repository.head, attemptId: 'ga-0002', checkpoint: 'final', mode: 'full', nested: true,
    });
    expect([replacement.verdict, replacement.audit?.verdict]).toEqual(['passed', 'pass']);
    // The replacement answers the completed projects from their published
    // records and runs only the cancelled one.
    expect(replacement.audit?.projects?.map(project => [project.projectRoot, project.execution]))
      .toEqual([['.', 'reused'], ['engine', 'reused'], ['engine/tools', 'ran']]);
    expect(await fixture.runs()).toEqual({ root: 1, engine: 1, 'engine/tools': 2, 'vendor/lib': 0 });
    await evidence('iteration10-f4-cancellation', {
      schema: 'plan21.iteration10.f4-cancellation/1', commit: repository.head, heldProcess: pid,
      cancelled: digest(cancelled), replacement: digest(replacement), executions: await fixture.runs(),
    });
    await exportGateViews('iteration10-gate-views-cancellation', { cancelled, replacement });
  });
});
