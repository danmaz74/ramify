import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { Role } from '../interfaces/protocol/runs.js';
import { defaultSkillDirectory, loadPromptPackages, renderNonfunctionalCoordinatorPrompt, renderNonfunctionalRepairPrompt, type LoadedPackage } from '../prompts/packages.js';
import { buildTaskPacket, renderRequiredSlots, stableRoleInstructions, type TaskKind, type TaskEnvironment } from '../prompts/tasks.js';
import { briefingAdditionKey, buildBriefingDelivery, taskBriefingRevision, type BriefingRevision } from '../prompts/briefings.js';
import { buildDeliveredManifest, exactInputHash } from '../prompts/delivered-manifest.js';
import { workOrientationMessage } from '../context-selection/prompts.js';
import { repairPrompt } from '../nonfunctional/prompts.js';
import { qualificationActionSchema } from '../capability/submission.js';

// Independently named expectations. No renderer/schema selection generates this table.
const expected: readonly [Role, TaskKind, string, boolean][] = [
  ['initial-architect', 'initial-analysis', 'submit_initial_analysis', true],
  ['catalog-extractor', 'intake', 'submit_intake', true],
  ['catalog-extractor', 'principles', 'submit_principle_elements', true],
  ['catalog-extractor', 'check', 'submit_catalog_check', true],
  ['global-fork', 'placement', 'submit_placement_decision', true],
  ['local-architect', 'orientation', 'submit_work_orientation', true],
  ['local-architect', 'assignment', 'submit_work_item_result', true],
  ['local-architect', 'completion', 'submit_work_item_result', true],
  ['local-architect', 'repair', 'submit_work_item_result', true],
  ['local-architect', 'qualification', 'submit_work_item_result', true],
  ['local-architect', 'reconciliation', 'submit_reconciliation', true],
  ['context-selector', 'selection', 'submit_context_selection', true],
  ['context-selector', 'reselection', 'submit_context_selection', true],
  ['capability-architect', 'capability', 'submit_capability_action', true],
  ['capability-architect', 'reconciliation', 'submit_reconciliation', true],
  ['engineer', 'engineering', 'submit_iteration_result', true],
  ['engineer', 'repair', 'submit_iteration_result', true],
  ['engineer', 'qualification', 'submit_iteration_result', true],
  ['engineer', 'standalone-command', 'submit_iteration_result', true],
  ['engineer', 'engineering', 'submit_iteration_result', false],
  ['contract-engineer', 'contract', 'submit_contract_result', false],
  ['local-architect', 'orientation', 'submit_work_orientation', false],
  ['local-architect', 'assignment', 'submit_work_item_result', false],
  ['local-architect', 'completion', 'submit_work_item_result', false],
  ['local-architect', 'repair', 'submit_work_item_result', false],
  ['local-architect', 'qualification', 'submit_work_item_result', false],
  ['local-architect', 'reconciliation', 'submit_reconciliation', false],
  ['reviewer', 'code', 'submit_review', true],
  ['reviewer', 'scope', 'submit_review', true],
  ['reviewer', 'design', 'submit_review', true],
  ['reviewer', 'design-orientation', 'submit_orientation', true],
  ['failure-analyst', 'failure-analysis', 'submit_failure_analysis', true],
  ['nonfunctional-coordinator', 'assessment', 'submit_nonfunctional_assessment', true],
  ['nonfunctional-coordinator', 'action', 'submit_nonfunctional_action', true],
  ['nonfunctional-coordinator', 'investigation', 'submit_nonfunctional_investigation', true],
  ['nonfunctional-repair-engineer', 'repair', 'submit_nonfunctional_repair', true],
];
let current: ReadonlyMap<Role, LoadedPackage>;
let ordinary: ReadonlyMap<Role, LoadedPackage>;
beforeAll(async () => {
  current = (await loadPromptPackages()).packages;
  ordinary = (await loadPromptPackages({ capabilityWorkflow: false })).packages;
});

