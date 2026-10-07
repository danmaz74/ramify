import { describe, expect, test } from 'vitest';
import { outline, readDeclaredTree } from './helpers/iterations.js';
import { copyFixture } from './helpers/fixture.js';
import { contractJsonSchema, contractSubmissionKinds, contractSubmissionSchema, validateContract } from '../contracts/submission.js';
import { fakeNamingViolations, isFakeFile } from '../contracts/naming.js';
import { registrationNeeded } from '../contracts/accept.js';
import { cycleClosedBy, cycleIdentity } from '../contracts/graph.js';
import { depthOf, nextWorkItem } from '../contracts/schedule.js';
import { validateEngineer } from '../work/engineer.js';
import { validateLocalArchitect } from '../work/submission.js';
import type { WorkItem } from '../work/records.js';

/*
 * The contract submission, the need that asks for one, the yield that waits
 * for a provider, and the three rules the harness applies over them: the
 * fake-naming rule the contract gate verifies, the registration key that
 * makes a repeat harmless, and the capability graph that decides what a
 * cycle is.
 *
 * Every submission here goes through the same judge, the same schema and the
 * same rules an agent's would.
 */

const reviews = 'collection-review/workspace/reviews';
const validation = 'collection-review/workspace/reviews/validation';
const validationDirectory = 'subs/workspace/subs/reviews/subs/validation';

/** The declared module tree of the fixture, which the rules are judged against. */
async function evidence(exists: (path: string) => Promise<boolean> = async () => true) {
  const fixture = await copyFixture();
  try {
    return { index: await readDeclaredTree(fixture.root), consumer: reviews, exists };
  } finally {
    await fixture.remove();
  }
}

function established(extra: Record<string, unknown> = {}) {
  return {
    kind: 'established',
    mode: 'fake-backed',
    authority: { kind: 'provider', owner: validation, rationale: 'The capability\'s public contract belongs with its implementation.' },
    provider: validation,
    behavior: 'A note of at most 500 characters is within the limit; a longer one is not.',
    artifacts: {
      interface: [{ path: 'subs/a/src/interfaces/note-limit.ts', exports: ['NoteLimit'] }],
      conformance: [{ path: 'subs/a/src/tests/note-limit.conformance.test.ts' }],
      fake: [{
        path: 'subs/a/src/fakes/note-limit.fake.ts',
        exports: ['createNoteLimitFake'],
        standsFor: [{ fake: 'createNoteLimitFake', path: `${validationDirectory}/src/note-limit.ts`, export: 'createNoteLimit', exposure: { to: ['parent'], reexposed: [] } }],
      }],
      exposure: [{ path: 'subs/a/module.ramify', declaration: 'expose-src NoteLimit from "interfaces/note-limit.ts" to parent' }],
    },
    fakeInjections: ['subs/workspace/subs/reviews/src/notes.ts'],
    summary: 'The agreement is established and the consumer runs against the fake.',
    ...extra,
  };
}

