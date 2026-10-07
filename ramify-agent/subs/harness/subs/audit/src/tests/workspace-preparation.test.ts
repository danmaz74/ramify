import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { CheckCommand } from '../../../../src/checks/records.js';
import type { PlannedCheck } from '../../../../src/checks/verify.js';
import { childEnvironment } from '../../../evidence/src/run-command.js';
import { configuredAuditProgress, configuredFullResultMatches, readCommittedAuditConfiguration, workspacePreparationOf } from '../check-execution.js';

/*
 * The workspace preparation every audit request names: ramify-audit's
 * built-in `nodejs` preparation, with the project's dependency directories
 * and its declared setup commands. The harness registers none of its own.
 */

const projectRoot = '/repository/apps/web';

function command(argv: string[], cwd: string, timeoutMs: number, envAdditions: Record<string, string> = {}): CheckCommand {
  return { argv, cwd, env: [], envAdditions, timeoutMs };
}

describe('the audit request\'s workspace preparation', () => {
  it('links the root and every nested package, and forwards each setup command in order, relative to the project', () => {
    const setup: PlannedCheck[] = [
      { kind: 'setup', name: 'build', command: command(['npm', 'run', 'build'], projectRoot, 900_000), attribution: 'project' },
      { kind: 'setup', command: command(['npm', 'run', 'build'], `${projectRoot}/packages/ui`, 600_000, { NODE_ENV: 'production' }), attribution: 'project' },
    ];

    expect(workspacePreparationOf({
      projectRoot,
      projectPrefix: 'apps/web',
      dependencyDirectories: ['packages/ui', 'packages/ui'],
      directory: '/runs/r1/gates/ga-0004',
      setup,
    })).toEqual({
      preparationId: 'nodejs',
      options: {
        projectPrefix: 'apps/web',
        packageDirectories: ['', 'packages/ui'],
        build: false,
        setupCommands: [
          { name: 'build', cmd: 'npm', args: ['run', 'build'], timeoutMs: 900_000 },
          { cmd: 'npm', args: ['run', 'build'], timeoutMs: 600_000, cwd: 'packages/ui', env: { NODE_ENV: 'production' } },
        ],
      },
    });
  });

  it('declares no setup command and runs no build where the project declares none', () => {
    const preparation = workspacePreparationOf({ projectRoot, projectPrefix: '', dependencyDirectories: [], directory: '/runs/r1/gates/ga-0001', setup: [] });
    expect(preparation.options).toMatchObject({ packageDirectories: [''], build: false, setupCommands: [] });
  });

  it('refuses a setup command whose directory lies outside the project', () => {
    expect(() => workspacePreparationOf({
      projectRoot,
      projectPrefix: 'apps/web',
      dependencyDirectories: [],
      directory: '/runs/r1/gates/ga-0002',
      setup: [{ kind: 'setup', command: command(['make'], '/repository/apps', 60_000) }],
    })).toThrow(/outside project/u);
  });
});

it('reads the installed provider F3 committed A/B definitions despite malformed working C, without execution', async () => {
  const bundle = fileURLToPath(new URL('../../../../../../docs/plans/21-project-boundary-adoption/evidence/iteration0-public-fixtures/f3.bundle', import.meta.url));
  const parent = await mkdtemp(join(tmpdir(), 'ramify-agent-f3-consumer-'));
  const root = join(parent, 'f3');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const A = 'e33eac4917f962e60e0e74f0b3bdbc250971e923';
  const B = '743f8894bf464cb2b4a1cc2d464a7f173da66473';
  const marker = '/tmp/plan21-iteration0-f3-check-executed.marker';
  try {
    execFileSync('git', ['clone', '--quiet', bundle, root]);
    git('checkout', '--quiet', B);
    const original = await readFile(join(root, 'ramify-audit.json'));
    const refs = git('show-ref');
    const markerBefore = existsSync(marker);
    try {
      await writeFile(join(root, 'ramify-audit.json'), '{"checks": [malformed working C');
      const a = await readCommittedAuditConfiguration(root, A);
      const b = await readCommittedAuditConfiguration(root, B);
      expect(a).toMatchObject({ sourceCommit: A, blob: 'e56a34dc67e40a64d4b12301f4b1bf27a7048576',
        ignorePaths: ['docs/**'], workspace: { packageDirectories: [''], packageDirectoriesDeclared: true } });
      expect(a.checks.map(check => (check as { id: string }).id)).toEqual(['a-check']);
      expect(b.checks.map(check => (check as { id: string }).id)).toEqual(['b-check']);
      expect(b.workspace.packageDirectories).toEqual(['', 'nested']);
      expect((await readCommittedAuditConfiguration(root, A)).blob).toBe(a.blob);
      await expect(readCommittedAuditConfiguration(root, 'd5ec80b0e2b8c4d280f477cb388652aa3624a5d8')).rejects.toThrow('missing from audited commit');
      await expect(readCommittedAuditConfiguration(root, '735fab14b9369c3f281b56ad24d229d37867914b')).rejects.toThrow('must be a regular file');
      await expect(readCommittedAuditConfiguration(root, '6664c7adc65b22036f1a57275e9b5676cf7b543e')).rejects.toThrow('ignorePaths');
      expect(existsSync(marker)).toBe(markerBefore);
      expect(git('show-ref')).toBe(refs);
    } finally { await writeFile(join(root, 'ramify-audit.json'), original); }
  } finally { await rm(parent, { recursive: true, force: true }); }
}, 30_000);

