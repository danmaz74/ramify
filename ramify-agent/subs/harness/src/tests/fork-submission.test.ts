import { describe, expect, test } from 'vitest';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import { architectIndex, moduleEntry } from './helpers/views.js';
import type { Hypothesis, RegistryEntry } from '../analysis/records.js';
import { extensionIsANewCapability, type PlacementDecision } from '../architecture/records.js';
import { forkJsonSchema, forkToolName, validateFork, type PlacementEvidence } from '../architecture/submission.js';
import { validateLocalArchitect } from '../work/submission.js';
import { decision, forkDecision, placementRequest, registryChange } from './helpers/placement.js';

/*
 * Everything a placement fork tells the harness is validated JSON, and so is
 * the request a local architect makes: the strict schema, then the rules the
 * schema cannot hold. A failure changes nothing, every error names its path,
 * and a corrected input is accepted.
 *
 * The rule this iteration's guard names is an owner the refreshed view does
 * not have, with no valid proposal behind it.
 */

const index: ArchitectIndex = architectIndex([
  moduleEntry('shop', '', null),
  moduleEntry('shop/orders', 'subs/orders', 'shop'),
  moduleEntry('shop/billing', 'subs/billing', 'shop'),
]);

const registered: RegistryEntry = {
  schema: 'ramify-agent.capability/1',
  capability: 'send-email', revision: 1, behavior: 'Sends the customer an email.',
  owner: 'shop/orders', origin: 'entry', decision: null, consumers: [],
};

const proposedEntry: RegistryEntry = {
  schema: 'ramify-agent.capability/1',
  capability: 'notify', revision: 1, behavior: 'Tells a person that something happened.',
  owner: 'shop/notifications', origin: 'global-decision', decision: 'gd-001', consumers: [],
  proposed: { parent: 'shop', directory: 'subs/notifications', purpose: 'Tells a person that something happened.', tags: [] },
};

const forecast: Hypothesis = {
  schema: 'ramify-agent.hypothesis/1',
  id: 'email-delivery', revision: 1, standing: 'tentative', capability: 'send-email', change: 'reuse',
  changesExistingSymbols: false, suggestedOwner: 'shop/orders', anticipatedConsumers: [], involvedModules: ['shop/orders'], dependsOn: [],
  confidence: 'medium', rationale: 'Orders already sends confirmations.', assumptions: [], uncertainties: [],
  citations: [], cause: { initial: 'inv-0001' },
};

const earlier: PlacementDecision = {
  schema: 'ramify-agent.placement-decision/1',
  id: 'gd-001', authority: 'global', request: 'pr-001', workItem: 'wi-001', invocation: 'inv-0003',
  question: 'Where does sending an email belong?', outcome: 'reuse', capability: 'send-email',
  changesExistingSymbols: false, owner: 'shop/orders',
  rationale: 'Orders already owns it.', constraints: [], uncertainties: [],
  evidence: { view: { status: 'placeholder' }, citations: [], gaps: [] },
  registry: [], hypothesisRevisions: [],
};

const evidence: PlacementEvidence = {
  index,
  registry: new Map([['send-email', registered]]),
  hypotheses: new Map([['email-delivery', forecast]]),
  decisions: new Map([['gd-001', earlier]]),
  workItems: new Set(['wi-001', 'wi-002']),
};

/** The same evidence with the accepted proposal of a module that does not exist yet. */
const withProposal: PlacementEvidence = {
  ...evidence,
  registry: new Map([['send-email', registered], ['notify', proposedEntry]]),
};

function paths(result: ReturnType<typeof validateFork>): string[] {
  return result.ok ? [] : result.errors.map(error => error.path);
}

function messages(result: ReturnType<typeof validateFork>): string[] {
  return result.ok ? [] : result.errors.map(error => error.message);
}

