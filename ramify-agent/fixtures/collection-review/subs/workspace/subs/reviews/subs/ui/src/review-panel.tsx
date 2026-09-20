import { useState } from 'react';
import type { ReactElement } from 'react';
import type { TRPCClient } from '@trpc/client';

import { ReviewResult } from '../subs/pure-ui/src/review-result.js';
import { type AppRouter } from '../../../../../../../src/interfaces/protocol.js';
import type { ReviewResultProps } from '../subs/pure-ui/src/review-result.js';

/**
 * The connected view: the one place in the tree where a view meets the API.
 *
 * `AppRouter` arrives through an inline `type` binding. The statement is an
 * ordinary import that may still initialize its target at runtime, and the
 * binding is a type all the same: this owner needs the router's type to say
 * what client it takes, and needs none of the root's runtime to do it.
 *
 * The loading step is a plain function rather than an effect, which is what
 * lets a Node test drive a real review through a real client and then render
 * what came back.
 */

/**
 * Runs one review and returns exactly what the pure view renders.
 *
 * The client's output type is inferred from the procedure, and the mapping
 * below names none of it: `ReviewOutcome` belongs to the review runtime and
 * stops at the feature that adapts it. What survives that boundary is the
 * neutral vocabulary both shapes are written in.
 */
export async function loadReview(
  client: TRPCClient<AppRouter>,
  recordId: string,
): Promise<ReviewResultProps> {
  const outcome = await client.reviews.run.mutate({ recordId });

  return {
    recordId: outcome.recordId,
    status: outcome.status,
    findings: outcome.findings,
    observations: outcome.observations,
  };
}

interface ReviewPanelProps {
  client: TRPCClient<AppRouter>;
  recordId: string;
}

/** A Review button for one record, and whatever the review answered. */
export function ReviewPanel({ client, recordId }: ReviewPanelProps): ReactElement {
  const [result, setResult] = useState<ReviewResultProps | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const review = (): void => {
    setRunning(true);
    setFailure(null);

    loadReview(client, recordId).then(
      (loaded) => {
        setResult(loaded);
        setRunning(false);
      },
      (reason: unknown) => {
        setFailure(reason instanceof Error ? reason.message : String(reason));
        setRunning(false);
      },
    );
  };

  return (
    <div className="review-panel">
      <button type="button" className="review-panel__run" onClick={review} disabled={running}>
        {running ? 'Reviewing...' : 'Review'}
      </button>

      {failure !== null && (
        <p className="review-panel__failure" role="alert">
          The review could not be run: {failure}
        </p>
      )}

      {result !== null && <ReviewResult {...result} />}
    </div>
  );
}