it('keeps a declared credential-style variable in command A and scrubs its ambient value from command B', () => {
  const source = fileURLToPath(new URL('../check-execution.ts', import.meta.url));
  const commandA = "if(process.env.PLAN21_TEST_CREDENTIAL!=='declared'||process.env.RAMIFY_AUDIT_API_KEY!==undefined||process.env.RAMIFY_AUDIT_VITEST_EXCLUDES!==undefined)process.exit(7)";
  const commandB = "if(process.env.PLAN21_TEST_CREDENTIAL!==undefined||process.env.RAMIFY_AUDIT_API_KEY!==undefined||process.env.RAMIFY_AUDIT_VITEST_EXCLUDES!=='provider-selected-exclusions')process.exit(9)";
  const configuration = {
    sourceCommit: 'test', path: 'ramify-audit.json', blob: 'test', projectRoot: '.', checks: [{ executor: { kind: 'command', commands: [
      { cmd: process.execPath, args: ['-e', commandA], env: { PLAN21_TEST_CREDENTIAL: 'declared' } },
      { cmd: process.execPath, args: ['-e', commandB] },
    ] } }], ignorePaths: [], undetectedConfigFilesForcingFullAudit: [],
    workspace: { preparationId: 'nodejs', packageDirectoriesDeclared: false, linkNodeModules: false, packageDirectories: [''], setupCommands: [] },
  };
  const script = [
    `const { configuredProcessExecutor } = await import(${JSON.stringify(source)});`,
    `const port = configuredProcessExecutor(${JSON.stringify(configuration)}, () => process.cwd());`,
    `const a = await port.execute({ command: process.execPath, args: ['-e', ${JSON.stringify(commandA)}], workingDirectory: process.cwd(), environment: { ...process.env, PLAN21_TEST_CREDENTIAL: 'declared' } });`,
    `const discovery = await port.execute({ command: process.execPath, args: ['-e', ${JSON.stringify(commandA)}, '--', '--reporter=provider-added'], workingDirectory: process.cwd(), environment: { ...process.env, PLAN21_TEST_CREDENTIAL: 'declared', RAMIFY_AUDIT_VITEST_DISCOVERY: '/tmp/producer-discovery.json' } });`,
    `const b = await port.execute({ command: process.execPath, args: ['-e', ${JSON.stringify(commandB)}], workingDirectory: process.cwd(), environment: { ...process.env, RAMIFY_AUDIT_VITEST_EXCLUDES: 'provider-selected-exclusions' } });`,
    'process.stdout.write(JSON.stringify([a.exitCode, discovery.exitCode, b.exitCode]));',
  ].join('\n');
  const answer = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd: fileURLToPath(new URL('../../../../../../', import.meta.url)), encoding: 'utf8',
    env: childEnvironment({ PLAN21_TEST_CREDENTIAL: 'ambient-secret', RAMIFY_AUDIT_API_KEY: 'ambient-secret' }),
  });
  expect(JSON.parse(answer)).toEqual([0, 0, 0]);
}, 30_000);

it('binds identical root and nested argv to their exact working directories before projecting declared environment', () => {
  const source = fileURLToPath(new URL('../check-execution.ts', import.meta.url));
  const command = "if(process.env.PLAN21_TEST_CREDENTIAL!==(process.cwd().endsWith('/tools/tools')?'nested':'root'))process.exit(7)";
  const configuration = {
    sourceCommit: 'test', path: 'ramify-audit.json', blob: 'test', projectRoot: '.', checks: [{ executor: { kind: 'command', commands: [
      { cmd: process.execPath, args: ['-e', command], cwd: '.', env: { PLAN21_TEST_CREDENTIAL: 'root' } },
      { cmd: process.execPath, args: ['-e', command], cwd: 'tools', env: { PLAN21_TEST_CREDENTIAL: 'nested' } },
    ] } }], ignorePaths: [], undetectedConfigFilesForcingFullAudit: [],
    workspace: { preparationId: 'nodejs', packageDirectoriesDeclared: false, linkNodeModules: false, packageDirectories: [''], setupCommands: [] },
  };
  const script = [
    `const { configuredProcessExecutor } = await import(${JSON.stringify(source)});`,
    "const { mkdtempSync, mkdirSync, rmSync } = await import('node:fs');",
    "const { tmpdir } = await import('node:os');",
    "const { join } = await import('node:path');",
    "const parent = mkdtempSync(join(tmpdir(), 'plan21-exact-cwd-'));",
    "const root = join(parent, 'tools'); mkdirSync(join(root, 'tools'), { recursive: true });",
    `const port = configuredProcessExecutor(${JSON.stringify(configuration)}, () => root);`,
    "try {",
    `  const rootResult = await port.execute({ command: process.execPath, args: ['-e', ${JSON.stringify(command)}], workingDirectory: root, environment: { ...process.env, PLAN21_TEST_CREDENTIAL: 'root' } });`,
    `  const nestedResult = await port.execute({ command: process.execPath, args: ['-e', ${JSON.stringify(command)}], workingDirectory: join(root, 'tools'), environment: { ...process.env, PLAN21_TEST_CREDENTIAL: 'nested' } });`,
    "  process.stdout.write(JSON.stringify([rootResult.exitCode, nestedResult.exitCode]));",
    "} finally { rmSync(parent, { recursive: true, force: true }); }",
  ].join('\n');
  const answer = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd: fileURLToPath(new URL('../../../../../../', import.meta.url)), encoding: 'utf8',
    env: childEnvironment({ PLAN21_TEST_CREDENTIAL: 'root' }),
  });
  expect(JSON.parse(answer)).toEqual([0, 0]);
}, 30_000);

