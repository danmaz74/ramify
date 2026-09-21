import type { DecisionBody, ForkSubmission, LocalDecisionBody, PlacementRequestBody, RegistryChange } from '../../architecture/submission.js';
import type { LocalArchitectSubmission } from '../../work/submission.js';

/*
 * The submissions of the placement chain, as a test writes them. Nothing
 * here simulates a transition: each one goes through the same judge, the
 * same schema and the same rules an agent's would.
 */

/** One decision body, with the smallest honest evidence. */
export function decision(extra: Partial<DecisionBody> = {}): DecisionBody {
  return {
    question: 'Where does this behavior belong?',
    outcome: 'reuse',
    capability: 'send-email',
    changesExistingSymbols: false,
    owner: 'shop/orders',
    rationale: 'The behavior the request needs is what this module already owns.',
    constraints: [],
    uncertainties: [],
    evidence: { citations: [], gaps: [] },
    ...extra,
  };
}

/** One registry entry as a decision states it. */
export function registryChange(extra: Partial<RegistryChange> & Pick<RegistryChange, 'capability' | 'owner'>): RegistryChange {
  return {
    behavior: `The module provides ${extra.capability}.`,
    consumers: [],
    ...extra,
  };
}

/** A fork's decision submission, with its brief. */
export function forkDecision(extra: Partial<Extract<ForkSubmission, { kind: 'decision' }>> = {}): ForkSubmission {
  return {
    kind: 'decision',
    decision: decision(),
    registry: [],
    hypothesisRevisions: [],
    brief: 'The capability stays where the registry already places it.',
    ...extra,
  };
}

/** A fork that could not decide. It is never appended and is never a decision. */
export function forkPartial(findings: readonly string[] = ['two modules could own it'], gaps: readonly string[] = ['no dependency facts']): ForkSubmission {
  return { kind: 'partial', findings: [...findings], gaps: [...gaps] };
}

/** The request body a local architect submits. */
export function placementRequest(extra: Partial<PlacementRequestBody> = {}): PlacementRequestBody {
  return {
    forCapability: 'send-email',
    question: 'Where does sending an email belong?',
    requiredBehavior: 'One message per completed order, with the order reference in it.',
    findings: [],
    candidates: [],
    unresolved: [],
    hypotheses: [],
    localDecisions: [],
    ...extra,
  };
}

/** A local architect asking the global architect where a capability belongs. */
export function requestPlacement(extra: Partial<PlacementRequestBody> = {}): LocalArchitectSubmission {
  return { kind: 'request-placement', request: placementRequest(extra) };
}

/** One placement a local architect decided within its own authority. */
export function localDecision(body: Partial<DecisionBody>, registry: readonly RegistryChange[] = []): LocalDecisionBody {
  return { decision: decision(body), registry: [...registry] };
}
