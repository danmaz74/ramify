import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { inPlaceCheckExecution, type GateCommandStart } from '../checks/execution.js';
import { runGate } from '../checks/gate.js';
import { checkCommand } from '../checks/records.js';
import type { GateAttempt, TestSelection } from '../checks/records.js';
import type { PlannedCheck } from '../checks/verify.js';
import {
  createAuditCheckExecution,
  type AuditWorkspaceOwnershipRecorder,
  type IntendedAuditWorkspace,
} from '../../subs/audit/src/check-execution.js';

interface RepositoryFixture {
  readonly repositoryRoot: string;
  readonly projectRoot: string;
  readonly commit: string;
}

const temporary = new Set<string>();

beforeAll(() => {
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  process.env.GIT_CONFIG_SYSTEM = '/dev/null';
});

afterEach(async () => {
  await Promise.all([...temporary].map(path => rm(path, { recursive: true, force: true })));
  temporary.clear();
});

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  }).trim();
}

async function temporaryDirectory(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  temporary.add(path);
  return path;
}

async function repository(files: Readonly<Record<string, string>>, projectPrefix = ''): Promise<RepositoryFixture> {
  const repositoryRoot = await temporaryDirectory('ramify-agent-audit-runner-');
  git(repositoryRoot, ['init', '-b', 'main']);
  for (const [path, content] of Object.entries(files)) {
    const target = join(repositoryRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  git(repositoryRoot, ['add', '--all']);
  git(repositoryRoot, [
    '-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost',
    'commit', '--no-gpg-sign', '-m', 'fixture',
  ]);
  return {
    repositoryRoot,
    projectRoot: projectPrefix === '' ? repositoryRoot : join(repositoryRoot, projectPrefix),
    commit: git(repositoryRoot, ['rev-parse', 'HEAD']),
  };
}

function selection(resolved = ['src/tests/scoped.test.ts']): TestSelection {
  return {
    policy: 'owned-by-scope',
    exactOwners: ['project/feature'],
    subtrees: ['project/shared'],
    extraSuites: [],
    resolved,
  };
}

function command(projectRoot: string, script: string, timeoutMs = 30_000) {
  return checkCommand({ argv: ['node', '-e', script], cwd: projectRoot, timeoutMs });
}

async function auditGate(
  fixture: RepositoryFixture,
  checks: readonly PlannedCheck[],
  id: string,
  options: {
    readonly selectionPolicy?: 'owned-by-scope' | 'all-project';
    readonly checkpoint?: GateAttempt['checkpoint'];
    readonly dependencyDirectories?: readonly string[];
    readonly rules?: GateAttempt['rules'];
    readonly guarded?: readonly { readonly path: string; readonly hash: string }[];
    readonly signal?: AbortSignal;
    readonly workspaceOwnership?: AuditWorkspaceOwnershipRecorder;
    readonly announced?: GateCommandStart[];
  } = {},
): Promise<{ readonly attempt: GateAttempt; readonly workspaces: IntendedAuditWorkspace[]; readonly outputDirectory: string }> {
  const outputDirectory = await temporaryDirectory('ramify-agent-audit-output-');
  const workspaces: IntendedAuditWorkspace[] = [];
  const execution = createAuditCheckExecution({
    workspaceOwnership: options.workspaceOwnership ?? {
      async recordIntendedWorkspace(workspace) {
        workspaces.push(workspace);
      },
      async recoverAbandonedWorkspaces() {},
      async recordWorkspaceCleaned() {},
    },
  });
  const policy = options.selectionPolicy ?? 'all-project';
  const attempt = await runGate(execution, options.checkpoint ?? 'iteration', {
    id,
    runId: 'run-audit-equivalence',
    projectRoot: fixture.projectRoot,
    directory: outputDirectory,
    head: fixture.commit,
    checks,
    selection: {
      policy,
      exactOwners: policy === 'owned-by-scope' ? ['project/feature'] : [],
      subtrees: policy === 'owned-by-scope' ? ['project/shared'] : [],
    },
    dependencyDirectories: options.dependencyDirectories ?? [],
    ...(options.rules === undefined ? {} : { rules: options.rules }),
    ...(options.guarded === undefined ? {} : { guarded: options.guarded }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.announced === undefined ? {} : { started: async (command: GateCommandStart) => { options.announced!.push(command); } }),
  });
  return { attempt, workspaces, outputDirectory };
}

async function inPlaceGate(
  fixture: RepositoryFixture,
  checks: readonly PlannedCheck[],
  id: string,
): Promise<GateAttempt> {
  const directory = await temporaryDirectory('ramify-agent-in-place-output-');
  return runGate(inPlaceCheckExecution, 'iteration', {
    id,
    projectRoot: fixture.projectRoot,
    directory,
    head: fixture.commit,
    checks,
  });
}

function commandSemantics(attempt: GateAttempt) {
  return attempt.commands.map(record => ({
    kind: record.kind,
    command: record.command,
    selection: record.selection,
    exitCode: record.exitCode,
    outcome: record.outcome,
    notVerified: record.notVerified,
    runnerError: record.runnerError,
    tail: record.output.tail,
  }));
}

describe('audit-backed gate execution', () => {
  it('matches passing and failing in-place commands, verdict, cause and next over the same commit', async () => {
    const fixture = await repository({ 'source.txt': 'source\n' });
    await mkdir(join(fixture.projectRoot, 'node_modules'), { recursive: true });
    const passing: PlannedCheck[] = [
      { kind: 'tests', command: command(fixture.projectRoot, 'console.log("pass")') },
      { kind: 'type-check', command: command(fixture.projectRoot, 'console.log("typed")') },
    ];
    const failing: PlannedCheck[] = [
      { kind: 'tests', command: command(fixture.projectRoot, 'console.error("failed"); process.exit(3)') },
      { kind: 'type-check', command: command(fixture.projectRoot, 'console.log("still ran")') },
    ];

    const passingInPlace = await inPlaceGate(fixture, passing, 'ga-pass-place');
    const passingAudit = (await auditGate(fixture, passing, 'ga-pass-audit')).attempt;
    const failingInPlace = await inPlaceGate(fixture, failing, 'ga-fail-place');
    const failingAudit = (await auditGate(fixture, failing, 'ga-fail-audit')).attempt;

    expect(passingAudit.auditOverall).toBe('pass');
    expect(failingAudit.auditOverall).toBe('fail');
    expect(failingAudit.evidence).not.toBeNull();

    expect(commandSemantics(passingAudit)).toEqual(commandSemantics(passingInPlace));
    expect([passingAudit.verdict, passingAudit.cause, passingAudit.next])
      .toEqual([passingInPlace.verdict, passingInPlace.cause, passingInPlace.next]);
    expect(commandSemantics(failingAudit)).toEqual(commandSemantics(failingInPlace));
    expect([failingAudit.verdict, failingAudit.cause, failingAudit.next])
      .toEqual([failingInPlace.verdict, failingInPlace.cause, failingInPlace.next]);
  });

  it('keeps ramify exit 2 not verified and maps a failing stack trace back to project paths', async () => {
    const fixture = await repository({
      'scripts/fail.mjs': 'throw new Error("fixture stack")\n',
    });
    await mkdir(join(fixture.projectRoot, 'node_modules'), { recursive: true });
    const checks: PlannedCheck[] = [
      { kind: 'ramify-check', command: command(fixture.projectRoot, 'console.log("{\\"outcome\\":\\"not-checked\\"}"); process.exit(2)') },
      { kind: 'tests', command: checkCommand({ argv: ['node', 'scripts/fail.mjs'], cwd: fixture.projectRoot, timeoutMs: 30_000 }) },
    ];

    const inPlace = await inPlaceGate(fixture, checks, 'ga-not-verified-place');
    const { attempt, workspaces } = await auditGate(fixture, checks, 'ga-not-verified-audit');

    expect(attempt.commands[0]).toMatchObject({ exitCode: 2, outcome: 'not-verified', notVerified: 'runner-error' });
    expect(attempt.verdict).toBe('not-verified');
    expect(attempt.cause).toBe('infrastructure');
    expect(attempt.next).toBe('retry-infrastructure');
    expect(attempt.commands[1]?.output.tail).toContain(join(fixture.projectRoot, 'scripts/fail.mjs'));
    expect(attempt.commands[1]?.output.tail).not.toContain(workspaces[0]?.worktreePath ?? 'missing-worktree');
    expect(commandSemantics(attempt)).toEqual(commandSemantics(inPlace));
  });

  it('uses distinct per-position IDs for an all-project scope probe, preserves order, and names coverage', async () => {
    const fixture = await repository({ 'source.txt': 'source\n' });
    await mkdir(join(fixture.projectRoot, 'node_modules'), { recursive: true });
    const checks: PlannedCheck[] = [
      { kind: 'tests', command: command(fixture.projectRoot, 'console.log("project")'), attribution: 'project' },
      { kind: 'type-check', command: command(fixture.projectRoot, 'console.log("types")'), attribution: 'project' },
      {
        kind: 'tests',
        command: command(fixture.projectRoot, 'console.log("scope")'),
        selection: selection(),
        requiresTests: true,
        attribution: 'in-scope',
      },
    ];

    const announced: GateCommandStart[] = [];
    const { attempt } = await auditGate(fixture, checks, 'ga-duplicates', {
      checkpoint: 'breaking-iteration',
      selectionPolicy: 'all-project',
      announced,
    });
    // Each command is announced as the audit starts it, with its place.
    expect(announced).toEqual([
      { kind: 'tests', position: 1, total: 3 },
      { kind: 'type-check', position: 2, total: 3 },
      { kind: 'tests', position: 3, total: 3 },
    ]);
    const note = git(fixture.repositoryRoot, ['notes', '--ref=audit', 'show', fixture.commit]);
    const runRef = note.match(/^Audited-Reports-Ref: (.+)$/mu)?.[1];
    expect(runRef).toBeDefined();
    const summary = JSON.parse(git(fixture.repositoryRoot, ['show', `${runRef}:reports/audit/summary.json`])) as {
      checks: Record<string, unknown>;
      coverage: { universe: { id: string; checkIds: string[] }; claim: { checkpoint: string; selectionPolicy: string; owners?: string[] } };
    };

    expect(attempt.commands.map(record => record.output.tail.trim())).toEqual(['project', 'types', 'scope']);
    expect(Object.keys(summary.checks)).toEqual(['check-01-tests', 'check-02-type-check', 'check-03-tests', 'harness-rules']);
    expect(summary.coverage.universe.checkIds).toEqual(['check-01-tests', 'check-02-type-check', 'check-03-tests', 'harness-rules']);
    expect(summary.coverage.universe.id).toContain('breaking-iteration:all-project');
    expect(summary.coverage.claim).toEqual({
      checkpoint: 'breaking-iteration',
      selectionPolicy: 'all-project',
    });

    await auditGate(fixture, checks, 'ga-owned-coverage', { selectionPolicy: 'owned-by-scope' });
    const ownedNote = git(fixture.repositoryRoot, ['notes', '--ref=audit', 'show', fixture.commit]);
    const ownedRunRef = ownedNote.match(/^Audited-Reports-Ref: (.+)$/mu)?.[1];
    expect(ownedRunRef).toBeDefined();
    const ownedSummary = JSON.parse(git(fixture.repositoryRoot, ['show', `${ownedRunRef}:reports/audit/summary.json`])) as {
      coverage: { universe: { id: string }; claim: { checkpoint: string; selectionPolicy: string; owners: string[] } };
    };
    expect(ownedSummary.coverage.universe.id).toContain('iteration:owned-by-scope');
    expect(ownedSummary.coverage.claim).toEqual({
      checkpoint: 'iteration',
      selectionPolicy: 'owned-by-scope',
      owners: ['exact:project/feature', 'subtree:project/shared'],
    });
  });

  it('rebases nested-project scripts, scoped tests and ramify --root, and links nested dependencies without building', async () => {
    const prefix = 'apps/project';
    const fixture = await repository({
      'package.json': JSON.stringify({ scripts: { test: 'node -e "process.exit(91)"' } }),
      [`${prefix}/package.json`]: JSON.stringify({ scripts: { test: 'node scripts/project-test.mjs', build: 'node -e "process.exit(88)"' }, type: 'module' }),
      [`${prefix}/scripts/project-test.mjs`]: 'console.log(`project:${process.cwd()}`)\n',
      [`${prefix}/src/tests/scoped.test.ts`]: 'export {}\n',
      [`${prefix}/packages/tool/package.json`]: JSON.stringify({ scripts: { test: 'node test.cjs' } }),
      [`${prefix}/packages/tool/test.cjs`]: 'console.log(`nested:${require("fixture-dep")}`)\n',
    }, prefix);
    const projectModules = join(fixture.projectRoot, 'node_modules');
    const nestedModules = join(fixture.projectRoot, 'packages/tool/node_modules');
    await mkdir(join(projectModules, '.bin'), { recursive: true });
    await mkdir(join(nestedModules, 'fixture-dep'), { recursive: true });
    await writeFile(join(nestedModules, 'fixture-dep/index.js'), 'module.exports = "dependency-ready"\n');
    const vitest = join(projectModules, '.bin/vitest');
    const ramify = join(projectModules, '.bin/ramify');
    await writeFile(vitest, '#!/bin/sh\nprintf "scoped:%s:%s\\n" "$PWD" "$2"\n[ "$2" = "src/tests/scoped.test.ts" ]\n');
    await writeFile(ramify, '#!/bin/sh\nprintf "ramify:%s:%s\\n" "$PWD" "$*"\n[ "$4" = "$PWD" ]\n');
    await chmod(vitest, 0o755);
    await chmod(ramify, 0o755);

    const checks: PlannedCheck[] = [
      { kind: 'tests', command: checkCommand({ argv: ['npm', 'test'], cwd: fixture.projectRoot, timeoutMs: 30_000 }), attribution: 'project' },
      { kind: 'type-check', command: command(fixture.projectRoot, 'console.log(`type:${process.cwd()}`)'), attribution: 'project' },
      { kind: 'ramify-check', command: checkCommand({ argv: [ramify, 'check', '--batch', '--root', fixture.projectRoot, '--format', 'json'], cwd: fixture.projectRoot, timeoutMs: 30_000 }), attribution: 'project' },
      {
        kind: 'tests',
        command: checkCommand({ argv: [vitest, 'run', 'src/tests/scoped.test.ts'], cwd: fixture.projectRoot, timeoutMs: 30_000 }),
        selection: selection(),
        requiresTests: true,
        attribution: 'in-scope',
      },
      { kind: 'tests', command: checkCommand({ argv: ['npm', 'test'], cwd: join(fixture.projectRoot, 'packages/tool'), timeoutMs: 30_000 }), attribution: 'project' },
    ];

    const inPlace = await inPlaceGate(fixture, checks, 'ga-nested-place');
    const { attempt, workspaces } = await auditGate(fixture, checks, 'ga-nested-audit', {
      dependencyDirectories: ['packages/tool'],
    });

    expect(attempt.verdict).toBe('passed');
    expect(commandSemantics(attempt)).toEqual(commandSemantics(inPlace));
    expect(attempt.commands[0]?.output.tail).toContain(`project:${fixture.projectRoot}`);
    expect(attempt.commands[2]?.output.tail).toContain(`--root ${fixture.projectRoot}`);
    expect(attempt.commands[3]?.output.tail).toContain(`scoped:${fixture.projectRoot}:src/tests/scoped.test.ts`);
    expect(attempt.commands[4]?.output.tail).toContain('nested:dependency-ready');
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]).toMatchObject({
      repositoryRoot: fixture.repositoryRoot,
      sourceCommit: fixture.commit,
      runId: 'run-audit-equivalence',
      attemptId: 'ga-nested-audit',
      process: { id: process.pid },
    });
    expect(workspaces[0]?.worktreePath).toContain('ramify-audit-worktree-');
    // The committed build script exits 88; a passing audit proves preparation did not run it.
  });

  it('publishes guarded changes and harness rules as one failing check without inventing a command record', async () => {
    const fixture = await repository({ 'source.txt': 'source\n' });
    await mkdir(join(fixture.projectRoot, 'node_modules'), { recursive: true });
    const checks: PlannedCheck[] = [{ kind: 'tests', command: command(fixture.projectRoot, 'console.log("command passed")') }];
    const { attempt } = await auditGate(fixture, checks, 'ga-rules', {
      rules: [{ rule: 'fake-naming', outcome: 'failed', violations: [{ rule: 'fake-suffix', path: 'src/a.ts', detail: 'missing .fake' }] }],
      guarded: [{ path: 'source.txt', hash: '0'.repeat(64) }],
    });
    const note = git(fixture.repositoryRoot, ['notes', '--ref=audit', 'show', fixture.commit]);
    const runRef = note.match(/^Audited-Reports-Ref: (.+)$/mu)?.[1];
    expect(runRef).toBeDefined();
    const summary = JSON.parse(git(fixture.repositoryRoot, ['show', `${runRef}:reports/audit/summary.json`])) as {
      checks: { 'harness-rules': { details: { guardedChanges: number; unauthorizedGuardedChanges: number; failedRules: string[] } } };
    };

    expect(attempt.commands).toHaveLength(1);
    expect(attempt.commands[0]?.outcome).toBe('passed');
    expect(attempt.verdict).toBe('failed');
    expect(attempt.cause).toBe('guarded-change');
    expect(note).toContain('harness-rules: FAIL');
    expect(summary.checks['harness-rules'].details).toEqual({
      guardedChanges: 1,
      unauthorizedGuardedChanges: 1,
      failedRules: ['fake-naming'],
    });
  });

  it('maps audit cancellation to interrupted and audit failure to the library runner error', async () => {
    const fixture = await repository({ 'source.txt': 'source\n' });
    await mkdir(join(fixture.projectRoot, 'node_modules'), { recursive: true });
    const checks: PlannedCheck[] = [{ kind: 'tests', command: command(fixture.projectRoot, 'console.log("unreached")') }];
    const controller = new AbortController();
    controller.abort('gate stopped');

    const cancelled = (await auditGate(fixture, checks, 'ga-cancelled', { signal: controller.signal })).attempt;
    const failed = (await auditGate(fixture, checks, 'ga-failed', {
      workspaceOwnership: {
        async recordIntendedWorkspace() {
          throw new Error('durable ownership write refused');
        },
        async recoverAbandonedWorkspaces() {},
        async recordWorkspaceCleaned() {},
      },
    })).attempt;

    expect(cancelled.commands[0]).toMatchObject({
      outcome: 'not-verified', notVerified: 'interrupted', runnerError: null,
    });
    expect(cancelled.cause).toBe('infrastructure');
    expect(failed.commands[0]).toMatchObject({
      outcome: 'not-verified',
      notVerified: 'runner-error',
      runnerError: { kind: 'audit-failed', message: expect.stringContaining('durable ownership write refused') },
    });
    expect(failed.cause).toBe('infrastructure');
  });

  it('remaps an audit-stage failure from the removed worktree to the original repository', async () => {
    const fixture = await repository({
      'source.txt': 'source\n',
      // A tracked target makes dependency preparation fail after the
      // isolated worktree exists, and the library error names that worktree.
      'node_modules/tracked.txt': 'tracked target\n',
    });
    const checks: PlannedCheck[] = [{ kind: 'tests', command: command(fixture.projectRoot, 'console.log("unreached")') }];

    const { attempt, workspaces } = await auditGate(fixture, checks, 'ga-preparation-failed');
    const record = attempt.commands[0]!;
    const output = await readFile(record.output.path, 'utf8');

    expect(workspaces).toHaveLength(1);
    expect(record).toMatchObject({
      outcome: 'not-verified',
      notVerified: 'runner-error',
      runnerError: {
        kind: 'audit-failed',
        message: expect.stringContaining(join(fixture.repositoryRoot, 'node_modules')),
      },
    });
    expect(record.runnerError?.message).not.toContain('ramify-audit-worktree-');
    expect(record.output.tail).toContain(join(fixture.repositoryRoot, 'node_modules'));
    expect(record.output.tail).not.toContain('ramify-audit-worktree-');
    expect(output).toContain(join(fixture.repositoryRoot, 'node_modules'));
    expect(output).not.toContain('ramify-audit-worktree-');
  });
});
