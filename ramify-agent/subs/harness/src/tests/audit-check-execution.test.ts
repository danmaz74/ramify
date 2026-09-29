import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { existsSync } from 'node:fs';
import { symlink } from 'node:fs/promises';
import { setupChecks } from '../checks/checkpoint.js';
import { inPlaceCheckExecution, type GateCommandStart } from '../checks/execution.js';
import { gateDiagnostics } from '../checks/diagnostics.js';
import { runGate } from '../checks/gate.js';
import { gateAuditOutcomeSchema } from '../run/records.js';
import { checkCommand } from '../checks/records.js';
import type { CheckCommand, GateAttempt, TestSelection } from '../checks/records.js';
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
    readonly auditAllTests?: CheckCommand;
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
    ...(options.auditAllTests === undefined ? {} : { auditAllTests: options.auditAllTests }),
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
  it('retains an indeterminate published audit outcome', () => {
    const record = gateAuditOutcomeSchema.parse({
      schema: 'ramify-agent.gate-audit-outcome/1', gate: 'ga-indeterminate', overall: 'indeterminate', audited: 'a'.repeat(40),
    });
    expect(record.overall).toBe('indeterminate');
  });

  it('narrows a registered Vitest run to Ramify-selected source after a full root', { timeout: 60_000 }, async () => {
    const fixture = await repository({
      'module.ramify': 'ramify 1\nmodule "fixture"\nexpose-sub value from producer to descendants\n',
      'package.json': '{"name":"fixture","private":true,"type":"module","scripts":{"test":"vitest run"}}',
      'tsconfig.json': '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","target":"ES2022"},"include":["src/**/*.ts","subs/**/*.ts"]}',
      'src/index.ts': 'export {};\n',
      'subs/producer/module.ramify': 'ramify 1\nmodule producer\nexpose-src value from "value.ts" to parent\n',
      'subs/producer/src/value.ts': 'export const value = 1;\n',
      'subs/producer/src/tests/value.test.ts': 'import { expect, it } from "vitest"; import { value } from "../value.js"; it("value", () => expect(value).toBeGreaterThan(0));\n',
      'subs/consumer/module.ramify': 'ramify 1\nmodule consumer\n',
      'subs/consumer/src/compute.ts': 'import { value } from "../../producer/src/value.js"; export const computed = value + 1;\n',
      'subs/consumer/src/tests/compute.test.ts': 'import { expect, it } from "vitest"; import { computed } from "../compute.js"; it("computed", () => expect(computed).toBeGreaterThan(1));\n',
    });
    await symlink(join(process.cwd(), 'node_modules'), join(fixture.projectRoot, 'node_modules'));
    const auditAllTests = checkCommand({ argv: ['npm', 'test'], cwd: fixture.projectRoot, timeoutMs: 30_000 });
    const checks: PlannedCheck[] = [{
      kind: 'tests', command: checkCommand({
        argv: [join(fixture.projectRoot, 'node_modules/.bin/vitest'), 'run', 'subs/producer/src/tests/value.test.ts'],
        cwd: fixture.projectRoot, timeoutMs: 30_000,
      }),
      selection: { policy: 'owned-by-scope', exactOwners: ['fixture/producer'], subtrees: [], extraSuites: [], resolved: ['subs/producer/src/tests/value.test.ts'] },
      requiresTests: true,
    }];
    const full = (await auditGate(fixture, checks, 'ga-vitest-full', { checkpoint: 'final', auditAllTests })).attempt;
    expect(full.auditOverall).toBe('pass');

    await writeFile(join(fixture.projectRoot, 'subs/producer/src/value.ts'), 'export const value = 2;\n');
    git(fixture.repositoryRoot, ['add', 'subs/producer/src/value.ts']);
    git(fixture.repositoryRoot, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '--no-gpg-sign', '-m', 'change value']);
    const changed = { ...fixture, commit: git(fixture.repositoryRoot, ['rev-parse', 'HEAD']) };
    const partial = (await auditGate(changed, checks, 'ga-vitest-partial', { auditAllTests })).attempt;
    expect(partial.auditOverall).toBe('pass');
    const summary = JSON.parse(git(fixture.repositoryRoot, ['show', `${partial.evidence!.reportCommit}:reports/audit/summary.json`])) as {
      mode: { requestedMode: string; executedMode: string };
      coverage: { selectedModules?: Array<{ id: string }> };
    };
    expect(summary.mode, JSON.stringify(summary.mode)).toMatchObject({ requestedMode: 'ramify-partial', executedMode: 'ramify-partial' });
    expect(summary.coverage.selectedModules?.map(module => module.id)).toContain('fixture/consumer');
    expect(partial.commands[0]?.command.argv.at(-1)).toBe('subs/producer/src/tests/value.test.ts');

    await mkdir(join(fixture.projectRoot, 'docs'), { recursive: true });
    await writeFile(join(fixture.projectRoot, 'docs/first.md'), 'No source change\n');
    git(fixture.repositoryRoot, ['add', 'docs/first.md']);
    git(fixture.repositoryRoot, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '--no-gpg-sign', '-m', 'documentation without tests']);
    const unselected = (await auditGate({ ...fixture, commit: git(fixture.repositoryRoot, ['rev-parse', 'HEAD']) }, checks, 'ga-vitest-unselected', { auditAllTests })).attempt;
    expect(unselected.auditOverall).toBe('pass');
    expect(unselected.commands[0]).toMatchObject({ outcome: 'not-verified', notVerified: 'audit-unselected', exitCode: null });
    expect(unselected.verdict).toBe('passed');
    expect(unselected.commands[0]?.output.bytes).toBe(0);

    const failedFile = 'subs/consumer/src/tests/compute.test.ts';
    await writeFile(join(fixture.projectRoot, failedFile),
      'import { expect, it } from "vitest"; import { computed } from "../compute.js"; it("computed", () => expect(computed).toBeGreaterThan(100));\n');
    git(fixture.repositoryRoot, ['add', failedFile]);
    git(fixture.repositoryRoot, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '--no-gpg-sign', '-m', 'failing consumer test']);
    const failing = (await auditGate({ ...fixture, commit: git(fixture.repositoryRoot, ['rev-parse', 'HEAD']) }, checks, 'ga-vitest-failing', { auditAllTests })).attempt;
    expect(failing.auditOverall).toBe('fail');

    await mkdir(join(fixture.projectRoot, 'docs'), { recursive: true });
    await writeFile(join(fixture.projectRoot, 'docs/guide.md'), 'Documentation edit\n');
    git(fixture.repositoryRoot, ['add', 'docs/guide.md']);
    git(fixture.repositoryRoot, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '--no-gpg-sign', '-m', 'documentation after failed gate']);
    const rerun = (await auditGate({ ...fixture, commit: git(fixture.repositoryRoot, ['rev-parse', 'HEAD']) }, checks, 'ga-vitest-rerun', { auditAllTests })).attempt;
    expect(rerun.auditOverall).toBe('fail');
    const rerunSummary = JSON.parse(git(fixture.repositoryRoot, ['show', `${rerun.evidence!.reportCommit}:reports/audit/summary.json`])) as {
      mode: { executedMode: string };
      coverage: { carriedFailures?: Array<{ path: string }> };
    };
    expect(rerunSummary.mode.executedMode).toBe('ramify-partial');
    expect(rerunSummary.coverage.carriedFailures?.map(failure => failure.path)).toContain(failedFile);
  });

  it('defaults committing gates to partial mode and requests full mode for final', async () => {
    const fixture = await repository({
      'module.ramify': 'ramify 1\nmodule "fixture"\n',
      'package.json': '{"name":"fixture","private":true}',
      'src/index.ts': 'export const value = 1;\n',
    });
    await mkdir(join(fixture.projectRoot, 'node_modules'), { recursive: true });
    const checks: PlannedCheck[] = [{ kind: 'type-check', command: command(fixture.projectRoot, 'console.log("checked")') }];
    const iteration = (await auditGate(fixture, checks, 'ga-partial-default')).attempt;
    const iterationSummary = JSON.parse(git(fixture.repositoryRoot, ['show', `${iteration.evidence!.reportCommit}:reports/audit/summary.json`])) as {
      mode: { requestedMode: string; resolution: string };
    };
    expect(iterationSummary.mode).toMatchObject({ requestedMode: 'ramify-partial', resolution: 'defaulted' });
    const final = (await auditGate(fixture, checks, 'ga-final-full', { checkpoint: 'final' })).attempt;
    const finalSummary = JSON.parse(git(fixture.repositoryRoot, ['show', `${final.evidence!.reportCommit}:reports/audit/summary.json`])) as {
      mode: { requestedMode: string; resolution: string; executedMode: string };
    };
    expect(finalSummary.mode).toMatchObject({ requestedMode: 'full', resolution: 'requested', executedMode: 'full' });
  });

  it.each(['fail', 'indeterminate'] as const)('blocks a run-local pass when composition is %s', async overall => {
    const fixture = await repository({ 'source.txt': 'source\n' });
    const checks: PlannedCheck[] = [{ kind: 'type-check', command: command(fixture.projectRoot, 'console.log("pass")') }];
    const directory = await temporaryDirectory('ramify-agent-composed-verdict-');
    const attempt = await runGate({
      async run(planned, request) {
        const local = await inPlaceCheckExecution.run(planned, request);
        return { ...local, auditOverall: overall };
      },
    }, 'iteration', { id: `ga-composed-${overall}`, projectRoot: fixture.projectRoot, directory, head: fixture.commit, checks });
    expect(attempt.commands[0]?.outcome).toBe('passed');
    expect(attempt.auditOverall).toBe(overall);
    expect(attempt.verdict).toBe(overall === 'fail' ? 'failed' : 'not-verified');
    expect(attempt.next).not.toBe('accept');
    expect(gateAuditOutcomeSchema.parse({ schema: 'ramify-agent.gate-audit-outcome/1', gate: attempt.id, overall, audited: fixture.commit }).overall).toBe(overall);
  });

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
    expect(summary.coverage.universe.id).toBe('ramify-agent:gates');
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
    expect(ownedSummary.coverage.universe.id).toBe('ramify-agent:gates');
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
    // ramify-audit's own preparation refused the link, and says so with its
    // own code and message.
    expect(record).toMatchObject({
      outcome: 'not-verified',
      notVerified: 'runner-error',
      runnerError: {
        kind: 'dependency-link-failed',
        message: `Audit dependency target already exists at ${join(fixture.repositoryRoot, 'node_modules')}`,
      },
    });
    expect(attempt.cause).toBe('infrastructure');
    expect(attempt.next).toBe('retry-infrastructure');
    expect(record.runnerError?.message).not.toContain('ramify-audit-worktree-');
    expect(record.output.tail).toContain(join(fixture.repositoryRoot, 'node_modules'));
    expect(record.output.tail).not.toContain('ramify-audit-worktree-');
    expect(output).toContain(join(fixture.repositoryRoot, 'node_modules'));
    expect(output).not.toContain('ramify-audit-worktree-');
  });
});

