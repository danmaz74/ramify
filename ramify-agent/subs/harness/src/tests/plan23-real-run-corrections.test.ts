import { createHash } from 'node:crypto';
import { pendingBindingEvidence } from '../reviews/message.js';
import { ScriptedCli } from '../../subs/evidence/src/tests/helpers/scripted-cli.js';
import { changedDocument } from './helpers/check-payloads.js';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { intakeToolName } from '../analysis/extraction.js';
import { coordinatorAssessmentToolName } from '../nonfunctional/submissions.js';
import { copyFixture } from './helpers/fixture.js';
import { defaultTurn, withDefaultTurns } from './helpers/declarations.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { assign, completionProposed, outline, submit, treeInputs } from './helpers/iterations.js';
import { openRunsWithoutProcesses, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { scriptedGit, scenariosCommit } from './helpers/scripted-git.js';
import { installTestRunner, runEventsOnDisk, startRun } from './helpers/runs.js';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createSessionOperations } from '../../subs/agent/src/session-operations.js';
import type { SessionExecutionPolicy, SessionExecutionBindings, SessionTaskInput } from '../../subs/agent/src/interfaces/session-operations.js';
import { openSessionStore } from '../run/session-store.js';
import { settleSessionEquipment } from '../run/session-operations.js';
import { ObservationLog } from '../run/observations.js';
import { engineerEquipment, projectMutationSnapshot } from '../work/engineer-equipment.js';
import { changesBetween } from '../hooks/mutation-order.js';
import { taskSupportSections } from '../work/task-support.js';
import { prepareAssignedCucumber, focusedScenarioFacts } from '../work/session.js';
import { createShellTool } from '../tools/shell.js';
import { capabilityGuardedPolicy, capabilityAuthorizationErrors } from '../capability/authorization.js';
import { boundedNonfunctionalTools, nonfunctionalScopeErrors } from '../nonfunctional/submissions.js';
import { coordinatorAssessmentPrompt } from '../nonfunctional/prompts.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { commandResult } from './helpers/command-result.js';
import { scriptedCandidates } from './helpers/candidates.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
vi.mock('node:child_process', async original => (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));
const cleanup: (() => Promise<unknown>)[] = [];
beforeEach(resetSpawnAttempts);
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); expect(spawnAttempts()).toEqual([]); expectNoProcesses(); forgetExternalTools(); });
async function root() { const path = await mkdtemp(join(tmpdir(), 'plan23-real-corrections-')); cleanup.push(() => rm(path, { recursive: true, force: true })); await mkdir(join(path, 'plans/.harness'), { recursive: true }); return path; }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pending(promise: Promise<unknown>) { let done = false; void promise.then(() => { done = true; }, () => { done = true; }); return () => done; }
async function flush() { await new Promise<void>(done => setImmediate(done)); }
async function equipment(path: string, id: string, ramify: Parameters<typeof engineerEquipment>[0]['ramify'] = new FakeRamifyCli(),
  outputPath: Parameters<typeof engineerEquipment>[0]['outputPath'] = (kind, invocation, number) => join(path, 'plans/.harness', `${invocation}-${kind}-${number}.json`)) {
  const observations = await ObservationLog.open(join(path, 'plans/.harness', `${id}.jsonl`));
  const tools = engineerEquipment({ projectRoot: path, ramify, commands: { hookTimeoutMs: 1000 } as never,
    bounds: { rejectedToolInputsPerTurn: 3 }, refresh: async () => null, index: () => null,
    guarded: { revision: 1, projectRoot: path, roots: [path], files: [], placement: async paths => paths.map(path => ({ path, allowed: true })) },
    scopeRevision: 1, outputPath,
    submissions: { legalOutcomes: ['completion-proposed', 'partial', 'unsuitable'], completionOutcome: 'completion-proposed' } });
  return { tools, observations, equipped: tools.equip({ invocation: id, observations, callId: () => 'mutable-most-recent-id', reminders: () => [] }) };
}
/** One admitted built-in write of `file`, settled through the equipment as the port would. */
async function writeThrough(equipped: Awaited<ReturnType<typeof equipment>>['equipped'], path: string, callId: string, file: string, content: string) {
  const call = { callId, tool: 'write', input: { path: file }, action: { kind: 'write' as const, paths: [file] } };
  expect(await equipped.guard!(call)).toEqual({ allow: true }); await writeFile(join(path, file), content);
  await equipped.afterMutation!({ ...call, failed: false });
}
const policy: SessionExecutionPolicy = { context: { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 }, authority: { write: true }, validator: { schema: 'current' }, destination: { record: 'submission' } };