describe('the fork submission schema', () => {
  test('is a union discriminated on kind, and has no field for an ID the harness knows', () => {
    const union = (forkJsonSchema as { anyOf?: unknown[]; oneOf?: unknown[] });
    const members = (union.anyOf ?? union.oneOf) as Array<{ properties?: Record<string, unknown> }>;
    expect(members).toHaveLength(2);
    const text = JSON.stringify(forkJsonSchema);
    for (const assigned of ['"id"', '"authority"', '"invocation"', '"schema"', '"revision"', '"origin"', '"previousOwner"', '"view"', '"hash"']) {
      expect(text).not.toContain(assigned);
    }
    // No member carries the request or the work item it answers: a consumer
    // link and an affected consequence name another record, which is a
    // reference and not this submission's own identity.
    for (const member of members) {
      expect(Object.keys(member.properties ?? {})).not.toContain('request');
      expect(Object.keys(member.properties ?? {})).not.toContain('workItem');
    }
    expect(forkToolName).toBe('submit_placement_decision');
  });

  test('a schema violation returns every error with its path, and a corrected submission is accepted', () => {
    const unknownKind = validateFork({ kind: 'approve' }, evidence);
    expect(unknownKind.ok).toBe(false);
    expect(paths(unknownKind).length).toBeGreaterThan(0);

    // An unrecognized key is reported against the object that holds it,
    // with the key named in the message, which is where a reader looks.
    const extra = validateFork({ ...forkDecision(), notes: 'something' }, evidence);
    expect(extra.ok).toBe(false);
    expect(paths(extra)).toContain('(root)');
    expect(extra.ok === false && extra.errors.some(error => error.message.includes('notes'))).toBe(true);

    const missing = validateFork({ kind: 'decision', decision: decision(), registry: [], hypothesisRevisions: [] }, evidence);
    expect(missing.ok).toBe(false);
    expect(paths(missing)).toContain('brief');

    const wrong = validateFork({ kind: 'partial', findings: 'nothing', gaps: [] }, evidence);
    expect(wrong.ok).toBe(false);
    expect(paths(wrong)).toContain('findings');

    expect(validateFork(forkDecision(), evidence).ok).toBe(true);
    expect(validateFork({ kind: 'partial', findings: ['the owner is not obvious'], gaps: ['no dependency facts'] }, evidence).ok).toBe(true);
  });
});

