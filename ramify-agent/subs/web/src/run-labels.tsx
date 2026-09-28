import type { JobState } from '../../harness/src/interfaces/protocol/jobs.js';
import type { LineageMetric, Metric, RunPlanDeviations } from '../../harness/src/interfaces/protocol/runs.js';
import type { SessionReach, ShownSessionState } from '../../harness/src/interfaces/protocol/sessions.js';

/*
 * How a run's states read on the page. Words, never colour alone: each badge
 * carries its state as text.
 */

const stateLabels: Record<JobState, string> = {
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  stopped: 'stopped',
  interrupted: 'interrupted',
};

/** A count with its noun, singular for one: `1 iteration`, `2 iterations`. */
export function counted(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * A run's state, as the log states it. A completed run that recorded plan
 * deviations never reads plainly completed: it is completed with the
 * deviations still to review.
 */
export function RunState({ state, planDeviations }: { readonly state: JobState; readonly planDeviations?: RunPlanDeviations | undefined }) {
  const deviated = state === 'completed' && planDeviations !== undefined && planDeviations.recorded > 0;
  return (
    <span className={`badge run-state run-state-${state}${deviated ? ' run-state-deviated' : ''}`}>
      {deviated ? `completed with ${counted(planDeviations.toReview, 'plan deviation')} to review` : stateLabels[state]}
    </span>
  );
}

/**
 * A session's state as a reader shows it. Interrupted is a session its log
 * leaves live whose harness is gone.
 */
export function SessionState({ state }: { readonly state: ShownSessionState }) {
  return <span className={`badge session-state session-state-${state}`}>{state}</span>;
}

/** The diagram elements a session reaches, in words. */
export function reachText(reach: SessionReach): string {
  switch (reach.kind) {
    case 'run': return 'the run itself';
    case 'work-item': return `work item ${reach.workItem}${reach.capability ? `, capability ${reach.capability}` : ''}${reach.module ? `, module ${reach.module}` : ''}`;
    case 'request': return `request ${reach.request}${reach.capability ? `, capability ${reach.capability}` : ''}${reach.workItem ? `, work item ${reach.workItem}` : ''}`;
    case 'capability-task': return `capability task ${reach.task}${reach.assignment ? `, assignment ${reach.assignment}` : ''}${reach.request ? `, request ${reach.request}` : ''}${reach.module ? `, module ${reach.module}` : ''}`;
    case 'module': return `module ${reach.module}`;
  }
}

/** A progress or work state: todo, working, yielded, completed. */
export function StateBadge({ state }: { readonly state: string }) {
  return <span className={`badge state-${state}`}>{state === 'working' ? 'working on' : state}</span>;
}

/** A number as a metric shows it: unavailable is a word, never a zero. */
export function figure(value: number | null): string {
  if (value === null) return '—';
  return Number.isInteger(value) ? String(value) : value.toPrecision(4);
}

/** A metric's value, or its state where it has none. */
export function metricValue(metric: Metric | LineageMetric): string {
  return metric.state === 'measured' ? figure(metric.value) : metric.state;
}

/**
 * A session's degraded starts, as a badge whose accessible name and title
 * say what happened: the executor was asked to continue or fork the
 * conversation and started a fresh one.
 */
export function DegradedStarts({ count }: { readonly count: number }) {
  const label = count === 1 ? 'degraded start' : `${count} degraded starts`;
  const explanation = `${count === 1 ? 'An invocation' : `${count} invocations`} of this session asked the executor to continue or fork its conversation, and the executor started a fresh one instead.`;
  return <span className="badge degraded-badge" role="img" aria-label={`${label}: ${explanation}`} title={explanation}>{label}</span>;
}