const r1: BriefingRevision = { revision: 'r1', sections: [
  { key: 'goal', text: 'G1', source: 'plan.md' }, { key: 'requirement', text: 'R1', source: 'plan.md' }, { key: 'catalog', text: 'K1', source: 'catalog.json' },
] };
const r2: BriefingRevision = { revision: 'r2', sections: [r1.sections[0]!, { key: 'requirement', text: 'R2', source: 'plan.md' }, r1.sections[2]!] };
const taskR1 = taskBriefingRevision({ revision: 'r1', goal: 'Deliver the status label', requirements: ['Expose the current status'], sections: [{ key: 'catalog', text: 'K1' }] });
const taskR2 = taskBriefingRevision({ revision: 'r2', goal: 'Deliver the status label', requirements: ['Expose the changed status'], sections: [{ key: 'catalog', text: 'K1' }] });
function environment(phase: 'A' | 'B' = 'A'): TaskEnvironment {
  return { projectRoot: '/project', workingDirectory: `/project/${phase}`, candidate: phase === 'A' ? 'C0' : 'C1', snapshot: phase === 'A' ? 'S0' : 'S1',
    limits: { commandTimeoutMs: phase === 'A' ? 10 : 20 }, availableTools: ['read', 'grep', 'ls', 'snapshot_read', 'snapshot_diff', ...new Set(expected.map(item => item[2]))],
    views: [{ path: 'subs/status/src/.ramify', revision: 'api-r1', modules: ['status'], coverage: ['unknown shapes: 1'] }],
    supportPaths: ['support/world.mjs', 'support/steps.mjs'], cucumberConfiguration: 'cucumber.mjs' };
}
function input(loaded: LoadedPackage, kind: TaskKind) {
  return { loaded, kind, objective: 'Implement the current assigned task', goal: 'Deliver the status label', requirements: ['Expose the current status'], environment: environment(),
    briefing: buildBriefingDelivery({ mode: 'fresh', current: taskR1, inheritedRevision: null, history: [] }), inheritedPoint: null, inherited: [], supplyRoleInstructions: true } as const;
}