describe('the project\'s setup commands in the audited worktree', () => {
  /** A project whose check reads the build output its declared setup writes; the repository ignores that output. */
  async function builtProject() {
    const fixture = await repository({
      '.gitignore': 'dist/\nnode_modules/\n',
      'package.json': JSON.stringify({ scripts: { build: 'node scripts/build.mjs' } }),
      'scripts/build.mjs': [
        'import { mkdirSync, writeFileSync } from "node:fs";',
        'mkdirSync("dist", { recursive: true });',
        'writeFileSync("dist/out.txt", `built for ${process.env.BUILD_LABEL}`);',
        'console.log(`wrote ${process.cwd()}/dist/out.txt`);',
      ].join('\n'),
      'scripts/check.mjs': 'import { readFileSync } from "node:fs";\nconsole.log(readFileSync("dist/out.txt", "utf8"));\n',
    });
    await mkdir(join(fixture.projectRoot, 'node_modules'), { recursive: true });
    return fixture;
  }

  it('builds in the worktree before any check, so a check reads the ignored output, and publishes what the build printed', async () => {
    const fixture = await builtProject();
    const checks: PlannedCheck[] = [
      ...setupChecks([{ name: 'build', command: ['node', 'scripts/build.mjs'], env: { BUILD_LABEL: 'audited' }, timeoutMs: 60_000 }], fixture.projectRoot),
      { kind: 'tests', command: checkCommand({ argv: ['node', 'scripts/check.mjs'], cwd: fixture.projectRoot, timeoutMs: 30_000 }), attribution: 'project' },
    ];
    const announced: GateCommandStart[] = [];

    const { attempt, workspaces, outputDirectory } = await auditGate(fixture, checks, 'ga-setup-built', { announced });

    expect(attempt.verdict).toBe('passed');
    expect(attempt.evidence).not.toBeNull();
    expect(announced).toEqual([
      { kind: 'setup', name: 'build', position: 1, total: 2 },
      { kind: 'tests', position: 2, total: 2 },
    ]);
    const [setup, tests] = attempt.commands;
    expect(setup).toMatchObject({ kind: 'setup', name: 'build', outcome: 'passed', exitCode: 0, command: { argv: ['node', 'scripts/build.mjs'], cwd: fixture.projectRoot } });
    expect(setup!.command.envAdditions).toEqual({ BUILD_LABEL: 'audited' });
    // What the build printed names the project, not the removed worktree.
    expect(setup!.output.path).toBe(join(outputDirectory, '01-setup.log'));
    expect(setup!.output.tail).toContain(`wrote ${fixture.projectRoot}/dist/out.txt`);
    expect(setup!.output.tail).not.toContain(workspaces[0]?.worktreePath ?? 'missing-worktree');
    expect(git(fixture.repositoryRoot, ['show', `${attempt.evidence!.reportCommit}:reports/audit/workspace-preparation/setup-01.txt`])).toContain('status: passed');
    expect(tests).toMatchObject({ kind: 'tests', outcome: 'passed' });
    expect(tests!.output.tail).toContain('built for audited');
    // The build ran in the worktree, never in the project.
    expect(existsSync(join(fixture.projectRoot, 'dist'))).toBe(false);

    const note = git(fixture.repositoryRoot, ['notes', '--ref=audit', 'show', fixture.commit]);
    const runRef = note.match(/^Audited-Reports-Ref: (.+)$/mu)?.[1];
    const summary = JSON.parse(git(fixture.repositoryRoot, ['show', `${runRef}:reports/audit/summary.json`])) as {
      checks: Record<string, unknown>;
      workspacePreparation: { preparationId: string; payload: { linkedPackageDirectories: string[]; setupCommands: Array<Record<string, unknown>> } };
    };
    expect(Object.keys(summary.checks)).toEqual(['check-02-tests', 'harness-rules']);
    expect(summary.workspacePreparation.preparationId).toBe('nodejs');
    expect(summary.workspacePreparation.payload.linkedPackageDirectories).toEqual(['']);
    expect(summary.workspacePreparation.payload.setupCommands).toEqual([expect.objectContaining({
      index: 1, name: 'build', command: ['node', 'scripts/build.mjs'], status: 'passed', exitCode: 0,
      outputPath: 'reports/audit/workspace-preparation/setup-01.txt',
    })]);
    expect(git(fixture.repositoryRoot, ['show', `${runRef}:reports/audit/workspace-preparation/setup-01.txt`])).toContain('wrote ');
  });

  it('a setup command that exits non-zero fails the gate in scope with what it printed, and no check runs after it', async () => {
    const fixture = await builtProject();
    const marker = join(fixture.projectRoot, 'check-ran');
    const checks: PlannedCheck[] = [
      ...setupChecks([{ name: 'build', command: ['node', '-e', 'console.error("src/a.ts(1,1): error TS2304: Cannot find name x."); process.exit(2)'] }], fixture.projectRoot),
      { kind: 'tests', command: command(fixture.projectRoot, `require("fs").writeFileSync(${JSON.stringify(marker)}, "ran")`), attribution: 'project' },
      { kind: 'type-check', command: command(fixture.projectRoot, 'console.log("types")'), attribution: 'project' },
    ];

    const { attempt, outputDirectory } = await auditGate(fixture, checks, 'ga-setup-failed');
    const inPlace = await inPlaceGate(fixture, checks, 'ga-setup-failed-place');

    for (const gate of [attempt, inPlace]) {
      expect(gate.commands.map(record => [record.kind, record.outcome, record.notVerified ?? null, record.exitCode])).toEqual([
        ['setup', 'failed', null, 2],
        ['tests', 'not-verified', 'setup-failed', null],
        ['type-check', 'not-verified', 'setup-failed', null],
      ]);
      expect(gate.commands[0]!.output.tail).toContain('error TS2304: Cannot find name x.');
      expect([gate.verdict, gate.cause, gate.next]).toEqual(['failed', 'in-scope', 'repair']);
    }
    expect(attempt.evidence).toBeNull();
    expect(attempt.audited).toBeNull();
    expect(attempt.commands[0]!.output.path).toBe(join(outputDirectory, '01-setup.log'));
    expect(await readFile(attempt.commands[0]!.output.path, 'utf8')).toContain('error TS2304: Cannot find name x.');
    expect(existsSync(marker)).toBe(false);
  });

  it('a setup command that does not finish in time is infrastructure, not a failure of the source', async () => {
    const fixture = await builtProject();
    const checks: PlannedCheck[] = [
      ...setupChecks([{ command: ['node', '-e', 'setTimeout(() => {}, 60000)'], timeoutMs: 500 }], fixture.projectRoot),
      { kind: 'tests', command: command(fixture.projectRoot, 'console.log("unreached")'), attribution: 'project' },
    ];

    const { attempt } = await auditGate(fixture, checks, 'ga-setup-timeout');

    expect(attempt.commands.map(record => [record.kind, record.outcome, record.notVerified ?? null])).toEqual([
      ['setup', 'not-verified', 'timeout'],
      ['tests', 'not-verified', 'setup-failed'],
    ]);
    expect(attempt.commands[0]!.name).toBeUndefined();
    expect([attempt.verdict, attempt.cause, attempt.next]).toEqual(['not-verified', 'timeout', 'retry-infrastructure']);
    // ramify-audit stopped the command's whole process tree, and the record and its briefing say how.
    expect(attempt.commands[0]!.stopped).toMatch(/^its process tree was stopped after it timed out: \d+ process(es)? received SIGTERM/u);
    const briefing = (await gateDiagnostics(attempt, 'engineer')).summary.join('\n');
    expect(briefing).toContain(`not verified (timeout); ${attempt.commands[0]!.stopped!}`);
  });

  it('a setup command that installs through the linked node_modules is refused before it runs, and is infrastructure with what the project must change', async () => {
    const fixture = await builtProject();
    await writeFile(join(fixture.projectRoot, 'node_modules', 'kept.txt'), 'the project\'s own installation');
    const checks: PlannedCheck[] = [
      ...setupChecks([{ name: 'install', command: ['npm', 'ci'] }], fixture.projectRoot),
      { kind: 'tests', command: command(fixture.projectRoot, 'console.log("unreached")'), attribution: 'project' },
    ];

    const { attempt } = await auditGate(fixture, checks, 'ga-setup-linked-install');

    const [setup, tests] = attempt.commands;
    expect(setup).toMatchObject({
      kind: 'setup', name: 'install', outcome: 'not-verified', notVerified: 'runner-error', exitCode: null,
      runnerError: { kind: 'setup-command-unsafe-with-linked-modules' },
    });
    expect(setup!.runnerError!.message).toContain('`npm ci` changes node_modules');
    expect(setup!.runnerError!.message).toContain('so a setup command must not install them: remove it from `setup` in ramify-agent.json.');
    // What the record shows as its output is why it was refused.
    expect(setup!.output.tail).toBe(setup!.runnerError!.message);
    expect(tests).toMatchObject({ outcome: 'not-verified', notVerified: 'setup-failed' });
    expect([attempt.verdict, attempt.cause, attempt.next]).toEqual(['not-verified', 'infrastructure', 'retry-infrastructure']);
    expect(await readFile(join(fixture.projectRoot, 'node_modules', 'kept.txt'), 'utf8')).toBe('the project\'s own installation');
  });

  it('a setup command that cannot start is infrastructure, with the preparation\'s own error', async () => {
    const fixture = await builtProject();
    // The directory exists where the gate verified the plan, and not in the
    // worktree of the commit, which holds only tracked files.
    await mkdir(join(fixture.projectRoot, 'dist', 'local'), { recursive: true });
    const checks: PlannedCheck[] = [
      ...setupChecks([{ name: 'build', command: ['node', 'scripts/build.mjs'], cwd: 'dist/local' }], fixture.projectRoot),
      { kind: 'tests', command: command(fixture.projectRoot, 'console.log("unreached")'), attribution: 'project' },
    ];

    const { attempt } = await auditGate(fixture, checks, 'ga-setup-spawn');

    expect(attempt.commands[0]).toMatchObject({
      kind: 'setup', outcome: 'not-verified', notVerified: 'runner-error',
      runnerError: { kind: 'setup-command-spawn-failed', message: expect.stringContaining('its working directory does not exist') },
    });
    expect(attempt.commands[1]).toMatchObject({ outcome: 'not-verified', notVerified: 'setup-failed' });
    expect([attempt.verdict, attempt.cause, attempt.next]).toEqual(['not-verified', 'infrastructure', 'retry-infrastructure']);
  });
});