describe('Plan23 composed run equipment', () => {
  test('three admitted guarded writes: Stop refuses queued calls before drain and retains active lease through the unconfirmed bound', async () => {
    const path = await root(); const first = deferred(); const entered = deferred();
    const { equipped } = await equipment(path, 'writer'); const sibling = await equipment(path, 'completion');
    const store = await openSessionStore({ directory: join(path, 'plans/.harness/store') }); cleanup.push(() => store.close());
    let executions = 0; const guards: string[] = []; let toolCalls!: Promise<unknown[]>;
    const definition = { name: 'write', description: 'Controlled native write', inputSchema: { type: 'object' }, mutating: true,
      action: (input: unknown) => ({ kind: 'write' as const, paths: [(input as { path: string }).path] }),
      execute: async () => { executions++; entered.resolve(); await first.promise; await writeFile(join(path, 'written.ts'), 'actual effect'); return { text: 'settled' }; } };
    const task: SessionTaskInput = { role: 'engineer', message: 'Write A', submissionTool: 'submit_result', environment: { workingDirectory: path, candidate: null, snapshot: null, limits: {} }, policyIdentity: 'p', validatorIdentity: 'v', destinationIdentity: 'd' };
    const bindings: SessionExecutionBindings = { task, policy, tools: [definition], submission: { name: 'submit_result', accept: async () => ({ accepted: true }) }, currentAuthority: async () => true, onEvent: () => {}, publish: async () => {},
      guard: async call => { guards.push(call.callId); return equipped.guard!(call); }, afterMutation: equipped.afterMutation };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_, runtime) {
      toolCalls = Promise.allSettled(['first', 'second', 'third'].map(id => runtime.callTool(id, 'write', { path: `${id}.ts` })));
      await toolCalls; return { kind: 'ended' };
    } } });
    const created = await operations.create({ runId: 'run', operationId: 'create', initialInstructions: 'engineer', declarations: [definition, { name: 'submit_result', description: 'Submit', inputSchema: {}, mutating: false }], activate: ['write', 'submit_result'], policy });
    const handle = await operations.continue({ runId: 'run', operationId: 'write', sessionId: created.sessionId, expectedPoint: created.point!, task, policy, bindings, additions: [], toolChange: { add: [], activate: [], inactivate: [] } });
    await entered.promise; await vi.waitFor(() => expect(guards).toEqual(['first', 'second', 'third']));
    const stop = handle.stop(); const drained = pending(handle.settled());
    expect(await handle.receipt).toMatchObject({ status: 'stopped', point: null });
    await equipped.settle!();
    expect(await settleSessionEquipment(() => handle.settled().then(() => undefined), 10)).toBe(false);
    let completions = 0; // Completion's scripted CLI cannot run before the active guard releases.
    const completion = sibling.tools.findingsAtCompletion({ kind: 'completion-proposed' }).then(() => { completions++; });
    await flush(); expect(completions).toBe(0); expect(drained()).toBe(false); expect(executions).toBe(1);
    first.resolve(); await stop; await handle.settled(); await equipped.drained!(); await completion;
    expect(executions).toBe(1); expect(completions).toBe(1); expect(await readFile(join(path, 'written.ts'), 'utf8')).toBe('actual effect');
  });

  test('completion retains the same lease through its delayed durable observation', async () => {
    const path = await root(); const a = await equipment(path, 'a'); const b = await equipment(path, 'b'); const recorded = deferred(); const release = deferred();
    const original = a.observations.record.bind(a.observations);
    vi.spyOn(a.observations, 'record').mockImplementation(async (input, at) => { if (input.type === 'hook-check') { recorded.resolve(); await release.promise; } return original(input, at); });
    const completion = a.tools.findingsAtCompletion({ kind: 'completion-proposed' }); await recorded.promise;
    const guard = b.equipped.guard!({ callId: 'b', tool: 'write', input: {}, action: { kind: 'write', paths: ['b.ts'] } });
    const finished = pending(guard); await flush(); expect(finished()).toBe(false);
    release.resolve(); await completion; expect(await guard).toEqual({ allow: true }); await b.equipped.drained!();
  });

  test('complete content snapshots include same-size overwrites, additions, deletions and config; symlink uncertainty never proves empty', async () => {
    const path = await root(); await writeFile(join(path, 'a.ts'), 'aa'); await writeFile(join(path, 'cucumber.mjs'), 'before');
    const before = await projectMutationSnapshot(path);
    await writeFile(join(path, 'a.ts'), 'bb'); await writeFile(join(path, 'cucumber.mjs'), 'after!'); await mkdir(join(path, 'new-module')); await writeFile(join(path, 'new-module/module.ramify'), 'module added');
    await writeFile(join(path, 'plans/.harness/ignored.log'), 'execution only');
    await mkdir(join(path, 'plans/owned/.harness'), { recursive: true }); await writeFile(join(path, 'plans/owned/.harness/observation.jsonl'), 'execution only');
    expect(changesBetween(before, await projectMutationSnapshot(path))).toEqual({ kind: 'known', paths: ['a.ts', 'cucumber.mjs', 'new-module/module.ramify'] });
    const added = await projectMutationSnapshot(path);
    await mkdir(join(path, 'owned/.harness'), { recursive: true }); await writeFile(join(path, 'owned/.harness/source.ts'), 'owned source');
    expect(changesBetween(added, await projectMutationSnapshot(path))).toEqual({ kind: 'known', paths: ['owned/.harness/source.ts'] });
    await rm(join(path, 'owned'), { recursive: true }); await rm(join(path, 'a.ts'));
    expect(changesBetween(added, await projectMutationSnapshot(path))).toEqual({ kind: 'known', paths: ['a.ts'] });
  });

  test('a symlink is inventoried by its target, never followed: no change stays proven, one changed file is named, and a retargeted link is a change', async () => {
    const path = await root(); await writeFile(join(path, 'a.ts'), 'aa'); await mkdir(join(path, 'linked-dir')); await writeFile(join(path, 'linked-dir/inner.ts'), 'inner');
    await symlink('/outside/source', join(path, 'link')); await symlink(join(path, 'linked-dir'), join(path, 'dir-link'));
    const before = await projectMutationSnapshot(path);
    expect(before).toMatchObject({ kind: 'complete', files: { link: 'symlink:/outside/source', 'dir-link': `symlink:${join(path, 'linked-dir')}`, 'linked-dir/inner.ts': expect.any(String) } });
    expect(Object.keys(before.kind === 'complete' ? before.files : {})).not.toContain('dir-link/inner.ts');
    expect(changesBetween(before, await projectMutationSnapshot(path))).toEqual({ kind: 'known', paths: [] });
    await writeFile(join(path, 'a.ts'), 'bb');
    expect(changesBetween(before, await projectMutationSnapshot(path))).toEqual({ kind: 'known', paths: ['a.ts'] });
    const edited = await projectMutationSnapshot(path);
    await rm(join(path, 'link')); await symlink('/outside/other', join(path, 'link'));
    expect(changesBetween(edited, await projectMutationSnapshot(path))).toEqual({ kind: 'known', paths: ['link'] });
  });

  test('a successful built-in write whose inventory cannot be compared is checked for the one path the guard resolved', async () => {
    const path = await root(); await writeFile(join(path, 'a.ts'), 'before'); const ramify = new ScriptedCli();
    const server = createServer(); await new Promise<void>(listening => server.listen(join(path, 'socket'), listening));
    cleanup.push(() => new Promise<void>(closed => server.close(() => closed())));
    expect(await projectMutationSnapshot(path)).toMatchObject({ kind: 'unknown', reason: expect.stringContaining('unsupported filesystem entry') });
    ramify.declare({ cwd: path, argv: ['check', '--changed', 'a.ts', '--format', 'json', '--deadline', '1000'], result: { code: 0, stdout: JSON.stringify(changedDocument(path, ['a.ts'])), stderr: '' } });
    const { equipped, observations } = await equipment(path, 'resolved', ramify);
    await writeThrough(equipped, path, 'write-a', 'a.ts', 'after'); ramify.assertComplete();
    expect(observations.observations.filter(item => item.type === 'mutation').map(item => item.data)).toMatchObject([{ callId: 'write-a', paths: [join(path, 'a.ts')], attributable: true, toolFailed: false }]);
    expect(observations.observations.filter(item => item.type === 'hook-check').map(item => [item.data.mode, item.data.paths, item.data.outcome])).toEqual([['changed', ['a.ts'], 'passed']]);
    expect(observations.observations.filter(item => item.type === 'coverage-gap')).toEqual([]);
    // A failed handler still leaves the changed set unknown: the contract says nothing about what it wrote.
    ramify.declare({ cwd: path, argv: ['check', '--batch', '--root', path, '--format', 'json', '--no-snapshot'], result: { code: 2, stdout: JSON.stringify({ schemaVersion: 'ramify.cli/1', status: 'unavailable', reason: 'stub', exitCode: 2 }), stderr: '' } });
    const failed = { callId: 'write-failed', tool: 'write', input: { path: 'a.ts' }, action: { kind: 'write' as const, paths: ['a.ts'] } };
    expect(await equipped.guard!(failed)).toEqual({ allow: true }); await equipped.afterMutation!({ ...failed, failed: true }); ramify.assertComplete();
    expect(observations.observations.filter(item => item.type === 'mutation').at(-1)!.data).toMatchObject({ callId: 'write-failed', paths: [], attributable: false, toolFailed: true });
    expect(observations.observations.filter(item => item.type === 'hook-check').at(-1)!.data).toMatchObject({ mode: 'complete', outcome: 'not-checked' });
  });

  test('hook check numbering continues from the log basename when the plan id says check and the run id carries digits', async () => {
    const path = await root(); await writeFile(join(path, 'a.ts'), 'v0');
    const outputPath: Parameters<typeof engineerEquipment>[0]['outputPath'] = (kind, invocation, number) =>
      join(path, 'plans/check-findings/.harness/runs/run-20261009', invocation, kind === 'hook' ? 'hooks' : 'shell', `${String(number).padStart(3, '0')}.json`);
    const first = await equipment(path, 'numbered', new FakeRamifyCli(), outputPath);
    await writeThrough(first.equipped, path, 'one', 'a.ts', 'v1'); await writeThrough(first.equipped, path, 'two', 'a.ts', 'v2');
    const logsOf = (observations: ObservationLog) => observations.observations.flatMap(item => item.type === 'hook-check' && item.data.log !== null ? [basename(item.data.log)] : []);
    expect(logsOf(first.observations)).toEqual(['001.json', '002.json']);
    const second = await readFile(join(path, 'plans/check-findings/.harness/runs/run-20261009/numbered/hooks/002.json'), 'utf8');
    const restored = await equipment(path, 'numbered', new FakeRamifyCli(), outputPath);
    await writeThrough(restored.equipped, path, 'three', 'a.ts', 'v3');
    expect(logsOf(restored.observations)).toEqual(['001.json', '002.json', '003.json']);
    expect(await readFile(join(path, 'plans/check-findings/.harness/runs/run-20261009/numbered/hooks/002.json'), 'utf8')).toBe(second);
  });

  test('three overlapping same-name shell calls retain their original guard IDs in shell and mutation records', async () => {
    const path = await root(); const gate = deferred(); const started = deferred(); const observations = await ObservationLog.open(join(path, 'plans/.harness/shells.jsonl'));
    const ramify = new FakeRamifyCli(); let executes = 0;
    const tools = engineerEquipment({ projectRoot: path, ramify, commands: { hookTimeoutMs: 1000 } as never, bounds: { rejectedToolInputsPerTurn: 3 }, refresh: async () => null, index: () => null,
      guarded: { revision: 1, projectRoot: path, roots: [path], files: [], placement: async paths => paths.map(path => ({ path, allowed: true })) }, scopeRevision: 1,
      outputPath: (kind, invocation, number) => join(path, 'plans/.harness', `${invocation}-${kind}-${number}`),
      commandExecution: async request => { executes++; if (executes === 1) { started.resolve(); await gate.promise; } await writeFile(join(path, `effect-${executes}`), request.argv[2]!); return commandResult(request, { stdout: 'ok' }); } });
    const equipped = tools.equip({ invocation: 'shells', observations, callId: () => 'WRONG-LAST-ID', reminders: () => [] }); const shell = equipped.tools![0]!;
    const inputs = ['one', 'two', 'three'].map(command => ({ command }));
    await Promise.all(inputs.map((input, index) => equipped.guard!({ callId: `original-${index + 1}`, tool: 'shell', input, action: { kind: 'command', command: input.command } })));
    const results = inputs.map(input => shell.execute(input, new AbortController().signal)); await started.promise; gate.resolve(); await Promise.all(results); await equipped.settle!(); await equipped.drained!();
    expect(tools.shellLog().map(call => call.callId)).toEqual(['original-1', 'original-2', 'original-3']);
    expect(observations.observations.filter(item => item.type === 'mutation').map(item => item.data.callId)).toEqual(['original-1', 'original-2', 'original-3']); expect(executes).toBe(3);
  });
});