describe('specialized continuing capability task bindings', () => {
  const pairs = [
    ['local-architect', 'capability-qualification', 'submit_capability_qualification'],
    ['capability-architect', 'capability-qualification', 'submit_capability_qualification'],
    ['engineer', 'consultation', 'answer_capability_consultation'],
  ] as const;
  // This schema is owned by the consultation caller, just as its runtime validator is.
  const consultationSchema = z.object({ answer: z.string().min(1), objections: z.array(z.string()) }).strict();
  const actualConsultationSchema = JSON.stringify(z.toJSONSchema(consultationSchema));
  function specialized(role: typeof pairs[number][0], kind: typeof pairs[number][1]) {
    return { ...input(current.get(role)!, kind),
      environment: { ...environment(), availableTools: ['read', 'grep', 'ls', 'submit_capability_qualification', 'answer_capability_consultation'] },
      ...(kind === 'consultation' ? { consultationSubmissionSchema: actualConsultationSchema } : {}) };
  }
  test.each(pairs)('%s/%s binds actual %s schema once and preserves role/deltas', (role, kind, tool) => {
    const base = specialized(role, kind); const first = buildTaskPacket(base);
    const next = buildTaskPacket({ ...base, supplyRoleInstructions: false, inheritedPoint: 'P:T1', inherited: first.additions,
      requirements: ['Expose the changed status'], briefing: buildBriefingDelivery({ mode: 'continue', current: taskR2, inheritedRevision: 'r1', history: [taskR1] }) });
    expect(first.submissionTool).toBe(tool); expect(next.submissionTool).toBe(tool);
    expect(first.roleInstructions).toBe(stableRoleInstructions(base.loaded)); expect(next.roleInstructions).toBe(first.roleInstructions);
    expect(next.additions.filter(item => item.kind === 'role-instructions' || item.kind === 'tool-declaration')).toEqual([]);
    expect(next.message).toContain('Expose the changed status'); expect(next.message).not.toContain('Expose the current status'); expect(next.message).not.toContain('Deliver the status label');
    const schema = first.declaration.description.slice(first.declaration.description.indexOf('{'));
    expect(JSON.parse(schema)).toEqual(z.toJSONSchema(kind === 'consultation' ? consultationSchema : qualificationActionSchema));
    const delivered = [...first.additions, ...next.additions].map(item => item.kind === 'tool-declaration' ? JSON.parse(item.text).description : item.text).join('\n'); expect(delivered.split(schema)).toHaveLength(2);
    expect(first.declaration.inputSchema).toEqual({ type: 'object' }); expect(first.message).not.toContain(schema); expect(first.roleInstructions).not.toContain(schema);
    const procedure = first.additions.find(item => item.kind === 'procedure')!.text;
    expect(procedure).toContain('read-only'); expect(procedure).toContain('supplied'); expect(procedure).toContain(tool);
    expect(procedure).not.toMatch(/shell|report\.md|submit_iteration_result|submit_work_item_result/);
    if (kind === 'consultation') {
      expect(JSON.parse(schema)).toMatchObject({ type: 'object', additionalProperties: false, required: ['answer', 'objections'], properties: { answer: { type: 'string', minLength: 1 }, objections: { type: 'array', items: { type: 'string' } } } });
    } else {
      expect(JSON.parse(schema).oneOf.map((variant: { properties: { kind: { const: string } } }) => variant.properties.kind.const)).toEqual(['satisfy-with-existing', 'delegate-capability', 'request-placement', 'unresolved']);
    }
    const conflicting = first.additions.map(item => item.kind === 'tool-declaration' ? { ...item, text: JSON.stringify({ ...first.declaration, description: 'changed declaration' }) } : item);
    expect(() => buildTaskPacket({ ...base, inheritedPoint: 'P:T1', inherited: conflicting, supplyRoleInstructions: false,
      briefing: buildBriefingDelivery({ mode: 'continue', current: taskR1, inheritedRevision: 'r1', history: [] }) })).toThrow(`Immutable tool declaration changed for ${tool}`);
  });
  test.each(pairs)('%s/%s requires its actual available tool %s', (role, kind, tool) => {
    const base = specialized(role, kind);
    expect(() => buildTaskPacket({ ...base, environment: { ...base.environment, availableTools: environment().availableTools } })).toThrow(`Current submission tool ${tool} is unavailable`);
  });
  test('consultation has no fallback schema and an inherited declaration cannot change', () => {
    const base = specialized('engineer', 'consultation');
    expect(() => buildTaskPacket({ ...base, consultationSubmissionSchema: undefined })).toThrow('actual caller-owned submission schema');
    expect(() => buildTaskPacket({ ...base, consultationSubmissionSchema: '[]' })).toThrow('actual object submission schema');
    const first = buildTaskPacket(base);
    const inherited = { briefing: buildBriefingDelivery({ mode: 'continue', current: taskR1, inheritedRevision: 'r1', history: [] }), inheritedPoint: 'P:T1', inherited: first.additions, supplyRoleInstructions: false };
    const changed = JSON.stringify(z.toJSONSchema(consultationSchema.extend({ changed: z.boolean() })));
    expect(() => buildTaskPacket({ ...base, ...inherited, consultationSubmissionSchema: changed })).toThrow('Immutable tool declaration changed for answer_capability_consultation');
    expect(() => buildTaskPacket({ ...base, loaded: current.get('capability-architect')! })).toThrow('Unsupported role/task');
    expect(() => buildTaskPacket({ ...input(current.get('engineer')!, 'capability-qualification'), environment: base.environment })).toThrow('Unsupported role/task');
  });
  test('continuing engineering appends the consultation declaration once without replacing its stable head', () => {
    const base = specialized('engineer', 'consultation'); const first = buildTaskPacket(input(base.loaded, 'engineering'));
    const consultation = buildTaskPacket({ ...base, briefing: buildBriefingDelivery({ mode: 'continue', current: taskR1, inheritedRevision: 'r1', history: [] }),
      inheritedPoint: 'P:T1', inherited: first.additions, supplyRoleInstructions: false });
    expect(consultation.roleInstructions).toBe(first.roleInstructions);
    expect(consultation.additions.filter(item => item.kind === 'tool-declaration').map(item => item.key)).toEqual(['tool:answer_capability_consultation']);
    expect(consultation.additions.filter(item => item.kind === 'role-instructions' || item.kind === 'brief')).toEqual([]);
  });
});

