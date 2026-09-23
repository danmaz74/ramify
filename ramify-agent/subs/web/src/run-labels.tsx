import type { JobState } from '../../harness/src/interfaces/protocol/jobs.js';
import type { LineageMetric, Metric } from '../../harness/src/interfaces/protocol/runs.js';

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