const effectiveConfiguration = { paths: ['features/**/*.feature'], tags: 'not @ramify-pending', name: [], dryRun: false,
  import: ['support/world.mjs', 'support/steps.mjs'], require: [], requireModule: ['target-register'], loader: ['target-loader.mjs'], worldParameters: { marker: 'world' } };
test('declared focused Cucumber config/environment excludes U and defaults, survives quoted cwd, and stale config is refused with zero new dispatch', async () => {
  const path = await root(); await writeFile(join(path, 'cucumber.json'), '{}'); let loads = 0;
  const prepared = await prepareAssignedCucumber({ projectRoot: path, scratchDirectory: join(path, "plans/.harness/focused 'quote'"), featurePaths: ['features/A.feature', 'features/B.feature'],
    checks: [{ executor: { kind: 'command', commands: [{ cmd: join(path, 'node_modules/.bin/cucumber-js'), args: ['--config', 'cucumber.json', '--profile', 'declared'], parser: 'cucumber', env: { WORLD: 'declared', NODE_OPTIONS: '--import target-loader' } }] } }],
    runner: async request => { loads++; expect(request.env.WORLD).toBe('declared'); expect(JSON.parse(request.stdin!).profiles).toEqual(['declared']); return commandResult(request, { stdout: `RAMIFY_CUCUMBER_CONFIGURATION=${JSON.stringify({ schema: 'ramify-agent.cucumber-configuration/1', apiPath: join(path, 'node_modules/@cucumber/cucumber/lib/api/index.js'), configuration: effectiveConfiguration })}` }); } });
  expect(loads).toBe(1); if (prepared.command.kind !== 'available') throw new Error(prepared.command.reason);
  const command = prepared.command;
  const facts = JSON.parse(focusedScenarioFacts(prepared));
  expect(facts).toMatchObject({ kind: 'available', cwd: path, configPath: command.configPath, configurationIdentity: command.configurationIdentity, sourceFiles: prepared.sourceFiles, environmentNames: expect.arrayContaining(['WORLD', 'NODE_OPTIONS']) });
  expect(focusedScenarioFacts(prepared)).not.toContain('--import target-loader');
  const generated = JSON.parse(await readFile(command.configPath, 'utf8'));
  expect(Object.keys(generated)).toEqual(['ramify-focused']); expect(generated['ramify-focused'].paths).toEqual([join(path, 'features/A.feature'), join(path, 'features/B.feature')]);
  expect(generated['ramify-focused'].tags).toBe(''); expect(generated.default).toBeUndefined(); expect(command.support).toEqual({ import: effectiveConfiguration.import, require: [], requireModule: ['target-register'], loader: ['target-loader.mjs'], worldParameters: { marker: 'world' } });
  let dispatches = 0;
  const shell = createShellTool({ workingDirectory: path, judge: async () => ({ ok: true }), starting: async () => {}, ended: async () => {}, outputFile: call => join(path, 'plans/.harness', `out-${call}`),
    focusedCommands: [{ shellCommand: command.shellCommand, selection: command.selection, environment: command.environment, sourceFiles: prepared.sourceFiles }],
    commandExecution: async request => { dispatches++; expect(request.env.WORLD).toBe('declared'); expect(request.env.NODE_OPTIONS).toBe('--import target-loader'); return commandResult(request, { stdout: 'A/B' }); } });
  expect(await shell.definition.execute({ command: command.shellCommand }, new AbortController().signal)).not.toHaveProperty('isError', true); expect(dispatches).toBe(1);
  await writeFile(command.configPath, '{"default":{"paths":["features/U.feature"]}}');
  expect(await shell.definition.execute({ command: command.shellCommand }, new AbortController().signal)).toMatchObject({ isError: true, text: expect.stringContaining('unverified') });
  expect(await shell.definition.execute({ command: 'cucumber-js features/A.feature' }, new AbortController().signal)).toMatchObject({ isError: true }); expect(dispatches).toBe(1); await shell.settle();
});

