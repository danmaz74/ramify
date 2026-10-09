import { afterEach, expect, test } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createScriptedAgent, type SessionScript } from '../../subs/agent/src/scripted.js';
import type { SessionDriverInvocation, SessionExecutionPolicy, SessionTaskInput } from '../../subs/agent/src/interfaces/session-operations.js';
import type { AgentPort } from '../../subs/agent/src/interfaces/port.js';
import { HarnessSessionOperations, readSessionPointReference, sessionPointReference, type HarnessOperationInput } from '../run/session-operations.js';
import { effectiveBlocks } from '../prompts/blocks.js';
import { buildDeliveredManifest, type DeliveredInput } from '../prompts/delivered-manifest.js';
import type { BriefingRevision } from '../prompts/briefings.js';

const roots: string[] = []; const adapters: HarnessSessionOperations[] = [];
afterEach(async () => { for (const adapter of adapters.splice(0)) await adapter.close(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const set = (key: string, text: string) => `# Block ${key}\nCurrent value; replaces any earlier value for this key.\n${text}`;
function request(operationId: string, ref?: string, body = 'A', candidate: string | null = 'C1'): HarnessOperationInput {
  const name = 'submit_work_item_result';
  return { runId: 'run', operationId, session: 'logical-session', loaded: { role: 'local-architect', package: 'pinned/test', hash: '0'.repeat(64), files: [], submissionKinds: [], system: 'Pinned architect role.', procedure: 'Main procedure; submit through {{submissionTool}}.', skill: '', skillDirectory: '/skills', extraSkill: '', submissionSchema: '{"type":"object"}' },
    brief: { kind: 'assignment', objective: `Perform ${operationId}`, goal: 'G', requirements: ['R'], sections: [{ key: 'support:evidence', text: body }],
      environment: { projectRoot: '/project', workingDirectory: '/project/owner', candidate, snapshot: null, limits: { stopSettleMs: 1000 }, availableTools: [name], views: [], supportPaths: [], cucumberConfiguration: null } },
    spec: { role: 'local-architect', scope: { workingDirectory: '/project/owner' }, session: ref ? { mode: 'continue', ref } : { mode: 'fresh' }, context: { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 }, builtinTools: [], tools: [], systemPrompt: 'Legacy composite', prompt: 'Legacy composite', submission: { name, description: 'Caller description', inputSchema: { type: 'object' }, accept: async () => ({ accepted: true }) }, onEvent: () => undefined },
    authority: { paths: ['owner/src'] }, validator: { schema: 'test/1' }, destination: { record: operationId }, currentAuthority: async () => true };
}
async function open(script: SessionScript = [{ kind: 'submit', input: {} }], root?: string, override?: (agent: AgentPort) => AgentPort) {
  const directory = root ?? await mkdtemp(join(tmpdir(), 'plan25-session-')); if (!root) roots.push(directory);
  const agent = createScriptedAgent([], { operationScript: script }); const adapter = await HarnessSessionOperations.open(directory, override?.(agent) ?? agent); adapters.push(adapter);
  return { root: directory, adapter, agent };
}
async function turn(adapter: HarnessSessionOperations, input: HarnessOperationInput) {
  const session = await adapter.start(input); expect((await session.outcome).kind).toBe('submitted'); expect(await session.settled()).toBe('settled'); return session;
}
async function correlation(root: string, kind: string, key: unknown, value: unknown) {
  const path = join(root, 'correlations', kind, `${hash(JSON.stringify(key))}.json`); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value)); return path;
}
async function contextAt(root: string, ref: string) {
  const point = readSessionPointReference(ref)!.point;
  return JSON.parse(await readFile(join(root, 'correlations/points', `${hash(JSON.stringify(['run', point]))}.json`), 'utf8')) as { inherited: DeliveredInput[]; history: BriefingRevision[]; revision: string };
}

test('P08/P09/S07: actual start A/B/A, unchanged goal and requirements, immutable occurrences through restart', async () => {
  const seen: SessionDriverInvocation[] = []; const script: SessionScript = value => { seen.push(value); return [{ kind: 'submit', input: {} }]; };
  const first = await open(script); const a = await turn(first.adapter, request('a'));
  const b = await turn(first.adapter, request('b', a.ref, 'B', 'C2'));
  await first.adapter.close(); const next = await open(script, first.root);
  const restored = await turn(next.adapter, request('a-again', b.ref));
  const final = await turn(next.adapter, request('unchanged', restored.ref));
  const ctx = await contextAt(first.root, final.ref);
  expect(ctx.history.map(entry => entry.sections.find(section => section.key === 'support:evidence')!.text)).toEqual(['A', 'B', 'A']);
  expect(ctx.history[0]!.contentHash).toBe(ctx.history[2]!.contentHash); expect(ctx.history[0]!.revision).not.toBe(ctx.history[2]!.revision);
  expect(seen[2]!.task.message).toContain(set('brief:support:evidence', 'A'));
  expect(seen[2]!.task.message).not.toContain('# Block brief:goal'); expect(seen[2]!.task.message).not.toContain('# Block brief:requirements');
  const last = (await next.adapter.packet('run', 'unchanged'))!;
  expect(last.additions.map(item => item.key)).toEqual(['briefing-state', 'task']);
  expect(last.manifest.entries.filter(entry => entry.key === 'brief:support:evidence').map(entry => entry.hash)).toEqual([hash(set('brief:support:evidence', 'A')), hash(set('brief:support:evidence', 'B')), hash(set('brief:support:evidence', 'A'))]);
  expect(last.manifest.entries.every(entry => entry.kind === 'task' || entry.delivery === 'inherited')).toBe(true);
});

test('P04/P08: structural withdrawal, no repeated removal, reintroduction and selector retention', async () => {
  const { adapter } = await open(); const a = await turn(adapter, request('with-support'));
  const removedInput = request('remove', a.ref); const removed = await turn(adapter, { ...removedInput, brief: { ...removedInput.brief, sections: [] } });
  const removal = (await adapter.packet('run', 'remove'))!.additions.find(item => item.block?.key === 'brief:support:evidence')!;
  expect(removal).toMatchObject({ text: '# Block brief:support:evidence\nWithdrawn; this block no longer applies.\n', block: { key: 'brief:support:evidence', effect: 'remove' } });
  const againInput = request('remove-again', removed.ref); const again = await turn(adapter, { ...againInput, brief: { ...againInput.brief, sections: [] } });
  expect((await adapter.packet('run', 'remove-again'))!.additions.filter(item => item.kind === 'brief')).toEqual([]);
  const restored = await turn(adapter, request('reintroduce', again.ref));
  expect(effectiveBlocks((await contextAt(roots[0]!, restored.ref)).inherited).get('brief:support:evidence')!.text).toBe(set('brief:support:evidence', 'A'));
  const selector = request('selector', restored.ref); const name = 'submit_context_selection';
  await turn(adapter, { ...selector, loaded: { ...selector.loaded, role: 'context-selector', system: 'Pinned selector.' },
    spec: { ...selector.spec, role: 'context-selector', session: { mode: 'fork', from: restored.ref }, submission: { ...selector.spec.submission, name } },
    brief: { ...selector.brief, kind: 'selection', sections: [], retainInheritedSections: true, environment: { ...selector.brief.environment, availableTools: [name] } } });
  expect((await adapter.packet('run', 'selector'))!.additions.filter(item => item.kind === 'brief')).toEqual([]);
});

test('S01/S02: old-point fork sees its exact prefix, active role/tool/cwd/validator/destination bind independently', async () => {
  const seen: SessionDriverInvocation[] = []; const { adapter } = await open(value => { seen.push(value); return [{ kind: 'submit', input: {} }]; });
  const a = await turn(adapter, request('parent-a')); await turn(adapter, request('parent-b', a.ref, 'B', 'C2'));
  const child = request('child', a.ref); const name = 'submit_iteration_result';
  const result = await turn(adapter, { ...child, loaded: { ...child.loaded, role: 'engineer', system: 'Pinned engineer.' },
    spec: { ...child.spec, role: 'engineer', session: { mode: 'fork', from: a.ref }, scope: { workingDirectory: '/current-cwd' }, submission: { ...child.spec.submission, name } },
    brief: { ...child.brief, kind: 'engineering', environment: { ...child.brief.environment, availableTools: [name] } }, authority: { paths: ['current-owner'] }, validator: { schema: 'engineer/1' }, destination: { record: 'child-only' } });
  expect(seen[2]!.session.parent).toEqual(readSessionPointReference(a.ref)!.point);
  expect(seen[2]!.session.activeTools).toEqual([name]); expect(seen[2]!.task.role).toBe('engineer'); expect(seen[2]!.task.environment.workingDirectory).toBe('/current-cwd');
  expect(seen[2]!.session.policy).toMatchObject({ authority: { paths: ['current-owner'] }, validator: { schema: 'engineer/1' }, destination: { record: 'child-only' } });
  const packet = (await adapter.packet('run', 'child'))!;
  expect(packet.message).toContain('Selected procedure: procedure:engineer:main');
  expect(packet.manifest.entries.some(entry => entry.hash === hash(set('brief:support:evidence', 'B')))).toBe(false);
  expect(effectiveBlocks((await contextAt(roots[0]!, result.ref)).inherited).get('environment:candidate')!.text).toBe(set('environment:candidate', '{\n  "candidate": "C1"\n}'));
});

test('S03: restart retries retained packet despite changed package; changed requests remain conflicts', async () => {
  let count = 0; const first = await open(() => { count++; return [{ kind: 'submit', input: {} }]; }); const input = request('immutable');
  await turn(first.adapter, input); const original = await first.adapter.packet('run', 'immutable'); await first.adapter.close();
  const next = await open(() => { count++; return [{ kind: 'submit', input: {} }]; }, first.root);
  await turn(next.adapter, { ...input, restore: true, loaded: { ...input.loaded, system: 'New loaded bytes', procedure: '{{missing}}', submissionSchema: 'bad schema' }, brief: { ...input.brief, goal: 'Later goal', requirements: ['Later requirement'] } });
  expect(count).toBe(1); expect(await next.adapter.packet('run', 'immutable')).toEqual(original);
  await expect(next.adapter.start({ ...input, brief: { ...input.brief, sections: [{ key: 'support:evidence', text: 'changed request' }] } })).rejects.toThrow('Conflicting harness session correlation');
  await expect(next.adapter.start({ ...input, brief: { ...input.brief, objective: 'Perform immutable plus more' } })).rejects.toThrow('Conflicting harness session correlation');
  await expect(next.adapter.start({ ...input, destination: { record: 'new destination' } })).rejects.toThrow('Restored authority');
  await expect(next.adapter.start({ ...input, spec: { ...input.spec, scope: { workingDirectory: '/changed-scope' } } })).rejects.toThrow('Conflicting harness session correlation');
  await expect(next.adapter.start({ ...input, session: 'another logical session' })).rejects.toThrow('Conflicting harness session correlation');
});

test('S04: prepared and uncommitted failure do not establish delivery; committed pre-dispatch failure retains context', async () => {
  const { root, adapter } = await open(); const prepared = request('prepared');
  await expect(adapter.start({ ...prepared, prepared: async () => { throw new Error('prepared only'); } })).rejects.toThrow('prepared only');
  expect(await adapter.operations.operationIdentity('run', 'prepared')).toBeNull();
  const failed = await adapter.start({ ...request('committed-failure'), identified: async () => { throw new Error('before provider dispatch'); } });
  expect((await failed.outcome).kind).toBe('failed'); expect(await failed.settled()).toBe('settled'); expect(failed.ref).not.toBe('');
  expect(effectiveBlocks((await contextAt(root, failed.ref)).inherited).get('brief:support:evidence')!.text).toBe(set('brief:support:evidence', 'A'));
  const continued = await turn(adapter, request('after-failure', failed.ref)); expect(continued.ref).not.toBe('');
  expect((await adapter.packet('run', 'after-failure'))!.additions.map(item => item.key)).toEqual(['briefing-state', 'task']);
  const other = await open([{ kind: 'fail', error: 'provider interrupted' }]); const interrupted = await other.adapter.start(request('interrupted'));
  expect((await interrupted.outcome).kind).toBe('failed'); expect(await interrupted.settled()).toBe('settled'); expect(interrupted.ref).toBe('');
});

test('S05/S07: named append A/B/A with framing, logical metadata, idempotent replay and restart', async () => {
  const first = await open(); const a = await turn(first.adapter, request('append-start'));
  const b = await first.adapter.append(a.ref, 'named-b', 'B', 'support:evidence'); expect(b.outcome).toBe('appended'); if (!('ref' in b)) throw new Error('No B point');
  const again = await first.adapter.append(b.ref, 'named-a', 'A', 'support:evidence'); expect(again.outcome).toBe('appended'); if (!('ref' in again)) throw new Error('No A point');
  const ctx = await contextAt(first.root, again.ref); expect(ctx.history.map(entry => entry.sections.at(-1)!.text)).toEqual(['A', 'B', 'A']);
  expect(ctx.history[0]!.contentHash).toBe(ctx.history[2]!.contentHash); expect(ctx.history[0]!.revision).not.toBe(ctx.history[2]!.revision);
  expect(ctx.inherited.at(-1)).toMatchObject({ key: 'append:named-a', text: set('brief:support:evidence', 'A'), block: { key: 'brief:support:evidence', effect: 'set' } });
  const engine = await first.adapter.operations.inspect('run', readSessionPointReference(again.ref)!.point.sessionId); expect(engine!.additions.at(-1)!.text).toBe(set('brief:support:evidence', 'A'));
  await first.adapter.close(); const next = await open(undefined, first.root);
  expect(await next.adapter.append(a.ref, 'named-a', 'A', 'support:evidence')).toEqual({ outcome: 'already-present', ref: again.ref });
  const adhoc = await next.adapter.append(again.ref, 'ad-hoc', 'Uninterpreted prose'); if (!('ref' in adhoc)) throw new Error('No ad hoc point');
  await turn(next.adapter, request('after-appends', adhoc.ref));
  expect((await next.adapter.packet('run', 'after-appends'))!.additions.map(item => item.key)).toEqual(['briefing-state', 'task']);
  expect((await contextAt(first.root, adhoc.ref)).inherited.at(-1)!.block).toBeUndefined();
});

test('S05: a concurrent stale proposal retries once at the committed head without inventing ancestry', async () => {
  let move!: () => Promise<void>; let race = true;
  const { adapter } = await open(undefined, undefined, agent => ({ ...agent, bindSessionStore(store) {
    const ops = agent.bindSessionStore!(store); return { ...ops, async appendContext(input) {
      if (input.operationId.endsWith(':racing') && race) { race = false; await move(); }
      return ops.appendContext(input);
    } };
  } }));
  const a = await turn(adapter, request('race-start'));
  move = async () => { expect((await adapter.append(a.ref, 'winner', 'Winner', 'support:evidence')).outcome).toBe('appended'); };
  const loser = await adapter.append(a.ref, 'racing', 'Racing', 'support:evidence'); expect(loser.outcome).toBe('appended'); if (!('ref' in loser)) throw new Error('No point');
  const history = (await contextAt(roots[0]!, loser.ref)).history;
  expect(history.map(entry => entry.sections.at(-1)!.text)).toEqual(['A', 'Winner', 'Racing']);
  expect(await adapter.append(a.ref, 'racing', 'Racing', 'support:evidence')).toEqual({ outcome: 'already-present', ref: loser.ref });
});

/** Independently assembled legacy packet, intent and real engine operation. */
async function legacy(root: string, adapter: HarnessSessionOperations) {
  const input = request('legacy'); const declaration = { name: 'submit_work_item_result', description: 'Submit this task using exactly this JSON schema: {"type":"object"}', inputSchema: { type: 'object' as const }, mutating: false as const };
  const sections = [{ key: 'goal', text: '# Goal\nG' }, { key: 'requirements', text: '# Requirements\n- R' }, { key: 'support:evidence', text: 'A' }];
  const additions: DeliveredInput[] = [{ key: 'role:local-architect', kind: 'role-instructions', text: 'Pinned architect role.', source: 'old/system.md', revision: 'old-pinned' },
    { key: 'tool:submit_work_item_result', kind: 'tool-declaration', text: JSON.stringify(declaration), source: null, revision: null },
    ...sections.map(section => ({ key: `brief:${section.key}`, kind: 'brief' as const, text: section.text, source: 'old/evidence.md', revision: 'old-revision' })),
    { key: 'procedure:assignment', kind: 'procedure', text: '# Current procedure\nMain procedure; submit through submit_work_item_result.', source: 'old/procedure.md', revision: 'old-pinned' },
    { key: 'environment', kind: 'environment', text: `# Current environment\n${JSON.stringify(input.brief.environment, null, 2)}`, source: null, revision: null },
    { key: 'task', kind: 'task', text: '# Current task: assignment\nPerform legacy\n\nSubmit only through `submit_work_item_result`. Only an accepted submission completes this task.', source: null, revision: 'old-revision' }];
  const message = additions.filter(item => !['role-instructions', 'tool-declaration'].includes(item.kind)).map(item => item.text).join('\n\n');
  const packet = { roleInstructions: 'Pinned architect role.', message, submissionTool: declaration.name, declaration, additions, manifest: buildDeliveredManifest({ inheritedPoint: null, inherited: [], appended: additions, currentMessage: message }) };
  const policy: SessionExecutionPolicy = { context: input.spec.context, authority: input.authority, validator: input.validator, destination: input.destination };
  const task: SessionTaskInput = { role: input.spec.role, message, submissionTool: declaration.name, environment: { workingDirectory: '/project/owner', candidate: 'C1', snapshot: null, limits: { stopSettleMs: 1000 } }, policyIdentity: hash(JSON.stringify(policy)), validatorIdentity: hash(JSON.stringify(input.validator)), destinationIdentity: hash(JSON.stringify(input.destination)) };
  const created = await adapter.operations.create({ runId: 'run', operationId: 'legacy:create', initialInstructions: packet.roleInstructions, declarations: [declaration], activate: [declaration.name], policy });
  const handle = await adapter.operations.continue({ runId: 'run', operationId: 'legacy', sessionId: created.sessionId, expectedPoint: created.point!, task, additions: [], policy,
    toolChange: { add: [declaration], activate: [declaration.name], inactivate: [] }, bindings: { task, policy, tools: [], submission: { name: declaration.name, accept: input.spec.submission.accept }, currentAuthority: async () => true, onEvent: () => undefined, publish: async () => undefined } });
  const receipt = await handle.receipt; await handle.settled(); expect(receipt.status).toBe('completed');
  const context = { inherited: additions, history: [{ revision: 'old-revision', sections }], revision: 'old-revision' };
  const intent = { schema: 'ramify-agent.harness-operation/1', runId: 'run', operationId: 'legacy', session: input.session, source: null, mode: 'fresh', packet, context, policy, task, declarations: [declaration] };
  const path = await correlation(root, 'operations', ['run', 'legacy'], intent);
  await correlation(root, 'points', ['run', receipt.point], { ...context, point: receipt.point });
  return { input, packet, context, ref: sessionPointReference('run', receipt.point!), path };
}

test('S03/S06: legacy retry preserves /1 bytes; new task migrates representation once without synthetic inherited messages', async () => {
  let calls = 0; const first = await open(() => { calls++; return [{ kind: 'submit', input: {} }]; }); const old = await legacy(first.root, first.adapter); const original = await readFile(old.path, 'utf8');
  await first.adapter.close(); const next = await open(() => { calls++; return [{ kind: 'submit', input: {} }]; }, first.root);
  await turn(next.adapter, { ...old.input, restore: true, loaded: { ...old.input.loaded, procedure: 'New files must not affect old retry', submissionSchema: 'invalid' } });
  expect(calls).toBe(1); expect(await readFile(old.path, 'utf8')).toBe(original); expect(await next.adapter.packet('run', 'legacy')).toEqual(old.packet);
  await turn(next.adapter, old.input); expect(calls).toBe(1);
  await expect(next.adapter.start({ ...old.input, brief: { ...old.input.brief, objective: 'Perform' } })).rejects.toThrow('Conflicting harness session correlation');
  const migrated = await turn(next.adapter, request('migrate', old.ref)); const current = (await next.adapter.packet('run', 'migrate'))!;
  expect(current.manifest.schema).toBe('ramify-agent.delivered-inputs/2');
  expect(current.manifest.entries.filter(entry => entry.delivery === 'inherited').map(entry => entry.hash)).toEqual(old.packet.manifest.entries.map(entry => entry.hash));
  expect(current.manifest.entries.filter(entry => entry.delivery === 'inherited' && entry.kind === 'environment')).toHaveLength(1);
  expect(current.additions.filter(item => item.kind === 'environment')).toHaveLength(9);
  expect(current.additions.filter(item => item.kind === 'brief').map(item => item.key)).toEqual(['brief:goal', 'brief:requirements', 'brief:support:evidence']);
  expect(current.additions.filter(item => item.kind === 'role-instructions' || item.kind === 'tool-declaration')).toEqual([]);
  await turn(next.adapter, request('after-migration', migrated.ref)); expect((await next.adapter.packet('run', 'after-migration'))!.additions.map(item => item.key)).toEqual(['briefing-state', 'task']);
});

test('S05/S06: hand-authored old named append replays its unframed original after restart', async () => {
  const first = await open(); const old = await legacy(first.root, first.adapter); const point = readSessionPointReference(old.ref)!.point;
  const receipt = await first.adapter.operations.appendContext({ runId: 'run', operationId: `append:${point.sessionId}:old-name`, sessionId: point.sessionId, expectedPoint: point,
    additions: [{ key: 'old-name', kind: 'brief', text: 'OLD APPEND', revision: null }] }); expect(receipt.status).toBe('completed');
  const section = { key: 'support:legacy-only', text: 'OLD APPEND' }; const sections = [...old.context.history[0]!.sections, section];
  await correlation(first.root, 'points', ['run', receipt.point], { point: receipt.point, inherited: [...old.context.inherited, { key: 'append:old-name', kind: 'brief', text: 'OLD APPEND', source: null, revision: null }], history: [...old.context.history, { revision: 'legacy-append-revision', sections }], revision: 'legacy-append-revision' });
  await first.adapter.close(); const next = await open(undefined, first.root);
  expect(await next.adapter.append(old.ref, 'old-name', 'OLD APPEND', 'support:legacy-only')).toEqual({ outcome: 'already-present', ref: sessionPointReference('run', receipt.point!) });
  const engine = await next.adapter.operations.inspect('run', point.sessionId); expect(engine!.additions.at(-1)!.text).toBe('OLD APPEND');
  const current = request('after-old-append', sessionPointReference('run', receipt.point!));
  const migrated = await turn(next.adapter, { ...current, brief: { ...current.brief, sections: [...current.brief.sections, section] } });
  expect((await next.adapter.packet('run', 'after-old-append'))!.additions.find(item => item.key === 'brief:support:legacy-only')!.text).toBe(set('brief:support:legacy-only', 'OLD APPEND'));
  const unchanged = request('after-old-migration', migrated.ref);
  await turn(next.adapter, { ...unchanged, brief: { ...unchanged.brief, sections: [...unchanged.brief.sections, section] } });
  expect((await next.adapter.packet('run', 'after-old-migration'))!.additions.map(item => item.key)).toEqual(['briefing-state', 'task']);
});
