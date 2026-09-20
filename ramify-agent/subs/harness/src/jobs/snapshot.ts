import type { JobEvent, JobSnapshot, JobState } from '../interfaces/protocol/jobs.js';
import { terminalOf } from './log.js';
import type { JobRecord } from './records.js';

const stateOf: Record<string, JobState> = {
  'job-completed': 'completed',
  'job-failed': 'failed',
  'job-stopped': 'stopped',
  'job-interrupted': 'interrupted',
};

/** A job's snapshot, derived from its `job.json` and its event log and from nothing else. */
export function snapshotOf(record: JobRecord, events: readonly JobEvent[]): JobSnapshot {
  const last = events.at(-1);
  const ended = terminalOf(events);
  const snapshot: JobSnapshot = {
    jobId: record.jobId,
    planId: record.planId,
    agent: record.agent,
    version: events.length,
    state: ended ? stateOf[ended.type]! : 'running',
    stopRequested: false,
    startedAt: record.createdAt,
    updatedAt: last?.at ?? record.createdAt,
    endedAt: ended?.at ?? null,
    inputs: {
      planHash: record.manifest.planHash,
      source: record.manifest.source,
      architectView: record.manifest.architectView.status,
    },
    revision: null,
    failure: null,
    totals: { filesRead: 0, searches: 0, rejectedSubmissions: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  };
  const { totals } = snapshot;
  for (const event of events) {
    switch (event.type) {
      case 'stop-requested':
        snapshot.stopRequested = !ended;
        break;
      case 'map-validated':
      case 'job-completed':
        snapshot.revision = event.data.revision;
        break;
      case 'job-failed':
        snapshot.failure = { reason: event.data.reason, message: event.data.message };
        break;
      case 'submission-rejected':
        totals.rejectedSubmissions++;
        break;
      case 'activity': {
        const { activity } = event.data;
        if (activity.kind === 'read') totals.filesRead++;
        else if (activity.kind === 'search') totals.searches++;
        else if (activity.kind === 'message' && activity.usage) {
          for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'total'] as const) totals.usage[key] += activity.usage[key];
        }
        break;
      }
      default:
        break;
    }
  }
  return snapshot;
}
