import type { OriginalId } from '../subs/model/src/interfaces/model.js';
import type { BehaviorClassification } from '../subs/typescript/src/interfaces/dependency-behavior.js';
import type {
  DependencyDiagramInput,
  TestFileReferences,
  TestReferenceFacts,
  TestReferenceOutcome,
} from './interfaces/dependency-diagram.js';
import { resolveOwnership } from './modularity-candidate.js';
import { byteOrder, completeReport, viewFacts } from './modularity-context.js';
import { behaviorUnavailable } from './modularity-owner.js';

/**
 * Test references of docs/architecture/architect-view.spec.md: for each
 * testing-classified consumer file, the originals it references behaviorally
 * and the number of pairs the classifier left unknown. A projection of the
 * per-file behavior facts under the modularity projection's `test` source
 * filter, beside the dependency diagram's production projection of the same
 * facts. Same-owner originals are included, since a module's own tests
 * exercise its own symbols. Pure: it reads only the report.
 */

const precedence: readonly BehaviorClassification[] = ['behavioral', 'unknown', 'non-behavioral', 'unused'];
const stronger = (left: BehaviorClassification, right: BehaviorClassification): BehaviorClassification =>
  precedence.indexOf(left) <= precedence.indexOf(right) ? left : right;
const originalOrder = (left: OriginalId, right: OriginalId): number => byteOrder(left.owner, right.owner)
  || byteOrder(left.file, right.file) || byteOrder(left.binding, right.binding) || byteOrder(left.kind, right.kind);

export function projectTestReferences(input: DependencyDiagramInput): TestReferenceOutcome {
  const { report } = input;
  if (!completeReport(report)) return { status: 'refused', reason: 'analysis-incomplete' };
  const resolved = resolveOwnership(report, input.ownership);
  if (resolved.status === 'invalid') {
    throw new TypeError(`The candidate ownership is invalid: ${resolved.issues.map(issue => `${issue.code} ${JSON.stringify(issue.subject)}`).join(', ')}`);
  }
  const unavailable = behaviorUnavailable(report);
  if (unavailable) return { status: 'refused', reason: unavailable === 'not-requested' ? 'not-requested' : 'capability-failed' };
  const behavior = report.snapshot.dependencyBehavior!;
  // A failed classification has no facts: every file would read as referencing nothing.
  if (behavior.status !== 'completed') return { status: 'refused', reason: 'capability-failed' };

  const view = viewFacts(report, 'test', resolved.ownership, []);
  const pairs = new Map<string, Map<string, { readonly original: OriginalId; classification: BehaviorClassification }>>();
  for (const fact of behavior.facts) {
    if (!view.sources.has(fact.consumer.file)) continue;
    const { kind, owner, file, binding } = fact.original;
    const byOriginal = pairs.get(fact.consumer.file) ?? new Map();
    pairs.set(fact.consumer.file, byOriginal);
    // The facts hold one entry per (file, original) pair; a repeated pair keeps the stronger class.
    const key = JSON.stringify([owner, file, binding, kind]);
    const pair = byOriginal.get(key);
    if (pair) pair.classification = stronger(pair.classification, fact.classification);
    else byOriginal.set(key, { original: { kind, owner, file, binding } as OriginalId, classification: fact.classification });
  }

  const files: TestFileReferences[] = [];
  for (const file of [...pairs.keys()].sort(byteOrder)) {
    const classified = [...pairs.get(file)!.values()];
    const exercises = classified.filter(pair => pair.classification === 'behavioral').map(pair => pair.original).sort(originalOrder);
    const unclassified = classified.filter(pair => pair.classification === 'unknown').length;
    if (exercises.length || unclassified) files.push({ file, exercises, unclassified });
  }
  const references: TestReferenceFacts = deepFreeze({ inputId: report.inputId, files });
  const bytes = Buffer.byteLength(JSON.stringify(references), 'utf8');
  if (bytes > input.limits.maxResultBytes) {
    return { status: 'refused', reason: 'resource-limit', observedBytes: bytes, maximumBytes: input.limits.maxResultBytes };
  }
  return { status: 'projected', references };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}