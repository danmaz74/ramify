import type { CandidateSource } from '../../evidence/src/git.js';
import type { SubmissionValidation } from '../../../src/run/submissions.js';
import type { ReviewSubmission } from './interfaces/submissions.js';
import { collectReviewDiffPayload } from './diff-payload.js';
import { reviewMessage, type ReviewBriefing } from './message.js';
import { snapshotTools, type SnapshotTools } from './snapshot.js';
import { validateReview } from './submission.js';

export interface ReviewPreparation {
  readonly source: CandidateSource;
  readonly projectRoot: string;
  readonly briefing: Omit<ReviewBriefing, 'diffPayload'>;
  readonly maxConcerns: number;
  readonly signal?: AbortSignal;
}

/** One preparation binds its delivered patches and observed tool answers to its validator. */
export interface PreparedReview {
  readonly message: string;
  /** Literal support section for prompt delivery accounting. */
  readonly candidateDiff: string;
  readonly tools: SnapshotTools;
  readonly validate: (input: unknown) => SubmissionValidation<ReviewSubmission>;
}

/** The parent supplies the fixed question and owns cancellation; review evidence stays here. */
export async function prepareReview(input: ReviewPreparation): Promise<PreparedReview> {
  const { snapshot } = input.briefing;
  const tools = snapshotTools(snapshot, input.source, input.projectRoot);
  const diff = await collectReviewDiffPayload(snapshot, input.source, input.projectRoot, input.signal);
  const deliveredPatches = new Set(diff.inlinePaths);
  return {
    message: reviewMessage({ ...input.briefing, diffPayload: diff.text }),
    candidateDiff: diff.text,
    tools,
    validate: value => validateReview(value, {
      snapshot, inspected: tools.inspected(), read: tools.read(), deliveredPatches, maxConcerns: input.maxConcerns,
    }),
  };
}
