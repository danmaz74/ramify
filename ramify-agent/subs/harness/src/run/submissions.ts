import { z } from 'zod';
import type { SubmissionVerdict } from '../../subs/agent/src/interfaces/port.js';
import type { ObservationLog } from './observations.js';

/*
 * Everything an agent tells the harness is validated JSON, and this is the
 * one place that answers an invalid one. An iteration supplies a strict
 * schema and the rules the schema cannot hold; it cannot omit the rest.
 *
 * A failure changes nothing. Every error, each naming its path and what was
 * expected, goes back to the same session as the tool's error result, as
 * JSON, with a closing request to correct them and call the tool again.
 * Retries are bounded per turn, each rejection is an observation with its
 * errors, and exhaustion ends the invocation as `invalid-submission`, which
 * is distinct from a failure of the agent.
 *
 * Free text from an agent is never parsed for meaning, and no schema has a
 * field for an ID the harness already knows.
 */

/** One error of one rejected input: where it is and what was expected there. */
export interface SubmissionError {
  readonly path: string;
  readonly message: string;
  readonly expected?: string | undefined;
}

/** What validating one input decided. A failure carries every error of the attempt. */
export type SubmissionValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly SubmissionError[] };

/** How many errors one answer names before it states the total instead. */
export const maximumReportedErrors = 20;

/** Every schema error of one input, each with its path and what was expected. */
export function schemaErrors(error: z.ZodError): SubmissionError[] {
  return error.issues.map(issue => ({
    path: issue.path.length === 0 ? '(root)' : issue.path.map(String).join('.'),
    message: issue.message,
    ...('expected' in issue && typeof issue.expected === 'string' ? { expected: issue.expected } : {}),
  }));
}

/** Validates one input against a strict schema, answering every error at once. */
export function validateAgainst<T>(schema: z.ZodType<T>, input: unknown): SubmissionValidation<T> {
  const parsed = schema.safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, errors: schemaErrors(parsed.error) };
}

/**
 * The answer one rejected input receives: JSON, every error with its path,
 * capped with the total stated, and a closing request to correct and retry.
 * It is the tool's error result, so the same session corrects itself.
 */
export function rejectionAnswer(errors: readonly SubmissionError[], remainingAttempts: number): string {
  const reported = errors.slice(0, maximumReportedErrors);
  const answer = {
    accepted: false,
    errors: reported.map(error => ({ path: error.path, message: error.message, ...(error.expected === undefined ? {} : { expected: error.expected }) })),
    ...(errors.length > reported.length ? { totalErrors: errors.length } : {}),
    remainingAttempts,
  };
  const closing = remainingAttempts > 0
    ? 'Correct every error above and call the tool again.'
    : 'No further attempts are accepted; this invocation has ended as invalid-submission.';
  return `${JSON.stringify(answer, null, 2)}\n\n${closing}`;
}

/** What a judge does with an input it accepted. */
export type AcceptInput<T> = (value: T) => Promise<void>;

export interface SubmissionJudgeOptions<T> {
  /** The tool the input came through: the submission tool's name, or a harness tool's. */
  readonly target: string;
  /** How many rejected inputs are answered with their errors before the bound is reached. */
  readonly bound: number;
  readonly validate: (input: unknown) => Promise<SubmissionValidation<T>> | SubmissionValidation<T>;
  /** Applied only to an accepted input, and only once. */
  readonly accept: AcceptInput<T>;
  readonly observations: ObservationLog;
  /** What the agent is told when its input is accepted; without it the implementation's own acknowledgement is used. */
  readonly acceptedText?: ((value: T) => string) | undefined;
  /** Refuses further inputs, such as after a stop; its text is the final answer. */
  readonly closed?: (() => string | undefined) | undefined;
}

/**
 * One turn's judge. It counts every rejection, including the ones the agent
 * implementation made itself before the input reached the harness, so no
 * rejection escapes the bound.
 */
export class SubmissionJudge<T> {
  private attemptCount = 0;
  private rejectionCount = 0;
  private reached = false;
  private accepted = false;