describe('P01/P02/P05: stable role and complete current tasks', () => {
  test.each(expected)('%s/%s submits through %s (capability=%s)', (role, kind, tool, capability) => {
    const loaded = (capability ? current : ordinary).get(role)!;
    const first = buildTaskPacket(input(loaded, kind));
    const next = buildTaskPacket({ ...input(loaded, kind), environment: environment('B'), supplyRoleInstructions: false,
      inheritedPoint: 'session:P/turn:1', inherited: first.additions,
      requirements: ['Expose the changed status'],
      briefing: buildBriefingDelivery({ mode: 'continue', current: taskR2, inheritedRevision: 'r1', history: [taskR1] }) });
    expect(first.submissionTool).toBe(tool);
    expect(next.submissionTool).toBe(tool);
    expect(first.roleInstructions).toBe(next.roleInstructions);
    expect(first.roleInstructions).not.toContain('/project/A');
    expect(first.roleInstructions).not.toContain('C0');
    expect(first.roleInstructions).not.toMatch(/\{\{\w+\}\}|(?<!\{)\{(?:procedure|submissionTool)\}(?!\})/);
    expect(first.message).toContain('Deliver the status label');
    expect(first.message).toContain('Expose the current status');
    expect(first.message).toContain('Current procedure');
    expect(first.message).toContain(tool);
    expect(first.message).toContain('"workingDirectory": "/project/A"');
    expect(next.message).toContain('"workingDirectory": "/project/B"');
    expect(next.message).toContain('"candidate": "C1"');
    expect(next.message).toContain('"snapshot": "S1"');
    expect(next.message).toContain('"commandTimeoutMs": 20');
    expect(next.message).toContain('support/steps.mjs');
    expect(next.message).toContain('cucumber.mjs');
    expect(next.message).toContain('unknown shapes: 1');
    expect(next.additions.filter(item => item.kind === 'role-instructions')).toEqual([]);
    expect(next.additions.filter(item => item.kind === 'tool-declaration')).toEqual([]);
    // Count the full schema in all model-visible input, including the declaration.
    const schema = first.declaration.description.slice(first.declaration.description.indexOf('{'));
    expect(JSON.parse(schema)).toHaveProperty('$schema');
    const delivered = [...first.additions, ...next.additions].map(item => item.kind === 'tool-declaration'
      ? `${JSON.parse(item.text).description}\n${JSON.stringify(JSON.parse(item.text).inputSchema)}` : item.text).join('\n');
    expect(delivered.split(schema)).toHaveLength(2);
    expect(first.roleInstructions).not.toContain(schema);
    expect(first.message).not.toContain(schema);
    expect(first.declaration.inputSchema).toEqual({ type: 'object' });
  });

  test('missing goal, requirements, environment, tool, procedure slots and unsupported pairs fail explicitly', () => {
    const base = input(current.get('local-architect')!, 'orientation');
    expect(() => buildTaskPacket({ ...base, goal: '' })).toThrow('goal');
    expect(() => buildTaskPacket({ ...base, requirements: [] })).toThrow('requirement');
    expect(() => buildTaskPacket({ ...base, environment: { ...environment(), availableTools: [] } })).toThrow('submit_work_orientation');
    expect(() => buildTaskPacket({ ...base, kind: 'contract' })).toThrow('Unsupported role/task');
    expect(() => buildTaskPacket({ ...base, environment: { ...environment(), snapshot: undefined } as unknown as TaskEnvironment })).toThrow('snapshot');
    expect(() => renderRequiredSlots('{{procedure}}', {}, ['procedure'])).toThrow('procedure');
    expect(() => renderRequiredSlots('{{submissionTool}}', {}, ['submissionTool'])).toThrow('submissionTool');
    expect(() => renderRequiredSlots('{procedure}', { procedure: 'work' }, [])).toThrow('Malformed');
    expect(() => renderRequiredSlots('{submissionTool}', { submissionTool: 'submit' }, [])).toThrow('Malformed');
    expect(renderRequiredSlots('JSON: {"value": 1}. Code: function f() { return 1; }', {}, [])).toContain('{"value": 1}');
    // Slot substitution is a single pass: user data with braces is not reparsed as a template.
    expect(renderRequiredSlots('{{procedure}}', { procedure: 'const object = { value: 1 }; {{quoted}}' }, ['procedure'])).toContain('{{quoted}}');
  });

  test('local phases share initial role bytes and append newly specialized declarations once', () => {
    const loaded = current.get('local-architect')!;
    const orientation = buildTaskPacket(input(loaded, 'orientation'));
    const briefing = buildBriefingDelivery({ mode: 'continue', current: taskR1, inheritedRevision: 'r1', history: [] });
    const assignment = buildTaskPacket({ ...input(loaded, 'assignment'), briefing, inheritedPoint: 'P:T1', inherited: orientation.additions, supplyRoleInstructions: false });
    expect(assignment.roleInstructions).toBe(orientation.roleInstructions);
    expect(assignment.additions.filter(item => item.kind === 'tool-declaration').map(item => item.key)).toEqual(['tool:submit_work_item_result']);
    expect(assignment.manifest.entries.filter(item => item.kind === 'tool-declaration')).toHaveLength(2);
    expect(() => buildTaskPacket({ ...input(loaded, 'orientation'), briefing, inheritedPoint: 'P:T1', inherited: orientation.additions,
      loaded: { ...loaded, workOrientation: { ...loaded.workOrientation!, submissionSchema: '{"type":"object","additionalProperties":false}' } }, supplyRoleInstructions: false })).toThrow('Immutable tool declaration changed');
  });

  test('legacy NFR renderers resolve procedures and tool names without duplicating schema', () => {
    const coordinator = renderNonfunctionalCoordinatorPrompt(current.get('nonfunctional-coordinator')!, '/project');
    const repair = renderNonfunctionalRepairPrompt(current.get('nonfunctional-repair-engineer')!, '/project');
    expect(coordinator).toContain('submit_nonfunctional_assessment');
    expect(coordinator).toContain('Inspect the prepared tree');
    expect(repair).toContain('submit_nonfunctional_repair');
    expect(repair).toContain('Read the recorded task');
    expect(`${coordinator}\n${repair}`).not.toMatch(/\{\{?submissionTool\}\}?|\{\{?procedure\}\}?/);
    expect(coordinator).not.toContain(current.get('nonfunctional-coordinator')!.submissionSchema.trim());
  });
  test('unchanged canonical goal/requirements are inherited, changed requirements alone are appended', () => {
    const loaded = current.get('local-architect')!;
    const fresh = buildTaskPacket(input(loaded, 'orientation'));
    expect(fresh.message.split('Deliver the status label')).toHaveLength(2);
    expect(fresh.message.split('Expose the current status')).toHaveLength(2);
    const inherited = { inheritedPoint: 'P:T1', inherited: fresh.additions, supplyRoleInstructions: false };
    const same = buildTaskPacket({ ...input(loaded, 'assignment'), ...inherited,
      briefing: buildBriefingDelivery({ mode: 'continue', current: taskR1, inheritedRevision: 'r1', history: [] }) });
    expect(same.message).not.toContain('Deliver the status label');
    expect(same.message).not.toContain('Expose the current status');
    expect(same.additions.filter(item => item.kind === 'brief')).toEqual([]);
    const changed = buildTaskPacket({ ...input(loaded, 'assignment'), ...inherited, requirements: ['Expose the changed status'],
      briefing: buildBriefingDelivery({ mode: 'continue', current: taskR2, inheritedRevision: 'r1', history: [taskR1] }) });
    expect(changed.message).toContain('Expose the changed status');
    expect(changed.message).not.toContain('Expose the current status');
    expect(changed.message).not.toContain('Deliver the status label');
    expect(changed.additions.filter(item => item.kind === 'brief').map(item => item.key)).toEqual(['brief:requirements']);
    expect(() => buildTaskPacket({ ...input(loaded, 'assignment'), ...inherited })).toThrow('Full fresh briefing');
  });
});

