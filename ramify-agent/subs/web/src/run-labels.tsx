import type { JobState } from '../../harness/src/interfaces/protocol/jobs.js';
import type { LineageMetric, Metric } from '../../harness/src/interfaces/protocol/runs.js';
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

/** A run's state, as the log states it. */
export function RunState({ state }: { readonly state: JobState }) {
  return <span className={`badge run-state run-state-${state}`}>{stateLabels[state]}</span>;
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