it('keeps the readiness wait paused until every parallel provider command has acquired or settled', async () => {
  const events: string[] = [];
  const check = { kind: 'conformance' as const, name: 'parallel-check', position: 1, total: 1 };
  const progress = configuredAuditProgress(new Map([['parallel-check', check]]), {
    waiting: async (_command, line) => { events.push(`wait:${line}`); },
    lockAcquired: () => { events.push('released'); },
  });
  const emit = async (event: object) => progress.emit(event as Parameters<typeof progress.emit>[0]);
  await emit({ type: 'check.waiting', checkId: 'parallel-check', command: 'A', lockPath: '/private-lock' });
  await emit({ type: 'check.waiting', checkId: 'parallel-check', command: 'B', lockPath: '/private-lock' });
  await emit({ type: 'check.lock-acquired', checkId: 'parallel-check', command: 'A', waitedMs: 1 });
  expect(events).toEqual(['wait:Waiting for audit test lock /private-lock', 'wait:Waiting for audit test lock /private-lock']);
  await emit({ type: 'check.lock-acquired', checkId: 'parallel-check', command: 'B', waitedMs: 2 });
  expect(events.at(-1)).toBe('released');
  await emit({ type: 'check.waiting', checkId: 'parallel-check', command: 'C', lockPath: '/private-lock' });
  await emit({ type: 'check.completed', checkId: 'parallel-check', result: {}, durationMs: 0 });
  expect(events.filter(event => event === 'released')).toHaveLength(2);
  progress.settleAll();
}, 30_000);

it('binds the F2 configured discovery reports and rejects partial or mismatched recovery evidence', async () => {
  const evidence = fileURLToPath(new URL('../../../../../../docs/plans/21-project-boundary-adoption/evidence/iteration2-consumer/', import.meta.url));
  const parent = await mkdtemp(join(tmpdir(), 'ramify-agent-f2-consumer-'));
  const root = join(parent, 'f2');
  try {
    execFileSync('git', ['clone', '--quiet', join(evidence, 'f2.bundle'), root]);
    const full = JSON.parse(await readFile(join(evidence, 'f2-full.json'), 'utf8'));
    const partial = JSON.parse(await readFile(join(evidence, 'f2-partial.json'), 'utf8'));
    const source = partial.summary.sourceCommit as string;
    const captured = await readCommittedAuditConfiguration(root, source);
    expect(captured.blob).toBe(partial.summary.coverage.claim.configuration.blob);
    expect(captured.checks.map(check => (check as { id: string }).id)).toEqual(['source-vitest', 'aux-vitest']);
    expect(partial.summary.coverage.expectedFiles).toMatchObject({ status: 'complete', expected: 3, run: 3 });
    const sourceFiles = partial.summary.checks['source-vitest'].commands.source.vitest.files.map((file: { path: string }) => file.path);
    expect(sourceFiles).toContain('src/tests/new-root.check.ts');
    expect(sourceFiles).not.toContain('src/tests/excluded.check.ts');
    expect(sourceFiles).not.toContain('src/tests/excluded.test.ts');
    expect(configuredFullResultMatches(full, captured)).toBe(true); // A same-definition earlier full may be reused.
    expect(configuredFullResultMatches(partial, captured)).toBe(false);
    const fullCaptured = await readCommittedAuditConfiguration(root, full.summary.sourceCommit);
    expect(configuredFullResultMatches(full, fullCaptured)).toBe(true);
    const widened = structuredClone(full);
    widened.summary.mode.requestedMode = 'ramify-partial';
    expect(configuredFullResultMatches(widened, fullCaptured)).toBe(true);
    expect(configuredFullResultMatches(full, { ...fullCaptured, blob: 'wrong-definition' })).toBe(false);
  } finally { await rm(parent, { recursive: true, force: true }); }
}, 30_000);