test('shared structural dedup preserves embedded goals and complete fenced heading literals', () => {
  const goal = 'Keep every byte.'; const literal = '````text\n# comment\n# second\n## nested\n\nKeep every byte.\n```\n# still literal\n````';
  const text = `# Goal\n${goal}\n\n# Support\nEmbedded: ${goal}\n${literal}\n\n~~~text\n# tilde\n# another\n${goal}\n~~~`;
  const sections = taskSupportSections(text, [goal]); const support = sections.map(section => section.text).join('\n\n');
  expect(support).toContain(`Embedded: ${goal}`); expect(support).toContain(literal); expect(support).toContain(`~~~text\n# tilde\n# another\n${goal}\n~~~`); expect(support).not.toContain(`# Goal\n${goal}`);
});

test('one capability artifact authorization policy excludes configuration while retaining supported agreements', () => {
  const supported = capabilityGuardedPolicy([{ path: 'contracts/interface.ts' }, { path: 'contracts/fake.ts' }]);
  expect([...supported]).toEqual(['contracts/interface.ts', 'contracts/fake.ts']); expect(capabilityAuthorizationErrors([{ path: 'contracts/fake.ts' }], supported)).toEqual([]);
  expect(capabilityAuthorizationErrors([{ path: 'package.json' }, { path: 'vitest.config.ts' }], supported).map(error => error.path)).toEqual(['authorizations.0.path', 'authorizations.1.path']);
});

