import type { OriginalId, SourceLocation, SourceOrigin } from '../../../model/src/interfaces/model.js';

/**
 * Frozen plain evidence of the opt-in `dependency-behavior` capability. See
 * docs/architecture/modularity-report.spec.md; the vocabulary is the dependency
 * glossary's. Nothing here is produced by an ordinary or resident check.
 */

/** Evidence observed for one consumer file and one original. */
export type BehaviorEvidence = 'call' | 'construction' | 'callable-reference'
  | 'data' | 'type' | 'forwarding';

/**
 * The classification of every selection of one original from one consumer file.
 * `behavioral` wins over every other evidence; `unused` has no identified
 * reference outside the import declaration; `unknown` names at least one limit.
 */
export type BehaviorClassification = 'behavioral' | 'non-behavioral' | 'unused' | 'unknown';

/**
 * One fact per distinct (consumer file, original) pair over resolved application
 * selections, whatever the current ownership of either file, so a candidate
 * ownership can deduplicate them again. The original's `owner` is the declared
 * owner; modularity derives ownership from the original's defining file instead.
 */
export interface DependencyBehaviorFact {
  readonly consumer: SourceOrigin;
  readonly original: OriginalId;
  /** `SourceAccess.id` values whose resolved selections name the original, in byte order. */
  readonly accessIds: readonly string[];
  readonly classification: BehaviorClassification;
  /** Distinct evidence in the declaration order of `BehaviorEvidence`; empty for `unused` and `unknown`. */
  readonly evidence: readonly BehaviorEvidence[];
  /** `BehaviorLimit.id` values; non-empty exactly when the classification is `unknown`. */
  readonly limitIds: readonly string[];
}

export interface BehaviorLimit {
  readonly id: string;
  readonly code: 'unresolved-reference' | 'unresolved-symbol' | 'unclassified-capability'
    | 'unsupported-syntax' | 'compiler-failure' | 'resource-limit';
  readonly location: SourceLocation | null;
  readonly message: string;
}

/**
 * The capability's result for one analysis. `completed` classified every
 * resolved selection, possibly as `unknown`; `failed` means the classification
 * operation failed as a whole, with no facts and at least one limit explaining it.
 */
export interface DependencyBehaviorFacts {
  readonly status: 'completed' | 'failed';
  /** Ordered by consumer file, then by the original's file, binding and kind, in byte order. */
  readonly facts: readonly DependencyBehaviorFact[];
  /** Ordered by id in byte order. */
  readonly limits: readonly BehaviorLimit[];
}