describe('P03: briefing revision and exact fork updates', () => {
  test('fresh G1/R1/K1, continued R2 only, and replay nothing', () => {
    const fresh = buildBriefingDelivery({ mode: 'fresh', current: r1, inheritedRevision: null, history: [] });
    const delta = buildBriefingDelivery({ mode: 'continue', current: r2, inheritedRevision: 'r1', history: [r1] });
    const replay = buildBriefingDelivery({ mode: 'continue', current: r2, inheritedRevision: 'r2', history: [r1, r2] });
    expect(fresh).toMatchObject({ mode: 'full', basedOnRevision: null, additions: [{ text: 'G1' }, { text: 'R1' }, { text: 'K1' }] });
    expect(delta).toMatchObject({ mode: 'delta', basedOnRevision: 'r1', revision: 'r2', additions: [{ text: 'R2' }] });
    if (delta.kind !== 'available') throw new Error('Expected available delta');
    expect(delta.additions).toHaveLength(1);
    expect(briefingAdditionKey(delta.additions[0]!)).toBe(`brief:requirement:r2:${exactInputHash('R2')}`);
    expect(replay).toMatchObject({ additions: [] });
  });
  test('a pre-r1 fork receives r1 then r2 updates, while an r1 fork gets only R2', () => {
    const pre = buildBriefingDelivery({ mode: 'fork', current: r2, inheritedRevision: null, history: [r1] });
    const after = buildBriefingDelivery({ mode: 'fork', current: r2, inheritedRevision: 'r1', history: [r1] });
    if (pre.kind !== 'available' || after.kind !== 'available') throw new Error('Expected available fork inputs');
    expect(pre.additions.map(item => [item.text, item.revision])).toEqual([['G1', 'r1'], ['R1', 'r1'], ['K1', 'r1'], ['R2', 'r2']]);
    expect(after.additions.map(item => item.text)).toEqual(['R2']);
  });
  test('unknown/wrong revisions and missing continuation ancestry are unavailable, never false deltas', () => {
    expect(buildBriefingDelivery({ mode: 'continue', current: r2, inheritedRevision: 'wrong', history: [r1] }).kind).toBe('unavailable');
    expect(buildBriefingDelivery({ mode: 'continue', current: r2, inheritedRevision: null, history: [r1] }).kind).toBe('unavailable');
    expect(buildBriefingDelivery({ mode: 'fork', current: r1, inheritedRevision: 'r2', history: [r1, r2] }).kind).toBe('unavailable');
    expect(() => buildBriefingDelivery({ mode: 'continue', current: { ...r1, sections: [{ key: 'goal', text: 'changed' }] }, inheritedRevision: 'r1', history: [r1] })).toThrow('Conflicting briefing revision');
  });
});