test('NFR candidate tools enforce scoped bytes, reject run/VCS/symlink reads, and omit irrelevant temporal language', async () => {
  const path = await root(); const tree = 'a'.repeat(40); const source = scriptedCandidates(path, { [tree]: { tree, base: 'base', changes: [{ status: 'M', path: 'src/a.ts' }], files: { 'src/a.ts': 'candidate bytes', 'other/b.ts': 'out of scope', 'plans/.harness/job.json': 'run record', '.git/config': 'metadata', 'src/escape': { symlink: '/outside' } } } });
  const grep = vi.spyOn(source, 'grepTree');
  const tools = boundedNonfunctionalTools({ source, projectRoot: path, candidate: tree, base: 'base', scope: ['src'] }); const read = tools.find(tool => tool.name === 'snapshot_read')!;
  expect(await read.execute({ path: 'src/a.ts' }, new AbortController().signal)).toMatchObject({ text: expect.stringContaining('candidate bytes') });
  for (const denied of ['other/b.ts', 'plans/.harness/job.json', '.git/config', 'src/escape', '../outside']) expect(await read.execute({ path: denied }, new AbortController().signal)).toMatchObject({ isError: true });
  expect(nonfunctionalScopeErrors(['.git', 'plans/.harness', '../outside', 'src/**'])).toHaveLength(4);
  expect(coordinatorAssessmentPrompt('Exact scoped NFR package.', { tree, head: 'base', preparedAt: '2026-10-08T00:00:00Z' }, 1, 'initial')).not.toContain('temporal');
  const search = tools.find(tool => tool.name === 'snapshot_search')!;
  expect(await search.execute({ pattern: 'candidate|scope|record|metadata' }, new AbortController().signal)).toMatchObject({ text: expect.stringContaining('src/a.ts') });
  expect(grep).toHaveBeenCalledWith(path, tree, 'candidate|scope|record|metadata', ['src/a.ts'], expect.any(AbortSignal));
  expect(source.calls.filter(call => call.startsWith('readBlob'))).toEqual([`readBlob ${tree} src/a.ts`]);
});