describe('the contract submission', () => {
  test('it is a union discriminated on kind, and has no field for an ID the harness knows', () => {
    const union = (contractJsonSchema as { anyOf?: unknown[]; oneOf?: unknown[] });
    expect(union.anyOf ?? union.oneOf).toHaveLength(2);
    const kinds = contractSubmissionSchema.options.map(option => option.shape.kind.value);
    expect(kinds).toEqual(['established', 'incomplete']);
    expect([...contractSubmissionKinds]).toEqual(kinds);
    // The contract, its revision, the obligation, the requirement, the
    // iteration and the work item are all the harness's.
    const text = JSON.stringify(contractJsonSchema);
    for (const assigned of ['contract', 'revision', 'obligation', 'requirement', 'iteration', 'workItem', 'gate', 'hash']) {
      expect(text).not.toContain(`"${assigned}"`);
    }
  });

  test('a schema violation returns every error with its path, and a corrected submission is accepted', async () => {
    const judged = await validateContract({
      kind: 'agreed',
      mode: 'fake-backed',
      provider: validation,
    }, await evidence());
    expect(judged.ok).toBe(false);
    if (judged.ok) return;
    expect(judged.errors.some(error => error.path === 'kind')).toBe(true);

    const unknownKey = await validateContract({ ...established(), extra: 1 }, await evidence());
    expect(unknownKey.ok).toBe(false);
    if (!unknownKey.ok) expect(unknownKey.errors.map(error => error.message).join(' ')).toContain('extra');

    const corrected = await validateContract(established(), await evidence());
    expect(corrected.ok).toBe(true);

    const incomplete = await validateContract({
      kind: 'incomplete',
      done: ['read both sides'],
      unfinished: ['the fake does not pass the conformance suite yet'],
      findings: [],
    }, await evidence());
    expect(incomplete.ok).toBe(true);
  });

  test('the rules the schema cannot hold', async () => {
    const known = await evidence();

    const unplaced = await validateContract(established({ provider: 'collection-review/nowhere' }), known);
    expect(unplaced.ok).toBe(false);
    if (!unplaced.ok) expect(unplaced.errors.map(error => error.path)).toContain('provider');

    const absent = await validateContract(established(), { index: known.index, consumer: reviews, exists: async path => !path.endsWith('.fake.ts') });
    expect(absent.ok).toBe(false);
    if (!absent.ok) expect(absent.errors[0]!.path).toBe('artifacts.fake.0.path');

    // A fake-backed agreement has executable evidence, or it delegates nothing.
    const noFake = await validateContract(established({
      artifacts: { ...established().artifacts as object, fake: [] },
      fakeInjections: [],
    }), known);
    expect(noFake.ok).toBe(false);
    if (!noFake.ok) expect(noFake.errors.map(error => error.path)).toEqual(expect.arrayContaining(['artifacts.fake', 'fakeInjections']));

    // Access-only establishes access to behavior that already exists.
    const accessWithFake = await validateContract(established({ mode: 'access-only' }), known);
    expect(accessWithFake.ok).toBe(false);
    if (!accessWithFake.ok) {
      expect(accessWithFake.errors.map(error => error.path)).toEqual(expect.arrayContaining(['artifacts.fake', 'fakeInjections', 'artifacts.conformance']));
    }

    const accessOnly = await validateContract(established({
      mode: 'access-only',
      artifacts: { ...established().artifacts as object, fake: [], conformance: [] },
      fakeInjections: [],
    }), known);
    expect(accessOnly.ok).toBe(true);

    // The harness writes the commit's trailers.
    const trailer = await validateContract(established({ summary: 'Done.\nRamify-Gate: ga-0001' }), known);
    expect(trailer.ok).toBe(false);
    if (!trailer.ok) expect(trailer.errors.map(error => error.path)).toContain('summary');
  });
});

describe('the need an engineer reports', () => {
  const need = {
    capability: 'note-limit',
    useCases: ['a reviewer attaches a note to a completed review run'],
    inputs: ['the note text'],
    outputs: ['whether the note is within the limit'],
    sideEffects: [],
    constraints: ['at most 500 characters'],
    existingEvidence: ['subs/b/src/tests/notes.test.ts'],
  };

  test('a schema violation returns every error with its path, and a corrected need is accepted', () => {
    const judged = validateEngineer({ kind: 'contract-needed', need: { capability: 'Note Limit' }, summary: 'x' });
    expect(judged.ok).toBe(false);
    if (!judged.ok) {
      expect(judged.errors.map(error => error.path)).toEqual(expect.arrayContaining([
        'need.capability', 'need.useCases', 'need.inputs', 'need.outputs', 'need.sideEffects', 'need.constraints', 'need.existingEvidence',
      ]));
    }
    expect(validateEngineer({ kind: 'contract-needed', need, summary: 'The limit is owned elsewhere.' }).ok).toBe(true);
  });

  test('a need names what the behavior answers or what it changes', () => {
    const judged = validateEngineer({
      kind: 'contract-needed',
      need: { ...need, outputs: [], sideEffects: [] },
      summary: 'The limit is owned elsewhere.',
    });
    expect(judged.ok).toBe(false);
    if (!judged.ok) expect(judged.errors[0]!.path).toBe('need.outputs');
  });
});

