import { beforeAll, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { loadPromptPackages, type LoadedPackage } from '../prompts/packages.js';
import { assertTaskProcedureSelection, buildTaskPacket, type TaskEnvironment, type TaskKind } from '../prompts/tasks.js';
import { buildBriefingDelivery, taskBriefingRevision } from '../prompts/briefings.js';
import { effectiveBlocks } from '../prompts/blocks.js';
import type { Role } from '../interfaces/protocol/runs.js';
import type { DeliveredInput } from '../prompts/delivered-manifest.js';

let packages: ReadonlyMap<Role, LoadedPackage>;
let ordinary: ReadonlyMap<Role, LoadedPackage>;
beforeAll(async () => { packages = (await loadPromptPackages()).packages; ordinary = (await loadPromptPackages({ capabilityWorkflow: false })).packages; });
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const set = (key: string, body: string) => `# Block ${key}\nCurrent value; replaces any earlier value for this key.\n${body}`;
const env: TaskEnvironment = { projectRoot: '/project', workingDirectory: '/project/owner', candidate: 'C1', snapshot: 'S1', limits: { z: { z: 2, a: 1 }, a: 0 }, availableTools: ['submit_work_item_result', 'submit_work_orientation', 'submit_reconciliation', 'submit_capability_qualification'], views: [], supportPaths: ['b', 'a'], cucumberConfiguration: null };
const brief = taskBriefingRevision({ revision: 'r1', goal: 'G', requirements: ['R'], sections: [] });
function packet(kind: TaskKind = 'assignment', inherited: readonly DeliveredInput[] = [], environment = env, loaded = packages.get('local-architect')!) {
  return buildTaskPacket({ loaded, kind, objective: `Current ${kind}`, goal: 'G', requirements: ['R'], environment,
    inherited, inheritedPoint: inherited.length ? 'selected-point' : null, supplyRoleInstructions: inherited.length === 0,
    briefing: buildBriefingDelivery({ mode: inherited.length ? 'continue' : 'fresh', current: brief, inheritedRevision: inherited.length ? 'r1' : null, history: [brief] }) });
}

test('P01/P02/P09: exact first framing, physical hashes and unchanged assignment/completion', () => {
  const first = packet();
  expect(first.manifest.schema).toBe('ramify-agent.delivered-inputs/2');
  const procedure = first.additions.find(item => item.kind === 'procedure')!;
  expect(procedure.key).toBe('procedure:local-architect:main');
  expect(procedure.text.startsWith('# Block procedure:local-architect:main\nCurrent value; replaces any earlier value for this key.\n# Current procedure\n')).toBe(true);
  expect(first.message).toContain(`Selected procedure: procedure:local-architect:main; SHA-256: ${hash(procedure.text)}`);
  expect(first.manifest.entries.find(entry => entry.key === procedure.key)).toMatchObject({ hash: hash(procedure.text), bytes: Buffer.byteLength(procedure.text), block: { key: procedure.key, effect: 'set' } });
  expect(first.additions.filter(item => item.kind === 'environment').map(item => item.key)).toEqual(['environment:projectRoot', 'environment:workingDirectory', 'environment:candidate', 'environment:snapshot', 'environment:limits', 'environment:availableTools', 'environment:views', 'environment:supportPaths', 'environment:cucumberConfiguration']);
  const next = packet('completion', first.additions);
  expect(next.additions.map(item => item.key)).toEqual(['briefing-state', 'task']);
  expect(next.message).toContain('# Current task: completion');
  expect(next.message).toContain('supersedes every prior task selection');
  expect(next.message).toContain('Active role: local-architect');
  expect(next.message).toContain('Submit only through `submit_work_item_result`');
});

test('P03/P04: deterministic object order, preserved arrays, whole replacements and explicit clears', () => {
  const first = packet();
  expect(first.additions.find(item => item.key === 'environment:limits')!.text).toBe(set('environment:limits', '{\n  "limits": {\n    "a": 0,\n    "z": {\n      "a": 1,\n      "z": 2\n    }\n  }\n}'));
  expect(packet('completion', first.additions, { ...env, limits: { a: 0, z: { a: 1, z: 2 } } }).additions.filter(item => item.kind === 'environment')).toEqual([]);
  const changed = packet('completion', first.additions, { ...env, candidate: null, limits: {}, supportPaths: [] });
  expect(changed.additions.filter(item => item.kind === 'environment').map(item => item.key)).toEqual(['environment:candidate', 'environment:limits', 'environment:supportPaths']);
  expect(changed.additions.find(item => item.key === 'environment:candidate')!.text).toBe(set('environment:candidate', '{\n  "candidate": null\n}'));
  expect(effectiveBlocks([...first.additions, ...changed.additions]).get('environment:limits')!.text).toBe(set('environment:limits', '{\n  "limits": {}\n}'));
  expect(packet('completion', first.additions, { ...env, supportPaths: ['a', 'b'] }).additions.filter(item => item.kind === 'environment').map(item => item.key)).toEqual(['environment:supportPaths']);
});

test('P05: orientation, main, reconciliation and main retain independently available families', () => {
  const history: DeliveredInput[] = [];
  for (const [kind, family, count] of [['orientation', 'orientation', 1], ['assignment', 'main', 1], ['reconciliation', 'reconciliation', 1], ['completion', 'main', 0]] as const) {
    const current = packet(kind, history);
    expect(current.message).toContain(`Selected procedure: procedure:local-architect:${family}; SHA-256:`);
    expect(current.additions.filter(item => item.kind === 'procedure')).toHaveLength(count);
    history.push(...current.additions);
  }
});

test('P06/P09: same-family A/B/A replacement, no repeated set, selected-body validation and pinned conflicts', () => {
  const original = packages.get('local-architect')!;
  const changed = { ...original, procedure: 'Replacement policy. Submit through {{submissionTool}}.' };
  const a = packet(); const b = packet('assignment', a.additions, env, changed);
  const history = [...a.additions, ...b.additions]; const restored = packet('completion', history);
  expect(restored.additions.find(item => item.kind === 'procedure')!.text).toBe(a.additions.find(item => item.kind === 'procedure')!.text);
  expect(packet('completion', [...history, ...restored.additions]).additions.filter(item => item.kind === 'procedure')).toEqual([]);
  const key = 'procedure:local-architect:main'; const selected = effectiveBlocks(history).get(key)!;
  expect(() => assertTaskProcedureSelection(history, key, hash(selected.text))).not.toThrow();
  expect(() => assertTaskProcedureSelection(history, key, hash('wrong'))).toThrow('Selected procedure');
  expect(() => assertTaskProcedureSelection([], key, hash(selected.text))).toThrow('Selected procedure');
  expect(() => packet('completion', a.additions, env, { ...original, system: `${original.system}\nChanged pinned role` })).toThrow('Pinned role instructions changed');
});

// Independent intentional family expectations, including every inline procedure.
const families: readonly [Role, TaskKind, string, string][] = [
  ['initial-architect', 'initial-analysis', 'main', 'submit_initial_analysis'],
  ['catalog-extractor', 'intake', 'intake', 'submit_intake'], ['catalog-extractor', 'principles', 'principles', 'submit_principle_elements'], ['catalog-extractor', 'check', 'check', 'submit_catalog_check'],
  ['global-fork', 'placement', 'main', 'submit_placement_decision'],
  ['local-architect', 'orientation', 'orientation', 'submit_work_orientation'], ['local-architect', 'assignment', 'main', 'submit_work_item_result'], ['local-architect', 'completion', 'main', 'submit_work_item_result'], ['local-architect', 'repair', 'main', 'submit_work_item_result'], ['local-architect', 'reconciliation', 'reconciliation', 'submit_reconciliation'], ['local-architect', 'capability-qualification', 'qualification', 'submit_capability_qualification'],
  ['context-selector', 'selection', 'main', 'submit_context_selection'], ['context-selector', 'reselection', 'main', 'submit_context_selection'],
  ['engineer', 'engineering', 'main', 'submit_iteration_result'], ['engineer', 'repair', 'main', 'submit_iteration_result'], ['engineer', 'standalone-command', 'main', 'submit_iteration_result'], ['engineer', 'consultation', 'consultation', 'answer_capability_consultation'],
  ['capability-architect', 'capability', 'main', 'submit_capability_action'], ['capability-architect', 'reconciliation', 'reconciliation', 'submit_reconciliation'], ['capability-architect', 'capability-qualification', 'qualification', 'submit_capability_qualification'],
  ['contract-engineer', 'contract', 'main', 'submit_contract_result'], ['reviewer', 'code', 'code', 'submit_review'], ['reviewer', 'scope', 'scope', 'submit_review'], ['reviewer', 'design', 'design', 'submit_review'], ['reviewer', 'design-orientation', 'orientation', 'submit_orientation'],
  ['failure-analyst', 'failure-analysis', 'main', 'submit_failure_analysis'], ['nonfunctional-coordinator', 'assessment', 'assessment', 'submit_nonfunctional_assessment'], ['nonfunctional-coordinator', 'action', 'action', 'submit_nonfunctional_action'], ['nonfunctional-coordinator', 'investigation', 'investigation', 'submit_nonfunctional_investigation'], ['nonfunctional-repair-engineer', 'repair', 'main', 'submit_nonfunctional_repair'],
];
test.each(families)('P07: %s/%s intentionally selects %s and %s', (role, kind, family, tool) => {
  const current = buildTaskPacket({ loaded: packages.get(role) ?? ordinary.get(role)!, kind, objective: 'Current work', goal: 'G', requirements: ['R'], environment: { ...env, availableTools: [tool] },
    consultationSubmissionSchema: '{"type":"object","properties":{"answer":{"type":"string"}}}', inherited: [], inheritedPoint: null, supplyRoleInstructions: true,
    briefing: buildBriefingDelivery({ mode: 'fresh', current: brief, inheritedRevision: null, history: [] }) });
  expect(current.submissionTool).toBe(tool);
  expect(current.additions.find(item => item.kind === 'procedure')!.key).toBe(`procedure:${role}:${family}`);
  expect(current.additions.filter(item => item.kind === 'tool-declaration')).toHaveLength(1);
});