describe('the rules the fork schema cannot hold', () => {
  test('an owner absent from the refreshed view, with no valid proposal, is refused', () => {
    const absent = validateFork(forkDecision({
      decision: decision({ outcome: 'create', capability: 'notify', owner: 'shop/notifications' }),
      registry: [registryChange({ capability: 'notify', owner: 'shop/notifications' })],
    }), evidence);
    expect(absent.ok).toBe(false);
    expect(paths(absent)).toContain('decision.proposed');
    expect(paths(absent)).toContain('registry.0.owner');

    // The same decision, with the proposal that creates the owner, is accepted.
    const proposal = { parent: 'shop', directory: 'subs/notifications', purpose: 'Tells a person that something happened.', tags: [] };
    const accepted = validateFork(forkDecision({
      decision: decision({ outcome: 'create', capability: 'notify', owner: 'shop/notifications', proposed: proposal }),
      registry: [registryChange({ capability: 'notify', owner: 'shop/notifications', proposed: proposal })],
    }), evidence);
    expect(accepted.ok).toBe(true);
  });

  test('a proposal whose parent is absent, or whose directory is taken, is refused', () => {
    const parent = validateFork(forkDecision({
      decision: decision({
        outcome: 'create', capability: 'notify', owner: 'shop/nowhere/notifications',
        proposed: { parent: 'shop/nowhere', directory: 'subs/nowhere/subs/notifications', purpose: 'p', tags: [] },
      }),
      registry: [],
    }), evidence);
    expect(paths(parent)).toContain('decision.proposed.parent');

    const taken = validateFork(forkDecision({
      decision: decision({
        outcome: 'create', capability: 'notify', owner: 'shop/notifications',
        proposed: { parent: 'shop', directory: 'subs/orders', purpose: 'p', tags: [] },
      }),
      registry: [],
    }), evidence);
    expect(paths(taken)).toContain('decision.proposed.directory');

    const nested = validateFork(forkDecision({
      decision: decision({
        outcome: 'create', capability: 'notify', owner: 'shop/notifications',
        proposed: { parent: 'shop', directory: 'subs/orders/subs/notifications', purpose: 'p', tags: [] },
      }),
      registry: [],
    }), evidence);
    expect(paths(nested)).toContain('decision.proposed.directory');

    const already = validateFork(forkDecision({
      decision: decision({
        outcome: 'create', capability: 'invoice', owner: 'shop/invoices',
        proposed: { parent: 'shop', directory: 'subs/notifications', purpose: 'p', tags: [] },
      }),
      registry: [],
    }), withProposal);
    expect(paths(already)).toContain('decision.proposed.directory');
  });

  test('the decision and its registry entry carry the same proposal', () => {
    const proposal = { parent: 'shop', directory: 'subs/notifications', purpose: 'Tells a person.', tags: [] };
    const missing = validateFork(forkDecision({
      decision: decision({ outcome: 'create', capability: 'notify', owner: 'shop/notifications', proposed: proposal }),
      registry: [],
    }), evidence);
    expect(paths(missing)).toContain('decision.proposed');

    const different = validateFork(forkDecision({
      decision: decision({ outcome: 'create', capability: 'notify', owner: 'shop/notifications', proposed: proposal }),
      registry: [registryChange({
        capability: 'notify', owner: 'shop/notifications',
        proposed: { ...proposal, purpose: 'Something else.' },
      })],
    }), evidence);
    expect(paths(different)).toContain('decision.proposed');
  });

  test('reuse of an absent owner needs an accepted proposal, and never introduces one', () => {
    const introduced = validateFork(forkDecision({
      decision: decision({
        outcome: 'reuse', capability: 'notify', owner: 'shop/notifications',
        proposed: { parent: 'shop', directory: 'subs/notifications', purpose: 'p', tags: [] },
      }),
      registry: [],
    }), evidence);
    expect(paths(introduced)).toContain('decision.proposed');

    const absent = validateFork(forkDecision({
      decision: decision({ outcome: 'reuse', capability: 'notify', owner: 'shop/notifications' }),
      registry: [],
    }), evidence);
    expect(paths(absent)).toContain('decision.owner');

    // With the proposal already accepted in the registry, reuse preserves
    // the capability identity of an owner that is not implemented yet.
    const preserved = validateFork(forkDecision({
      decision: decision({ outcome: 'reuse', capability: 'notify', owner: 'shop/notifications' }),
      registry: [],
    }), withProposal);
    expect(preserved.ok).toBe(true);
  });

  test('a decision that places a registered capability elsewhere names what it replaces', () => {
    const silent = validateFork(forkDecision({
      decision: decision({ outcome: 'extract', capability: 'send-email', owner: 'shop/billing' }),
      registry: [registryChange({ capability: 'send-email', owner: 'shop/billing' })],
    }), evidence);
    expect(paths(silent)).toContain('decision.revises');

    const named = validateFork(forkDecision({
      decision: decision({
        outcome: 'extract', capability: 'send-email', owner: 'shop/billing',
        revises: { decision: 'gd-001', affected: [{ workItem: 'wi-001', consequence: 'Its consumer moves to billing.' }] },
      }),
      registry: [registryChange({ capability: 'send-email', owner: 'shop/billing' })],
    }), evidence);
    expect(named.ok).toBe(true);

    const unknown = validateFork(forkDecision({
      decision: decision({
        outcome: 'extract', capability: 'send-email', owner: 'shop/billing',
        revises: { decision: 'gd-009', affected: [{ workItem: 'wi-404', consequence: 'x' }] },
      }),
      registry: [registryChange({ capability: 'send-email', owner: 'shop/billing' })],
    }), evidence);
    expect(paths(unknown)).toContain('decision.revises.decision');
    expect(paths(unknown)).toContain('decision.revises.affected.0.workItem');
  });

  test('only an external capability has no owner, and it is registered with none', () => {
    const owned = validateFork(forkDecision({
      decision: decision({ outcome: 'external', capability: 'notify', owner: 'shop/orders' }),
      registry: [],
    }), evidence);
    expect(paths(owned)).toContain('decision.owner');

    const ownerless = validateFork(forkDecision({
      decision: decision({ outcome: 'create', capability: 'notify', owner: null }),
      registry: [],
    }), evidence);
    expect(paths(ownerless)).toContain('decision.owner');

    const registeredExternal = validateFork(forkDecision({
      decision: decision({ outcome: 'external', capability: 'notify', owner: null }),
      registry: [registryChange({ capability: 'notify', owner: 'shop/orders' })],
    }), evidence);
    expect(paths(registeredExternal)).toContain('decision.outcome');

    expect(validateFork(forkDecision({
      decision: decision({ outcome: 'external', capability: 'notify', owner: null }),
      registry: [],
    }), evidence).ok).toBe(true);
  });

  test('an extension submitted as the retired "extend" outcome is refused, and told to register a new capability', () => {
    const extended = validateFork({
      ...forkDecision(),
      decision: { ...decision({ capability: 'send-email', owner: 'shop/orders' }), outcome: 'extend' },
    }, evidence);
    expect(paths(extended)).toEqual(['decision.outcome']);
    expect(messages(extended)[0]).toBe(extensionIsANewCapability);
    expect(messages(extended)[0]).toContain('new capability named for itself');
    expect(messages(extended)[0]).toContain('"create"');

    // The same extension, as the model now states it: a new capability of its
    // own, owned by the module that already holds the behavior.
    expect(validateFork(forkDecision({
      decision: decision({
        outcome: 'create', capability: 'send-email-with-attachment', changesExistingSymbols: true, owner: 'shop/orders',
      }),
      registry: [registryChange({ capability: 'send-email-with-attachment', owner: 'shop/orders' })],
    }), evidence).ok).toBe(true);
  });

  test('only a module the view already has can change symbols that already have consumers', () => {
    const external = validateFork(forkDecision({
      decision: decision({ outcome: 'external', capability: 'notify', changesExistingSymbols: true, owner: null }),
      registry: [],
    }), evidence);
    expect(paths(external)).toContain('decision.changesExistingSymbols');

    const proposing = validateFork(forkDecision({
      decision: decision({
        outcome: 'create', capability: 'notify', changesExistingSymbols: true, owner: 'shop/notifications',
        proposed: { parent: 'shop', directory: 'subs/notifications', purpose: 'Tells a person that something happened.', tags: [] },
      }),
      registry: [registryChange({
        capability: 'notify', owner: 'shop/notifications',
        proposed: { parent: 'shop', directory: 'subs/notifications', purpose: 'Tells a person that something happened.', tags: [] },
      })],
    }), evidence);
    expect(paths(proposing)).toContain('decision.changesExistingSymbols');
  });

  test('a revision of a hypothesis nothing committed, and a consumer of a work item nothing committed, are refused', () => {
    const unknown = validateFork(forkDecision({
      hypothesisRevisions: [{ hypothesis: 'no-such-forecast', standing: 'superseded', reason: 'it was wrong' }],
    }), evidence);
    expect(paths(unknown)).toContain('hypothesisRevisions.0.hypothesis');

    const twice = validateFork(forkDecision({
      hypothesisRevisions: [
        { hypothesis: 'email-delivery', standing: 'confirmed', reason: 'orders owns it' },
        { hypothesis: 'email-delivery', standing: 'superseded', reason: 'and also not' },
      ],
    }), evidence);
    expect(paths(twice)).toContain('hypothesisRevisions.1.hypothesis');

    const consumer = validateFork(forkDecision({
      registry: [registryChange({ capability: 'send-email', owner: 'shop/orders', consumers: [{ capability: 'send-email', workItem: 'wi-404' }] })],
    }), evidence);
    expect(paths(consumer)).toContain('registry.0.consumers.0.workItem');

    expect(validateFork(forkDecision({
      hypothesisRevisions: [{ hypothesis: 'email-delivery', standing: 'confirmed', reason: 'orders owns it' }],
      registry: [registryChange({ capability: 'send-email', owner: 'shop/orders', consumers: [{ capability: 'send-email', workItem: 'wi-002' }] })],
    }), evidence).ok).toBe(true);
  });
});