describe('the yield that waits for a provider', () => {
  const base = { index: null, registry: new Map() };

  test('a schema violation returns every error with its path', () => {
    const judged = validateLocalArchitect({ kind: 'yield-for-providers', requirements: [], summary: '' }, base);
    expect(judged.ok).toBe(false);
    if (!judged.ok) expect(judged.errors.map(error => error.path)).toEqual(expect.arrayContaining(['requirements', 'summary']));
  });

  test('it waits only for an open requirement of this work item', () => {
    const none = validateLocalArchitect({ kind: 'yield-for-providers', requirements: ['rq-001'], summary: 'Waiting.' }, base);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.errors[0]!.message).toContain('no open requirement');

    const open = validateLocalArchitect(
      { kind: 'yield-for-providers', requirements: ['rq-002'], summary: 'Waiting.' },
      { ...base, openRequirements: new Set(['rq-001']) },
    );
    expect(open.ok).toBe(false);
    if (!open.ok) expect(open.errors[0]!.expected).toBe('one of rq-001');

    expect(validateLocalArchitect(
      { kind: 'yield-for-providers', requirements: ['rq-001'], summary: 'Waiting.' },
      { ...base, openRequirements: new Set(['rq-001']) },
    ).ok).toBe(true);
  });
});

describe('the revision a consumer architect assigns directly', () => {
  const assignment = (extra: Record<string, unknown> = {}) => ({
    kind: 'assign' as const,
    outline: outline(),
    localDecisions: [],
    assignment: {
      stage: 0,
      kind: 'contract',
      goal: 'Revise the agreement so that it states the behavior this module needs.',
      approach: 'The agreed suite fixes an ordering the provider cannot give; state the set instead.',
      scope: { base: { module: reviews, included: [] }, extra: [], read: [], rationale: 'The consumer side of the agreement.' },
      citedElements: [],
      externalCapabilities: [],
      completionEvidence: 'The revised suite passes against the fake.',
      revisesContract: 'ct-001',
      ...extra,
    },
  });

  test('it names an agreement this work item consumes, and only a contract iteration carries one', () => {
    const consuming = { index: null, registry: new Map(), contracts: new Set(['ct-001']) };

    expect(validateLocalArchitect(assignment(), consuming).ok).toBe(true);

    // An architect that consumes no agreement has nothing to revise.
    const none = validateLocalArchitect(assignment(), { index: null, registry: new Map() });
    expect(none.ok).toBe(false);
    if (!none.ok) {
      expect(none.errors.map(error => error.path)).toContain('assignment.revisesContract');
      expect(none.errors[0]!.message).toContain('consumes no agreement');
    }

    // An agreement it does not consume is not its to revise.
    const other = validateLocalArchitect(assignment({ revisesContract: 'ct-009' }), consuming);
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.errors[0]!.expected).toBe('one of ct-001');

    // A contract iteration without an agreement revises nothing.
    const unnamed = validateLocalArchitect(assignment({ revisesContract: undefined }), consuming);
    expect(unnamed.ok).toBe(false);
    if (!unnamed.ok) expect(unnamed.errors[0]!.path).toBe('assignment.revisesContract');

    // And no other kind revises one.
    const ordinary = validateLocalArchitect(assignment({ kind: 'ordinary' }), consuming);
    expect(ordinary.ok).toBe(false);
    if (!ordinary.ok) expect(ordinary.errors.map(error => error.path)).toContain('assignment.kind');
  });

  test('a contract engineer has no unsuitable member at all, so it cannot report a provider\'s inability', () => {
    const kinds = contractSubmissionSchema.options.map(option => option.shape.kind.value);
    expect(kinds).not.toContain('unsuitable');
    expect(contractSubmissionSchema.safeParse({
      kind: 'unsuitable', reason: 'provider-cannot-conform', detail: 'the agreement cannot be met',
    }).success).toBe(false);
  });
});