describe('an audited worktree whose HEAD moves during the audit', () => {
  it('fails every command as infrastructure, with where the audit found the move', async () => {
    const fixture = await repository({ '.gitignore': 'node_modules/\n', 'package.json': '{}\n' });
    await mkdir(join(fixture.projectRoot, 'node_modules'), { recursive: true });
    const move = checkCommand({
      argv: ['git', '-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '--allow-empty', '--no-gpg-sign', '-q', '-m', 'moved'],
      cwd: fixture.projectRoot,
      timeoutMs: 30_000,
    });
    const checks: PlannedCheck[] = [
      { kind: 'tests', command: move, attribution: 'project' },
      { kind: 'type-check', command: command(fixture.projectRoot, 'console.log("types")'), attribution: 'project' },
    ];

    const { attempt } = await auditGate(fixture, checks, 'ga-revision-moved');

    expect(attempt.commands.map(record => [record.kind, record.outcome, record.notVerified ?? null, record.runnerError?.kind ?? null])).toEqual([
      ['tests', 'not-verified', 'runner-error', 'source-revision-moved'],
      ['type-check', 'not-verified', 'runner-error', 'source-revision-moved'],
    ]);
    const message = attempt.commands[0]!.runnerError!.message;
    expect(message).toMatch(new RegExp(`The audited HEAD moved from ${fixture.commit} to [0-9a-f]{40} \\(stage before-check, check check-02-type-check, workspace isolated-worktree\\); checks completed before it: check-01-tests\\.$`, 'u'));
    expect([attempt.verdict, attempt.cause, attempt.next]).toEqual(['not-verified', 'infrastructure', 'retry-infrastructure']);
    expect(attempt.evidence).toBeNull();
    // The project's own branch did not move.
    expect(git(fixture.repositoryRoot, ['rev-parse', 'HEAD'])).toBe(fixture.commit);
  });
});
