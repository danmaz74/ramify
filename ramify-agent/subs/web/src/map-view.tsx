import { useCallback, useEffect, useState } from 'react';
import type { PlanDocument } from '../../harness/src/interfaces/protocol/queries.js';
import type { ReadableRevision, RevisionEntry } from '../../harness/src/interfaces/protocol/maps.js';
import { ClientError, newCommandId, type ProtocolClient } from './client.js';
import { MapDocument } from './map-document.js';
import { revisionLabel } from './mapping.js';
import { Progress } from './progress.js';
import { routeHref } from './routes.js';
import { useQuery } from './use-query.js';

type Sending = { status: 'idle' | 'sending' } | { status: 'failed'; message: string };

/**
 * The Map view: Start mapping for a plan never mapped. Otherwise the latest
 * job's progress, open while it runs or when it did not complete; the saved
 * revisions, each selectable; the chosen revision, the latest by default,
 * with Approve; and Regenerate, which starts a new job.
 */
export function MapView({ client, plan, revision, reload, progressInterval }: {
  readonly client: ProtocolClient;
  readonly plan: PlanDocument;
  /** The revision chosen in the URL; the latest when absent. */
  readonly revision: number | undefined;
  readonly reload: () => void;
  readonly progressInterval: number | undefined;
}) {
  const [start, setStart] = useState<Sending>({ status: 'idle' });
  const mapping = plan.mapping;
  const revisions = useQuery(`revisions:${plan.id}`, () => client.listRevisions(plan.id));
  const reloadRevisions = revisions.reload;
  const latestJob = mapping.state === 'not-mapped' ? undefined : mapping.jobId;
  const latestRevision = mapping.state === 'not-mapped' ? null : mapping.latestRevision;
  // A new job or a newly saved revision changes the list.
  useEffect(() => reloadRevisions(), [latestJob, latestRevision, reloadRevisions]);
  const onEnded = useCallback(() => reload(), [reload]);

  const startMapping = async () => {
    setStart({ status: 'sending' });
    try {
      // A new command ID per press; the client resends the same command if the harness does not answer.
      await client.sendCommand({ commandId: newCommandId(), expectedVersion: 0, type: 'start-mapping', payload: { planId: plan.id } });
      setStart({ status: 'idle' });
      reload();
    } catch (error) {
      setStart({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  };
  const startButton = (label: string, disabled = false) => (
    <p className="map-actions">
      <button type="button" onClick={() => void startMapping()} disabled={disabled || start.status === 'sending'}>
        {start.status === 'sending' ? 'Starting…' : label}
      </button>
      {start.status === 'failed' && <span className="failure" role="alert"> Could not start: {start.message}</span>}
    </p>
  );

  if (mapping.state === 'not-mapped') {
    return (
      <div className="empty" aria-label="Implementation map">
        <p><strong>No implementation map yet.</strong></p>
        <p>An architect agent maps this plan onto the project's module tree. The job runs in the harness, so this page can be closed while it works.</p>
        {startButton('Start mapping')}
      </div>
    );
  }

  const saved = revisions.state.status === 'ready' ? revisions.state.data : [];
  const running = mapping.state === 'running';
  const progress = <Progress client={client} planId={plan.id} jobId={mapping.jobId} interval={progressInterval} onEnded={onEnded} />;
  return (
    <div aria-label="Implementation map">
      {mapping.state === 'completed'
        ? (
          <details className="latest-job">
            <summary>Latest job <code>{mapping.jobId}</code> completed{mapping.latestRevision !== null ? ` and saved revision ${revisionLabel(mapping.latestRevision)}` : ''}. Show its activity.</summary>
            {progress}
          </details>
        )
        : progress}
      {startButton(saved.length > 0 ? 'Regenerate' : 'Start mapping again', running)}
      {revisions.state.status === 'failed' && <p className="failure" role="alert">Could not list the saved maps: {revisions.state.error.message}</p>}
      {revisions.state.status === 'ready' && saved.length === 0 && !running && <p className="muted">No map revision is saved for this plan.</p>}
      {saved.length > 0 && (
        <Revisions client={client} plan={plan} revisions={saved} chosen={revision} onApproved={reloadRevisions} />
      )}
    </div>
  );
}

function revisionStatus(entry: RevisionEntry): string {
  if (entry.status === 'unreadable') return 'unreadable';
  return entry.approval ? 'approved' : 'not approved';
}

function Revisions({ client, plan, revisions, chosen, onApproved }: {
  readonly client: ProtocolClient;
  readonly plan: PlanDocument;
  readonly revisions: readonly RevisionEntry[];
  readonly chosen: number | undefined;
  readonly onApproved: () => void;
}) {
  const latest = revisions[0]!.revision;
  const selected = revisions.find(entry => entry.revision === (chosen ?? latest));
  return (
    <>
      <nav className="revisions" aria-label="Map revisions">
        {revisions.map(entry => (
          <a
            key={entry.revision}
            href={routeHref({ page: 'plan', planId: plan.id, view: 'map', revision: entry.revision })}
            aria-current={entry === selected ? 'page' : undefined}
          >
            Revision {revisionLabel(entry.revision)}{entry.revision === latest ? ' (latest)' : ''} · {revisionStatus(entry)}
          </a>
        ))}
      </nav>
      {!selected && <p className="failure" role="alert">Plan “{plan.id}” has no revision {chosen}.</p>}
      {selected?.status === 'unreadable' && <p className="failure" role="alert"><code>{selected.path}</code> cannot be read: {selected.message}</p>}
      {selected?.status === 'readable' && <RevisionView key={selected.revision} client={client} planId={plan.id} entry={selected} onApproved={onApproved} />}
    </>
  );
}

function RevisionView({ client, planId, entry, onApproved }: {
  readonly client: ProtocolClient;
  readonly planId: string;
  readonly entry: ReadableRevision;
  readonly onApproved: () => void;
}) {
  const { state, reload } = useQuery(`revision:${planId}:${entry.revision}`, () => client.getRevision(planId, entry.revision));
  const { state: tree } = useQuery(`tree:${planId}:${entry.revision}`, () => client.getModuleTree());
  const [approve, setApprove] = useState<Sending | { status: 'refused'; message: string }>({ status: 'idle' });

  const requestApproval = async () => {
    setApprove({ status: 'sending' });
    try {
      // Approve expects the version of the job that saved the revision.
      let expectedVersion = (await client.getJob(planId, entry.jobId)).version;
      for (let attempt = 0; ; attempt++) {
        try {
          await client.sendCommand({ commandId: newCommandId(), expectedVersion, type: 'approve-map', payload: { planId, jobId: entry.jobId, revision: entry.revision } });
          break;
        } catch (failure) {
          if (attempt < 1 && failure instanceof ClientError && failure.code === 'stale-version' && failure.currentVersion !== undefined) {
            expectedVersion = failure.currentVersion;
            continue;
          }
          throw failure;
        }
      }
      setApprove({ status: 'idle' });
      reload();
      onApproved();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      setApprove(failure instanceof ClientError && failure.code === 'inputs-changed' ? { status: 'refused', message } : { status: 'failed', message });
    }
  };

  if (state.status === 'loading') return <p className="muted">Loading revision {revisionLabel(entry.revision)}…</p>;
  if (state.status === 'failed') return <p className="failure" role="alert">Could not load revision {revisionLabel(entry.revision)}: {state.error.message}</p>;
  const saved = state.data;
  return (
    <section className="revision" aria-label={`Revision ${revisionLabel(saved.revision)}`}>
      <header className="revision-header">
        <p><code>{saved.path}</code></p>
        {saved.approval
          ? <p className="approved" role="status" aria-label="Approval">Approved {new Date(saved.approval.approvedAt).toLocaleString()}</p>
          : (
            <p className="approval">
              <span className="muted" role="status" aria-label="Approval">Not approved</span>{' '}
              <button type="button" onClick={() => void requestApproval()} disabled={approve.status === 'sending'}>
                {approve.status === 'sending' ? 'Approving…' : 'Approve'}
              </button>
            </p>
          )}
      </header>
      {approve.status === 'refused' && (
        <p className="failure" role="alert">Approval refused: the plan or the source changed since this map was made. {approve.message}</p>
      )}
      {approve.status === 'failed' && <p className="failure" role="alert">Could not approve: {approve.message}</p>}
      <MapDocument map={saved.map} tree={tree.status === 'ready' ? tree.data : tree.status === 'failed' ? { status: 'unavailable', message: tree.error.message } : undefined} />
    </section>
  );
}