describe('P2: the fake-naming rule', () => {
  const fake = [
    'export function createNoteLimitFake() {',
    '  return { withinLimit: (note) => note.length <= 500 };',
    '}',
  ].join('\n');

  test('a designated file whose exports carry Fake passes', () => {
    expect(isFakeFile('a/note-limit.fake.ts')).toBe(true);
    expect(isFakeFile('a/note-limit.ts')).toBe(false);
    expect(fakeNamingViolations([{ path: 'a/note-limit.fake.ts', text: fake }], ['a/note-limit.fake.ts'])).toEqual([]);
  });

  test('it rejects a file without .fake, an export without Fake, and a re-export that drops the designation', () => {
    const suffix = fakeNamingViolations([{ path: 'a/note-limit.ts', text: fake }], ['a/note-limit.ts']);
    expect(suffix.map(violation => violation.rule)).toEqual(['file-suffix']);

    const named = fakeNamingViolations(
      [{ path: 'a/note-limit.fake.ts', text: 'export function createNoteLimit() {\n  return {};\n}\n' }],
      ['a/note-limit.fake.ts'],
    );
    expect(named.map(violation => violation.rule)).toEqual(['export-name']);
    expect(named[0]!.detail).toContain('createNoteLimit');

    const anonymous = fakeNamingViolations(
      [{ path: 'a/note-limit.fake.ts', text: 'export default { withinLimit: () => true };\n' }],
      ['a/note-limit.fake.ts'],
    );
    expect(anonymous.map(violation => violation.rule)).toEqual(['export-name']);

    const reExport = fakeNamingViolations([
      { path: 'a/note-limit.fake.ts', text: fake },
      { path: 'b/notes.ts', text: "export { createNoteLimitFake as createNoteLimit } from '../a/note-limit.fake.js';\n" },
    ], ['a/note-limit.fake.ts']);
    expect(reExport.map(violation => violation.rule)).toEqual(['re-export']);
    expect(reExport[0]!.path).toBe('b/notes.ts');

    // A re-export that keeps the designation is not a violation, and neither
    // is a contract file whose behavior-oriented name carries no Fake.
    expect(fakeNamingViolations([
      { path: 'a/note-limit.fake.ts', text: fake },
      { path: 'b/notes.ts', text: "export { createNoteLimitFake } from '../a/note-limit.fake.js';\n" },
      { path: 'a/interfaces/note-limit.ts', text: 'export interface NoteLimit { withinLimit(note: string): boolean }\n' },
    ], ['a/note-limit.fake.ts'])).toEqual([]);
  });
});

describe('registration is keyed by the obligation and the requirement revision', () => {
  const key = { contract: 'ct-001', revision: 1, obligation: 'ob-ct-001', requirements: ['rq-001'] };

  test('a registration already in the log is not appended again', () => {
    expect(registrationNeeded([], key)).toBe(true);
    expect(registrationNeeded([key], key)).toBe(false);
    // Another consumer of the same obligation revision still registers: it
    // adds its own requirement and reuses the provider work.
    expect(registrationNeeded([key], { ...key, requirements: ['rq-002'] })).toBe(true);
    // A later revision of the same obligation is its own registration.
    expect(registrationNeeded([key], { ...key, revision: 2, requirements: ['rq-003'] })).toBe(true);
    // An access-only agreement has no obligation; the contract revision is its key.
    const access = { contract: 'ct-002', revision: 1, obligation: null, requirements: [] };
    expect(registrationNeeded([key], access)).toBe(true);
    expect(registrationNeeded([key, access], access)).toBe(false);
  });

  test('a reopening carries the same key, so a repeat of it appends nothing', () => {
    const attached = { ...key, requirements: ['rq-001', 'rq-002'] };
    // A revision reopens every attached requirement at the new revision.
    const reopened = { contract: 'ct-001', revision: 2, obligation: 'ob-ct-001', requirements: ['rq-001', 'rq-002'] };
    expect(registrationNeeded([attached], reopened)).toBe(true);
    // The same transaction derived again, as a repeat after a crash derives
    // it, is already in the log.
    expect(registrationNeeded([attached, reopened], reopened)).toBe(false);
    // A consumer attaching at the revision it was registered under is a
    // registration of its own.
    expect(registrationNeeded([attached, reopened], { ...reopened, requirements: ['rq-001', 'rq-002', 'rq-003'] })).toBe(true);
  });
});

