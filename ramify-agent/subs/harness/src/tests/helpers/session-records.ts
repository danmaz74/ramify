import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { runLayout } from '../../run/records.js';
import { runEventsOnDisk } from './runs.js';

/*
 * Where a `session`'s records are: its manual run, under
 * `plans/sessions/.harness/jobs/<session>/`, in a run's own layout, with
 * the session as its one invocation.
 */

/** The paths of a session's records: its manual run's one invocation, in a run's layout. */
export async function recordsOf(records: string) {
  const [invocation, ...others] = await readdir(join(records, 'invocations'));
  if (invocation === undefined || others.length > 0) throw new Error(`the session's manual run holds ${others.length + (invocation === undefined ? 0 : 1)} invocations`);
  const at = (path: string) => join(records, path);
  const started = (await runEventsOnDisk(join(records, '..', '..', '..', '..', '..'), 'sessions', basename(records))).find(event => event.type === 'invocation-started');
  const session = started?.type === 'invocation-started' ? started.data.session : '';
  return {
    invocation,
    session,
    record: at(runLayout.invocation(invocation)),
    outcome: at(runLayout.outcome(invocation)),
    observations: at(runLayout.observations(invocation)),
    submission: at(runLayout.submission(invocation)),
    summary: at(runLayout.stepSummary(invocation)),
    diagnosis: at(runLayout.diagnosis(invocation)),
    shell: at(join('invocations', invocation, 'shell')),
    hooks: at(join('invocations', invocation, 'hooks')),
    transcript: at(runLayout.transcript(session)),
    blobs: at(runLayout.blobs),
  };
}