describe('P04: manifests reflect supplied/inherited instructions and truthful read-only evidence', () => {
  test('adding/changing an unused on-disk skill file leaves actual package and delivery identities unchanged', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'plan23-prompt-skills-'));
    try {
      await writeFile(join(directory, 'SKILL.md'), await readFile(join(defaultSkillDirectory, 'SKILL.md'), 'utf8'));
      const before = (await loadPromptPackages({ skillDirectory: directory })).packages.get('initial-architect')!;
      await writeFile(join(directory, 'unused.md'), 'Undelivered instructions A');
      const added = (await loadPromptPackages({ skillDirectory: directory })).packages.get('initial-architect')!;
      await writeFile(join(directory, 'unused.md'), 'Undelivered instructions B with changed bytes');
      const changed = (await loadPromptPackages({ skillDirectory: directory })).packages.get('initial-architect')!;
      expect(added.hash).toBe(before.hash);
      expect(changed.hash).toBe(before.hash);
      const packet = buildTaskPacket(input(changed, 'initial-analysis'));
      expect(packet.manifest).toEqual(buildTaskPacket(input(before, 'initial-analysis')).manifest);
      expect(packet.manifest.entries.flatMap(entry => entry.sources.map(source => source.path))).toEqual(expect.arrayContaining([...changed.embeddedSkillPaths!]));
      expect(packet.manifest.entries.flatMap(entry => entry.sources.map(source => source.path)).some(path => path.endsWith('unused.md'))).toBe(false);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  test('unused skills change no delivered identity; embedded skill sources alone are included', () => {
    const engineer = current.get('engineer')!;
    const before = buildTaskPacket(input(engineer, 'engineering'));
    const unused: LoadedPackage = { ...engineer, hash: 'another-package-inventory-hash', files: [...engineer.files,
      { path: 'skills/unused/SKILL.md', hash: 'arbitrary', bytes: 500, kind: 'skill' }] };
    const after = buildTaskPacket(input(unused, 'engineering'));
    expect(after.manifest).toEqual(before.manifest);
    expect(after.manifest.entries.flatMap(item => item.sources.map(source => source.path))).not.toContain('skills/unused/SKILL.md');
    const architect = buildTaskPacket(input(current.get('initial-architect')!, 'initial-analysis'));
    expect(architect.manifest.entries.flatMap(item => item.sources.map(source => source.path))).toContain('skills/module-architect/SKILL.md');
    expect(architect.roleInstructions).not.toContain('Run `ramify materialize');
    expect(architect.roleInstructions).not.toContain('Before answering, read [report.md]');
    expect(architect.roleInstructions).toContain('designated submission tool');
    expect(architect.roleInstructions).toContain('placement references only for a real');
    expect(architect.message).toContain('"modules": [');
    expect(architect.message).toContain('unknown shapes: 1');
  });
  test('inherited and appended bytes have distinct exact identities at the supplied point', () => {
    const parent = { key: 'brief:a', kind: 'brief' as const, text: 'A\n', source: 'plan.md', revision: 'r1' };
    const manifest = buildDeliveredManifest({ inheritedPoint: 'P:T1', inherited: [parent], appended: [{ ...parent, key: 'brief:b', text: 'B' }] });
    expect(manifest.entries.map(item => [item.delivery, item.bytes, item.hash])).toEqual([['inherited', 2, exactInputHash('A\n')], ['appended', 1, exactInputHash('B')]]);
    expect(() => buildDeliveredManifest({ inheritedPoint: null, inherited: [parent], appended: [] })).toThrow('exact session point');
  });
  test('orientation gets stated goal/requirements and a single explicit submission', () => {
    const message = workOrientationMessage('Captured references', { goal: 'Deliver the status label', requirements: ['Expose the current status'] });
    expect(message).toContain('Deliver the status label');
    expect(message).toContain('Expose the current status');
    expect(message).toContain('Submit your orientation using `submit_work_orientation`');
  });
  test('P05: catalog, policy and import instructions match the actual authority and empty content is omitted', () => {
    expect(current.get('initial-architect')!.procedure).toContain('Record no hypothesis that restates an entry');
    expect(current.get('initial-architect')!.procedure).toContain('do\nnot classify them again');
    expect(current.get('local-architect')!.procedure).toContain('The entry is already registered; record a local decision only for a capability\nnot in the registry');
    for (const loaded of [current.get('engineer')!, ordinary.get('engineer')!]) {
      expect(stableRoleInstructions(loaded)).toContain('Commands may be refused by policy before execution');
      expect(stableRoleInstructions(loaded)).toContain('those refusals make no\nchange and trigger no mutation check');
      expect(stableRoleInstructions(loaded)).toContain('After an executed mutation');
    }
    expect(ordinary.get('local-architect')!.procedure).toContain('is imported only when the evidence records that import');
    expect(ordinary.get('local-architect')!.procedure).toContain('provenance is unavailable');
    expect(current.get('catalog-extractor')!.extraction!.check.procedure).toContain('requirementRefs names functional');
    expect(current.get('catalog-extractor')!.extraction!.check.procedure).toContain('Never copy Gherkin');
    expect(current.get('catalog-extractor')!.extraction!.check.procedure).toContain('without adding any');
    const repair = repairPrompt('Fix status', { tree: 'a'.repeat(40), head: 'head', preparedAt: '2026-10-08T00:00:00Z' },
      'Requirement text', 'status', { evidence: [], uncertainty: '' });
    expect(repair).not.toContain('Coordinator uncertainty:');
    expect(repair).not.toContain('Coordinator evidence for this repair:');
    expect(repair).toContain('submit_nonfunctional_repair');
  });
  test('canonical changed paths are patch-first; inherited guidance requires current snapshot grounds', () => {
    const loaded = current.get('reviewer')!;
    const packet = buildTaskPacket({ ...input(loaded, 'design'), changedPaths: [{ path: 'src/status.ts' }, { path: 'features/status.feature', annotation: 'recorded harness pending-tag removal' }] });
    expect(packet.message.match(/- src\/status.ts/g)).toHaveLength(1);
    expect(packet.message).toContain('recorded harness pending-tag removal');
    expect(packet.message).toContain('Reuse earlier understanding');
    expect(packet.message).toContain('Refresh guidance whose identity changed');
    expect(packet.message).toContain('current `snapshot_read` evidence');
    expect(packet.message).toContain('read each patch');
    expect(packet.roleInstructions).not.toContain('This session may begin with an earlier conversation');
    expect(stableRoleInstructions(loaded)).toBe(buildTaskPacket(input(loaded, 'design-orientation')).roleInstructions);
    expect(() => buildTaskPacket({ ...input(loaded, 'code'), environment: { ...environment(), snapshot: null } })).toThrow('snapshot');
    expect(() => buildTaskPacket({ ...input(loaded, 'code'), changedPaths: [{ path: 'a' }, { path: 'a' }] })).toThrow('unique');
  });
});
