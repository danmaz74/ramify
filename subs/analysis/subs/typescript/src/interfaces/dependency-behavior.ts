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
 * The classification of every selection of one original through one
 * `SourceAccess`, so use through one import path never makes another look
 * referenced. Several aliases of the original in that access are combined.
 */
export interface DependencyBehaviorAccessFact {
  readonly accessId: string;
  readonly classification: BehaviorClassification;
  /**
   * Distinct evidence observed through this access, in the declaration order of
   * `BehaviorEvidence`; empty for `unused`. For `unknown` it is the partial
   * evidence observed besides the limit, which does not settle the access.
   */
  readonly evidence: readonly BehaviorEvidence[];
  /** `BehaviorLimit.id` values in byte order; non-empty exactly when the classification is `unknown`. */
  readonly limitIds: readonly string[];
}

/**
 * One fact per distinct (consumer file, original) pair over resolved application
 * selections, whatever the current ownership of either file, so a candidate
 * ownership can deduplicate them again. The original's `owner` is the declared
 * owner; modularity derives ownership from the original's defining file instead.
 * The aggregate applies the precedence behavioral, unknown, non-behavioral,
 * unused over its access facts.
 */
export interface DependencyBehaviorFact {
  readonly consumer: SourceOrigin;
  readonly original: OriginalId;
  /** `SourceAccess.id` values whose resolved selections name the original, in byte order. */
  readonly accessIds: readonly string[];
  /** One fact per entry of `accessIds`, in the same order. */
  readonly accesses: readonly DependencyBehaviorAccessFact[];
  readonly classification: BehaviorClassification;
  /** Distinct evidence of every access in the declaration order of `BehaviorEvidence`; empty for `unused` and `unknown`. */
  readonly evidence: readonly BehaviorEvidence[];
  /** `BehaviorLimit.id` values of every access in byte order; non-empty exactly when the classification is `unknown`. */
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
  /** Every limit an access fact names, ordered by id in byte order. */
  readonly limits: readonly BehaviorLimit[];
}
