import { z } from 'zod';
import type { JsonSchema } from '../../subs/agent/src/interfaces/port.js';
import { schemaErrors, type SubmissionError, type SubmissionValidation } from '../run/submissions.js';
import { orientationSubmissionSchema, reviewSubmissionSchema, type OrientationSubmission, type ReviewSubmission } from './records.js';
import { resolveChangedPath, resolveSnapshotPath, snapshotToolNames, type CandidateSnapshot } from './snapshot.js';

/*
 * A reviewer's one submission, judged against what the harness observed.
 * The schema holds the shape; the rules below hold what it cannot: every
 * changed path is named once, as inspected or as missing with a reason; a
 * path named inspected was actually answered by a snapshot tool during this
 * attempt; and every concern points at the candidate. An agent's word that
 * it read something is never the evidence that it did.
 */

export const reviewToolName = 'submit_review';

export const reviewJsonSchema = z.toJSONSchema(reviewSubmissionSchema) as JsonSchema;

export const reviewSubmissionDescription = 'End this review with its result: every changed path you inspected, every one you could not with the reason, and each actionable concern. The harness validates it; an invalid submission is returned with every error, and a valid one ends this invocation.';

/** What the harness observed of this attempt, which the submission is judged against. */
export interface ReviewEvidence {
  readonly snapshot: CandidateSnapshot;
  /** The changed paths a snapshot tool answered the content or patch of during this attempt. */
  readonly inspected: ReadonlySet<string>;
  readonly maxConcerns: number;
}

export function validateReview(input: unknown, evidence: ReviewEvidence): SubmissionValidation<ReviewSubmission> {
  const parsed = reviewSubmissionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: schemaErrors(parsed.error) };
  const submission = parsed.data;
  const errors: SubmissionError[] = [];
  const changed = new Set(evidence.snapshot.changes.map(change => change.path));

  if (submission.concerns.length > evidence.maxConcerns) {
    errors.push({ path: 'concerns', message: `The run's review policy accepts at most ${evidence.maxConcerns} concerns in one submission`, expected: `at most ${evidence.maxConcerns} items` });
  }

  const named = new Map<string, string>();
  const name = (path: string, where: string): void => {
    const resolved = resolveChangedPath(evidence.snapshot, path);
    if (typeof resolved !== 'string') {
      errors.push({ path: where, message: `"${path}" is not a path the candidate changed: ${resolved.text}`, expected: 'a path the candidate diff names' });
      return;
    }
    const earlier = named.get(resolved);
    if (earlier !== undefined) errors.push({ path: where, message: `"${resolved}" is already named at ${earlier}`, expected: 'each changed path named once' });
    else named.set(resolved, where);
  };
  submission.inspected.forEach((path, index) => {
    name(path, `inspected.${index}`);
    const resolved = resolveChangedPath(evidence.snapshot, path);
    if (typeof resolved === 'string' && !evidence.inspected.has(resolved)) {
      errors.push({
        path: `inspected.${index}`,
        message: `"${resolved}" is named inspected, and no ${snapshotToolNames.read} or ${snapshotToolNames.diff} call of this review answered it`,
        expected: 'a path read through the snapshot tools, or named missing with the reason',
      });
    }
  });
  submission.missing.forEach((entry, index) => name(entry.path, `missing.${index}.path`));
  for (const path of changed) {
    if (!named.has(path)) errors.push({ path: 'inspected', message: `The changed path "${path}" is named neither inspected nor missing`, expected: 'every changed path, once' });
  }

  submission.concerns.forEach((concern, index) => {
    concern.locations.forEach((location, at) => {
      const where = `concerns.${index}.locations.${at}`;
      const resolved = resolveSnapshotPath(evidence.snapshot, location.path);
      const deleted = typeof resolveChangedPath(evidence.snapshot, location.path) === 'string';
      if (!(resolved.ok && resolved.kind === 'file') && !deleted) {
        errors.push({ path: `${where}.path`, message: resolved.ok ? `"${location.path}" is a directory` : resolved.text, expected: 'a file of the candidate, or a path it deleted' });
      }
      if (location.startLine !== null && location.endLine !== null && location.endLine < location.startLine) {
        errors.push({ path: `${where}.endLine`, message: 'The range ends before it starts', expected: `at least ${location.startLine}` });
      }
    });
  });

  return errors.length === 0 ? { ok: true, value: submission } : { ok: false, errors };
}

export const orientationToolName = 'submit_orientation';

export const orientationJsonSchema = z.toJSONSchema(orientationSubmissionSchema) as JsonSchema;

export const orientationSubmissionDescription = 'End this orientation: every guidance path you read, and a short account of what the guidance asks of a design. The harness validates it; an invalid submission is returned with every error.';

/** An orientation names exactly the guidance it was given, each path once. */
export function validateOrientation(input: unknown, guidance: readonly string[]): SubmissionValidation<OrientationSubmission> {
  const parsed = orientationSubmissionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: schemaErrors(parsed.error) };
  const errors: SubmissionError[] = [];
  const given = new Set(guidance);
  const named = new Set<string>();
  parsed.data.read.forEach((path, index) => {
    if (!given.has(path)) errors.push({ path: `read.${index}`, message: `"${path}" is not guidance this orientation was given`, expected: `one of: ${guidance.join(', ')}` });
    else if (named.has(path)) errors.push({ path: `read.${index}`, message: `"${path}" is already named`, expected: 'each guidance path once' });
    named.add(path);
  });
  for (const path of guidance) {
    if (!named.has(path)) errors.push({ path: 'read', message: `The guidance path "${path}" is not named`, expected: 'every guidance path the message gives' });
  }
  return errors.length === 0 ? { ok: true, value: parsed.data } : { ok: false, errors };
}
