import { createContext, useContext, useEffect, useState } from 'react';
import type { PlanDecisionWait } from '../../harness/src/interfaces/protocol/queries.js';
import type { RunDecisionRequests } from '../../harness/src/interfaces/protocol/runs.js';
import type { ProtocolClient } from './client.js';
import { routeHref } from './routes.js';

/*
 * A run that waits for a person's decision, shown wherever a person looks
 * at runs. A request for a person's decision holds its work item, and the
 * run with it, until a person answers, with no time limit, so a waiting run
 * must never look like a slow one. It is its own state, apart from a
 * running run, a failure and a risk level: a risk level asks nobody
 * anything, and a decision request is a question for the person.
 *
 * The harness states which runs and work items wait; nothing here derives
 * it. The header reads the plan list on an interval, so every page and a
 * background tab's title show a waiting run until a notification exists.
 */

/** The words every mark of a waiting run carries. */
export const waitingLabel = 'Waiting for your decision';

/** The prefix of the document title while a run waits for the person. */
export const waitingTitlePrefix = `${waitingLabel} · `;

/** A waiting run's or work item's badge: words, never colour alone. */
export function DecisionWaitBadge({ title }: { readonly title?: string }) {
  return <span className="badge awaiting-decision" title={title}>{waitingLabel}</span>;
}

/** A waiting run of a plan, as the plan list names it. */
export interface DecisionWait extends PlanDecisionWait {
  readonly planId: string;
}

/**
 * Every run of every plan that waits for the person's decision, read from
 * the plan list now and then every `interval` milliseconds. A failed read
 * keeps what was last read: the connection line reports the harness.
 */
export function useDecisionWaits(client: ProtocolClient, interval = 5000): readonly DecisionWait[] {
  const [waits, setWaits] = useState<readonly DecisionWait[]>([]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const plans = await client.listPlans();
        if (!cancelled) setWaits(plans.flatMap(plan => plan.waitingForDecision.map(wait => ({ ...wait, planId: plan.id }))));
      } catch {
        // What was last read stays shown.
      }
      if (cancelled) return;
      timer = setTimeout(() => void poll(), interval);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, interval]);
  return waits;
}

/** The header's mark: each waiting run, linked to its page. Nothing while none waits. */
export function HeaderDecisionWaits({ waits }: { readonly waits: readonly DecisionWait[] }) {
  if (waits.length === 0) return null;
  return (
    <p className="header-decision-waits" role="status" aria-label={waitingLabel}>
      {waits.map(wait => (
        <a key={`${wait.planId}/${wait.runId}`} className="header-decision-wait" href={routeHref({ page: 'run', planId: wait.planId, runId: wait.runId })}>
          {waitingLabel}: run <code>{wait.runId}</code> of {wait.planId}, {workItemsText(wait.workItems)}
        </a>
      ))}
    </p>
  );
}

/** Work items named in words: `work item wi-001`, `work items wi-001, wi-002`. */
export function workItemsText(workItems: readonly string[]): string {
  return `${workItems.length === 1 ? 'work item' : 'work items'} ${workItems.join(', ')}`;
}

/** Which decision request a page was asked to bring into view, once. */
export interface DecisionFocus {
  readonly request: string | null;
  /** Called by the request once it is in view, so a later render does not scroll again. */
  readonly done: () => void;
}

export const DecisionFocusContext = createContext<DecisionFocus>({ request: null, done: () => undefined });

export function useDecisionFocus(): DecisionFocus {
  return useContext(DecisionFocusContext);
}

/**
 * The Run page's banner while the run waits for the person: it names each
 * work item held and its requests, and opens each one's answer form.
 */
export function DecisionBanner({ requests, onOpen }: {
  readonly requests: RunDecisionRequests;
  /** Opens the work item and brings the request's form into view. */
  readonly onOpen: (workItem: string, request: string) => void;
}) {
  if (!requests.waiting) return null;
  return (
    <section className="decision-banner" role="status" aria-label={waitingLabel}>
      <p>
        <strong>{waitingLabel}.</strong> This run is held until you answer: its work items wait before their gates and nothing
        else advances. There is no time limit.
      </p>
      <ul>
        {requests.workItems.map(item => (
          <li key={item.workItem}>
            Work item <strong>{item.workItem}</strong>:{' '}
            {item.requests.map((entry, index) => (
              <span key={entry.request}>
                {index > 0 ? ', ' : ''}
                <button type="button" className="link" onClick={() => onOpen(item.workItem, entry.request)}>
                  answer {entry.request}
                </button>
                {' '}<span className="muted">(CheckFinding {entry.checkFinding})</span>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