  constructor(private readonly options: SubmissionJudgeOptions<T>) {}

  get attempts(): number {
    return this.attemptCount;
  }

  get rejections(): number {
    return this.rejectionCount;
  }

  /** Whether the bound was reached, which ends the invocation as `invalid-submission`. */
  get boundReached(): boolean {
    return this.reached;
  }

  get wasAccepted(): boolean {
    return this.accepted;
  }

  /**
   * One input the implementation rejected before the tool ran. It counts
   * toward the same bound and is recorded as a rejection with the reason,
   * which is the implementation's, not a reading of its message text.
   */
  countImplementationRejection(callId: string, tool: string, reason: string): () => Promise<void> {
    this.attemptCount += 1;
    this.rejectionCount += 1;
    const attempt = this.attemptCount;
    if (this.attemptCount > this.options.bound) this.reached = true;
    // The port callback cannot await this append. The count is immediate so a
    // following submission sees it; the recorder invokes the returned write
    // in the same ordered queue as the implementation's other observations.
    return async () => {
      await this.options.observations.record({
        type: 'rejection',
        data: {
          callId,
          target: tool,
          attempt,
          errors: [{ path: '(input)', message: reason }],
        },
      });
    };
  }

  /** Judges one input that reached the harness. Nothing changes unless it is accepted. */
  async judge(input: unknown, callId = ''): Promise<SubmissionVerdict> {
    const closedText = this.options.closed?.();
    if (closedText !== undefined) return { accepted: false, final: true, errors: [closedText] };
    if (this.accepted) return { accepted: false, final: true, errors: ['This invocation has already submitted a result.'] };

    this.attemptCount += 1;
    const attempt = this.attemptCount;
    const result = await this.options.validate(input);
    if (result.ok) {
      await this.options.accept(result.value);
      this.accepted = true;
      const text = this.options.acceptedText?.(result.value);
      return text === undefined ? { accepted: true } : { accepted: true, text };
    }

    this.rejectionCount += 1;
    await this.options.observations.record({
      type: 'rejection',
      data: {
        callId,
        target: this.options.target,
        attempt,
        errors: result.errors.slice(0, maximumReportedErrors).map(error => ({ path: error.path, message: error.message })),
      },
    });
    const remaining = Math.max(0, this.options.bound - attempt);
    if (remaining === 0) {
      this.reached = true;
      return { accepted: false, final: true, errors: [rejectionAnswer(result.errors, 0)] };
    }
    return { accepted: false, errors: [rejectionAnswer(result.errors, remaining)] };
  }
}

/**
 * The same rule for a harness tool's input. A tool is not a submission: a
 * rejected input is answered with every error and its path, the tool changes
 * nothing, and the session goes on. The bound is its own, and reaching it
 * ends the invocation as `invalid-submission`, exactly as a submission's
 * does.
 */
export class ToolInputJudge<T> {
  private attemptCount = 0;
  private reached = false;

  constructor(private readonly options: {
    readonly tool: string;
    readonly bound: number;
    readonly validate: (input: unknown) => SubmissionValidation<T>;
    readonly observations: ObservationLog;
  }) {}

  get rejections(): number {
    return this.attemptCount;
  }

  /** Whether the bound was reached, which ends the invocation as `invalid-submission`. */
  get exhausted(): boolean {
    return this.reached;
  }

  async judge(input: unknown, callId = ''): Promise<{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly text: string }> {
    const result = this.options.validate(input);
    if (result.ok) return result;
    this.attemptCount += 1;
    await this.options.observations.record({
      type: 'rejection',
      data: {
        callId,
        target: this.options.tool,
        attempt: this.attemptCount,
        errors: result.errors.slice(0, maximumReportedErrors).map(error => ({ path: error.path, message: error.message })),
      },
    });
    const remaining = Math.max(0, this.options.bound - this.attemptCount);
    if (remaining === 0) this.reached = true;
    return { ok: false, text: rejectionAnswer(result.errors, remaining) };
  }
}