test('actual RunService delivers accepted classifications, rejects a bad catalog reference without allocating IDs, and trusts architect reports separately from audit health', async () => {
  const fixture = await copyFixture(); cleanup.push(fixture.remove); await installTestRunner(fixture.root);
  const plan = join(fixture.root, 'plans/revision-diff/plan.md');
  const requirement = 'Preserve the configured timeout.'; const advice = 'Use Redis if practical.';
  await writeFile(plan, `# Request\n\n${requirement}\n${advice}\n\n# Acceptance\n\nThe scenario passes.\n`);
  let local = 0; let initialPrompt = ''; const initial = analysis([entry('review-summary', 'collection-review/workspace/reviews/core')]);
  const agent = createScriptedAgent(withDefaultTurns(spec => {
    if (spec.submission.name === intakeToolName) {
      const input = (defaultTurn(spec)![0] as { input: Record<string, unknown> }).input;
      return submit({ ...input, elements: [
        { key: 'timeout', kind: 'non-functional', document: 'doc-001', text: requirement, conditions: [], uncertainty: '' },
        { key: 'redis', kind: 'recommendation', document: 'doc-001', text: advice, conditions: [], uncertainty: 'Optional.' },
      ] });
    }
    if (spec.role === 'initial-architect') {
      initialPrompt = spec.prompt;
      return [{ kind: 'submit', input: { ...initial, entries: [{ ...initial.entries[0]!, requirementRefs: ['missing-functional'] }] } }, ...submit(initial)];
    }
    if (spec.submission.name === 'submit_work_item_result') return local++ === 0
      ? submit(assign('collection-review/workspace/reviews/core', { citedElements: ['fr-001'], obligations: ['sc-001'] }, outline()))
      : submit({ ...requestCompletion(), reports: [{ id: 'sc-001', judgment: 'done', basedOnRevision: 0 }] });
    if (spec.role === 'engineer') return submit(completionProposed('Declared implementation complete.', { bindings: [{ id: 'sc-001' }] }));
    if (spec.submission.name === coordinatorAssessmentToolName) {
      expect(spec.prompt).toContain(requirement); expect(spec.prompt).not.toContain(advice);
      expect(spec.prompt).toContain('\"changedPaths\":[]'); expect(spec.prompt).toContain('\"readScope\":[\".\"]');
      return submit({ kind: 'assessment', results: [{ nfr: 'nfr-001', result: 'satisfied', inspectedScope: ['subs/workspace/subs/reviews/subs/core/src'], evidence: ['Prepared source inspected.'], uncertainty: '' }] });
    }
    return [];
  }));
  const scenario = scenariosCommit('revision-diff'); const tree = 'a'.repeat(40);
  const git = scriptedGit(fixture.root, { head: 'unchanged-fixture-revision', checkpoints: [scenario,
    { subject: 'wi-001.i01', commit: null, changes: [] }, { subject: 'wi-001', commit: null, changes: [] },
    { subject: 'final verification of plan "revision-diff"', commit: null, changes: [] }],
    previews: Array.from({ length: 5 }, () => ({ repositoryRoot: fixture.root, head: scenario.commit!, tree })) });
  const candidates = scriptedCandidates(fixture.root, { [scenario.commit!]: { tree, files: {}, base: 'unchanged-fixture-revision', changes: [] }, [tree]: { tree, files: {}, base: scenario.commit!, changes: [] } });
  const opened = await openRunsWithoutProcesses(fixture.root, git, { agent, inputs: treeInputs(), candidates }); cleanup.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('revision-diff')); await opened.service.settled('revision-diff', receipt.jobId);
  const events = await runEventsOnDisk(fixture.root, 'revision-diff', receipt.jobId);
  expect(events.filter(event => event.type === 'job-failed')).toEqual([]); expect(events.some(event => event.type === 'job-completed')).toBe(true);
  expect(initialPrompt).toContain('Accepted intake classifications and incorporation:');
  expect(initialPrompt).toContain('"kind":"non-functional"'); expect(initialPrompt).toContain('"kind":"recommendation"');
  const initialSession = agent.sessions.find(session => session.spec.role === 'initial-architect')!;
  expect(JSON.stringify(initialSession.verdicts[0])).toContain('missing-functional');
  expect(JSON.stringify(initialSession.verdicts[0])).toContain('false');
  expect(JSON.stringify(initialSession.verdicts.at(-1))).toContain('true');
  const accepted = events.find(event => event.type === 'analysis-accepted')!;
  expect(accepted.data.catalog).toEqual({ context: 0, functional: 2, nonFunctional: 1, fixed: 0, recommendation: 1 });
  expect(events.filter(event => event.type === 'obligation-reported').map(event => event.data.id)).toContain('sc-001');
  git.assertComplete();
});