describe('the dependency graph has capabilities for nodes', () => {
  const edge = (from: string, to: string, requirement: string, workItem: string) => ({ from, to, requirement, workItem });

  test('a capability that transitively depends on itself is a cycle, and a chain through one module is not', () => {
    // Change 1 in module A needs change 2 in module B, which needs change 3
    // in module A: three capabilities, no cycle.
    const chain = [edge('one', 'two', 'rq-001', 'wi-001')];
    expect(cycleClosedBy(chain, edge('two', 'three', 'rq-002', 'wi-002'))).toBeNull();

    const closed = cycleClosedBy(
      [edge('one', 'two', 'rq-001', 'wi-001'), edge('two', 'three', 'rq-002', 'wi-002')],
      edge('three', 'one', 'rq-003', 'wi-003'),
    );
    expect(closed).not.toBeNull();
    expect(closed!.members).toEqual(['one', 'two', 'three']);
    expect(closed!.requirements).toEqual(['rq-001', 'rq-002', 'rq-003']);

    // The same cycle written from another edge reads the same way, which is
    // what makes "the same cycle again" a comparison and not a guess.
    const other = cycleClosedBy(
      [edge('two', 'three', 'rq-002', 'wi-002'), edge('three', 'one', 'rq-003', 'wi-003')],
      edge('one', 'two', 'rq-001', 'wi-001'),
    );
    expect(cycleIdentity(other!)).toBe(cycleIdentity(closed!));

    // A capability that depends on itself is the shortest cycle there is.
    expect(cycleClosedBy([], edge('one', 'one', 'rq-004', 'wi-004'))!.members).toEqual(['one']);
  });
});

describe('scheduling is depth-first', () => {
  const item = (id: string, startedFor: string | null): WorkItem => ({
    schema: 'ramify-agent.work-item/1',
    id,
    module: `m/${id}`,
    origin: { entry: 'a-capability' },
    goal: 'do the work',
    requirementRefs: [],
    acceptanceRefs: [],
    contextRefs: [],
    startedFor,
  });

  test('the deepest open item runs first, and a resumable consumer comes before an independent entry item', () => {
    const items = [item('wi-001', null), item('wi-002', null), item('wi-003', 'wi-001'), item('wi-004', 'wi-003')];
    expect([...depthOf(items).values()]).toEqual([0, 0, 1, 2]);

    const requirement = {
      schema: 'ramify-agent.consumer-requirement/1' as const,
      id: 'rq-001', revision: 1, workItem: 'wi-001', consumer: 'm/wi-001',
      forCapability: 'a-capability', obligation: 'ob-ct-001', contractRevision: 1,
      behavior: 'the agreed behavior',
      evidence: { tests: { policy: 'owned-by-scope' as const, exactOwners: [], subtrees: [], extraSuites: [] }, fakeInjections: [] },
    };
    const base = {
      items,
      completed: new Set<string>(),
      requirements: new Map([['rq-001', requirement]]),
      bindings: new Map<string, string>(),
      reopened: new Set<string>(),
    };

    // wi-001 has yielded; the deepest provider runs, not the next entry item.
    const waiting = { ...base, yielded: new Map([['wi-001', ['rq-001']]]), conformed: new Set<string>() };
    expect(nextWorkItem(waiting)!.item.id).toBe('wi-004');

    // Once the provider has conformed, the consumer comes back before wi-002.
    const released = { ...base, yielded: new Map([['wi-001', ['rq-001']]]), conformed: new Set(['ob-ct-001@1']) };
    const next = nextWorkItem(released)!;
    expect(next.item.id).toBe('wi-001');
    expect(next.resumes).toEqual(['rq-001']);

    // With nothing yielded, the committed order is the order.
    expect(nextWorkItem({ ...base, yielded: new Map(), conformed: new Set<string>() })!.item.id).toBe('wi-004');
    expect(nextWorkItem({
      ...base,
      items: [item('wi-001', null), item('wi-002', null)],
      yielded: new Map(),
      conformed: new Set<string>(),
    })!.item.id).toBe('wi-001');
  });
});