describe('the rules a placement request must satisfy', () => {
  test('a schema violation returns every error with its path, and a corrected request is accepted', () => {
    const extra = validateLocalArchitect({ kind: 'request-placement', request: { ...placementRequest(), urgency: 'high' } }, evidence);
    expect(extra.ok).toBe(false);
    expect(extra.ok === false && extra.errors.map(error => error.path)).toContain('request');
    expect(extra.ok === false && extra.errors.some(error => error.message.includes('urgency'))).toBe(true);

    const missing = validateLocalArchitect({ kind: 'request-placement', request: { question: 'where?' } }, evidence);
    expect(missing.ok).toBe(false);
    expect(missing.ok === false && missing.errors.every(error => error.path.startsWith('request.'))).toBe(true);

    expect(validateLocalArchitect({ kind: 'request-placement', request: placementRequest() }, evidence).ok).toBe(true);
  });

  test('a request names a registered capability, a known hypothesis and its own local decisions', () => {
    const unregistered = validateLocalArchitect({
      kind: 'request-placement',
      request: placementRequest({ forCapability: 'no-such-capability' }),
    }, evidence);
    expect(unregistered.ok === false && unregistered.errors.map(error => error.path)).toContain('request.forCapability');

    const unknown = validateLocalArchitect({
      kind: 'request-placement',
      request: placementRequest({
        hypotheses: [{ hypothesis: 'no-such-forecast', stance: 'contradicts', evidence: 'nothing there' }],
        localDecisions: ['ld-wi-001-09'],
        candidates: [{ capability: 'no-such-capability', note: 'maybe' }, { owner: 'shop/nowhere', note: 'or here' }],
      }),
    }, evidence);
    const reported = unknown.ok === false ? unknown.errors.map(error => error.path) : [];
    expect(reported).toContain('request.hypotheses.0.hypothesis');
    expect(reported).toContain('request.localDecisions.0');
    expect(reported).toContain('request.candidates.0.capability');
    expect(reported).toContain('request.candidates.1.owner');
  });
});