test('reconstructed equipment retains genuine provider findings and continues log identities; missing original evidence refuses admission', async () => {
  const path = await root(); await writeFile(join(path, 'a.ts'), 'before'); const ramify = new ScriptedCli();
  ramify.declare({ cwd: path, argv: ['check', '--changed', 'a.ts', '--format', 'json', '--deadline', '1000'],
    result: { code: 1, stdout: JSON.stringify(changedDocument(path, ['a.ts'], [{ id: 'original-finding', category: 'import', code: 'denied-access', message: 'not exposed', location: { file: 'a.ts', line: 1, column: 1, start: 0, end: 1 }, importer: null, original: null }])), stderr: 'provider stderr retained' } });
  const original = await equipment(path, 'restored', ramify);
  const call = { callId: 'original', tool: 'write', input: { path: 'a.ts' }, action: { kind: 'write' as const, paths: ['a.ts'] } };
  expect(await original.equipped.guard!(call)).toEqual({ allow: true }); await writeFile(join(path, 'a.ts'), 'after');
  await original.equipped.afterMutation!({ ...call, failed: false }); ramify.assertComplete();
  expect(original.tools.openFindings().map(finding => finding.identity)).toEqual(['original-finding']);
  const restored = await equipment(path, 'restored');
  expect((await restored.tools.findingsAtCompletion({ kind: 'completion-proposed' })).map(finding => finding.identity)).toEqual(['original-finding']);
  expect(restored.observations.observations.flatMap(item => item.type === 'hook-check' && item.data.log !== null ? [item.data.log] : [])).toEqual([join(path, 'plans/.harness/restored-hook-1.json'), join(path, 'plans/.harness/restored-hook-2.json')]);
  await rm(join(path, 'plans/.harness/restored-hook-1.json')); const unsafe = await equipment(path, 'restored');
  await expect(unsafe.equipped.guard!({ ...call, callId: 'unsafe' })).rejects.toThrow();
  await expect(unsafe.tools.findingsAtCompletion({ kind: 'completion-proposed' })).rejects.toThrow();
});


test('pending-tag attribution requires the exact candidate rendering and accepted producer bytes', () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ schema: 'ramify-agent.engineer-submission/1', ...completionProposed('Bound.', { bindings: [{ id: 'sc-001' }] }) }));
  const hash = createHash('sha256').update(bytes).digest('hex'); const candidate = '# tracked sc-001\nScenario: one\n';
  const input = { path: 'src/tests/one.feature', scenario: 'sc-001', invocation: 'inv-accepted', submission: hash, submissionBytes: bytes, candidateBytes: candidate, expectedBytes: candidate };
  expect(pendingBindingEvidence(input)).toEqual({ path: input.path, scenario: 'sc-001', invocation: 'inv-accepted', submission: hash, sha256: createHash('sha256').update(candidate).digest('hex') });
  for (const changed of [{ candidateBytes: candidate + 'unexpected patch' }, { expectedBytes: undefined }, { submission: '0'.repeat(64) }, { scenario: 'sc-unbound' }, { submissionBytes: new TextEncoder().encode('{}') }]) expect(pendingBindingEvidence({ ...input, ...changed })).toBeNull();
});
