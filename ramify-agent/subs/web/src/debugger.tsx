import { useCallback, useEffect, useState } from 'react';
import type {
  BreakpointState, DebugExchange, DebugInspection, DebugIntervention, DebugStateResponse, RunSnapshot,
} from '../../harness/src/interfaces/protocol/runs.js';
import { ClientError, newCommandId, type ProtocolClient } from './client.js';
import { chapterHref } from './routes.js';
import { RunState } from './run-labels.js';

/*
 * The Debugger area of a run started with a breakpoint. It shows what the
 * harness publishes: the current breakpoint interaction, the prepared input
 * on request, and every intervention in log order. It sends the commands the
 * CLI sends, each with a fresh command ID and the current pause ID and
 * revision, and shows every refusal as the harness states it. Stop stays in
 * the Overview.
 */

/** The words of the header badge and the banner while the run is paused. */
export const pausedLabel = 'Paused at a breakpoint';

export interface DebugStateProgress {
  /** The last debug state read; it stays shown when a later read fails. */
  readonly debug: DebugStateResponse | undefined;
  /** The last failure to read the debug state. */
  readonly error: Error | undefined;
  /** Reads the debug state again now, as after a command or a refusal. */
  readonly refresh: () => void;
}

/**
 * The debug state of a run started with a breakpoint, read now and then
 * every `interval` milliseconds while the run runs. A failed read keeps the
 * last state and the next tick reads again. An ended run is read once, so
 * its retained conversation and terminal state show. A run without a
 * breakpoint is never read.
 */
export function useDebugState(client: ProtocolClient, planId: string, runId: string, run: RunSnapshot | undefined, interval = 1000): DebugStateProgress {
  const key = `${planId}/${runId}`;
  const enabled = run !== undefined && run.breakpoint !== null;
  const running = run?.state === 'running';
  const [generation, setGeneration] = useState(0);
  const refresh = useCallback(() => setGeneration(value => value + 1), []);
  const [progress, setProgress] = useState<{ key: string; debug: DebugStateResponse | undefined; error: Error | undefined }>({ key: '', debug: undefined, error: undefined });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const debug = await client.getDebugState(planId, runId);
        if (cancelled) return;
        setProgress({ key, debug, error: undefined });
        if (debug.run.state !== 'running') return;
      } catch (error) {
        if (cancelled) return;
        setProgress(last => ({ key, debug: last.key === key ? last.debug : undefined, error: error instanceof Error ? error : new Error(String(error)) }));
      }
      timer = setTimeout(() => void poll(), interval);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, planId, runId, interval, key, enabled, running, generation]);
  return progress.key === key ? { debug: progress.debug, error: progress.error, refresh } : { debug: undefined, error: undefined, refresh };
}

/** The Run page's banner while the run is paused: it names the pause and opens the Debugger area. */
export function DebugPauseBanner({ current, onOpen }: { readonly current: BreakpointState; readonly onOpen: () => void }) {
  return (
    <section className="debug-banner" role="status" aria-label={pausedLabel}>
      <p>
        <strong>{pausedLabel}.</strong> {current.summary}{' '}
        <span className="muted">(pause <code>{current.pauseId}</code>, revision {current.revision})</span>{' '}
        <button type="button" className="link" onClick={onOpen}>Open the Debugger</button>
      </p>
    </section>
  );
}

/** The header's badge while the run is paused. */
export function DebugPauseBadge() {
  return <span className="badge debug-paused">{pausedLabel}</span>;
}

export function DebuggerArea({ client, run, debug, error, onChanged }: {
  readonly client: ProtocolClient;
  readonly run: RunSnapshot;
  readonly debug: DebugStateResponse | undefined;
  readonly error: Error | undefined;
  /** Reads the run and the debug state again, after every command and refusal. */
  readonly onChanged: () => void;
}) {
  const current = debug?.current ?? null;
  return (
    <div className="area debugger" aria-label="Debugger">
      <StatePanel run={run} debug={debug} error={error} />
      <PreparedInput client={client} run={run} current={current} />
      <Conversation run={run} interventions={debug?.interventions ?? []} />
      <Composer client={client} run={run} current={current} onChanged={onChanged} />
    </div>
  );
}

// State

function StatePanel({ run, debug, error }: { readonly run: RunSnapshot; readonly debug: DebugStateResponse | undefined; readonly error: Error | undefined }) {
  const current = debug?.current ?? null;
  return (
    <section className="panel" aria-labelledby="debug-state-heading">
      <h2 id="debug-state-heading">Breakpoint state</h2>
      <p className="muted">This run stops before each engineer starts. Stop stays in the Overview; this area does not stop the run.</p>
      {error && (
        <p className="failure" role="alert">
          The debugger state could not be read: {error.message}. {debug ? 'What is shown is the last state read. ' : ''}The next interval reads it again.
        </p>
      )}
      <p className="debug-state-line">{stateText(run, debug, current)}</p>
      {run.state !== 'running' && <p>Terminal state: <RunState state={run.state} planDeviations={run.planDeviations} /></p>}
      {current && (
        <>
          <PauseFacts current={current} />
          <p className="debug-summary" aria-label="Harness summary">{current.summary}</p>
        </>
      )}
    </section>
  );
}

function stateText(run: RunSnapshot, debug: DebugStateResponse | undefined, current: BreakpointState | null): string {
  if (run.state !== 'running') return `The run has ended: it is ${run.state}. The conversation below stays readable.`;
  if (debug === undefined) return 'Reading the debugger state…';
  if (current === null) return 'The run is working toward its next breakpoint.';
  switch (current.state) {
    case 'pausing': return 'The run is pausing: admitted work settles before the pause.';
    case 'paused': return 'The run is paused before the engineer starts.';
    case 'exchanging': return 'An exchange is in progress: the engineer is answering a message.';
  }
}

function PauseFacts({ current }: { readonly current: BreakpointState }) {
  const { work } = current;
  return (
    <dl className="facts" aria-label="Pause facts">
      <div><dt>Role</dt><dd>{current.role}</dd></div>
      {work.workItem && <div><dt>Work item</dt><dd>{work.workItem}</dd></div>}
      {work.iteration && <div><dt>Iteration</dt><dd>{work.iteration}</dd></div>}
      {work.request && <div><dt>Request</dt><dd>{work.request}</dd></div>}
      {work.capabilityTask && <div><dt>Capability task</dt><dd>{work.capabilityTask}</dd></div>}
      {work.nonfunctionalRepair && <div><dt>Nonfunctional repair</dt><dd>{work.nonfunctionalRepair}</dd></div>}
      <div><dt>Goal</dt><dd>{current.goal}</dd></div>
      <div><dt>Next action</dt><dd>{current.nextAction}</dd></div>
      <div><dt>Task state</dt><dd>{current.taskState}</dd></div>
      <div><dt>Pause ID</dt><dd><code>{current.pauseId}</code></dd></div>
      <div><dt>Revision</dt><dd>{current.revision}</dd></div>
    </dl>
  );
}

// Prepared input

type InspectionState =
  | { readonly status: 'idle' | 'reading' }
  | { readonly status: 'ready'; readonly inspection: DebugInspection }
  | { readonly status: 'failed'; readonly message: string };

function PreparedInput({ client, run, current }: { readonly client: ProtocolClient; readonly run: RunSnapshot; readonly current: BreakpointState | null }) {
  const [state, setState] = useState<InspectionState>({ status: 'idle' });
  const [last, setLast] = useState<DebugInspection | undefined>(undefined);
  const read = async () => {
    if (current === null) return;
    setState({ status: 'reading' });
    try {
      const answer = await client.getDebugInspection(run.planId, run.jobId, current.pauseId);
      setLast(answer.inspection);
      setState({ status: 'ready', inspection: answer.inspection });
    } catch (error) {
      setState({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  };
  const preview = state.status === 'ready' ? state.inspection : last;
  const historical = preview !== undefined && (current === null || current.pauseId !== preview.pauseId || current.revision !== preview.revision);
  const canRead = run.state === 'running' && current !== null && state.status !== 'reading';
  return (
    <section className="panel" aria-labelledby="debug-input-heading">
      <header className="page-header">
        <h2 id="debug-input-heading">Prepared input</h2>
        <button type="button" onClick={() => void read()} disabled={!canRead}>
          {state.status === 'reading' ? 'Reading…' : preview ? 'Read the prepared input again' : 'Read the prepared input'}
        </button>
      </header>
      <p className="muted">A preview of the input the harness prepared for the engineer, read only on request. It is not evidence of what the engineer received.</p>
      {state.status === 'failed' && <p className="failure" role="alert">The prepared input could not be read: {state.message}</p>}
      {preview && (
        <div className="debug-preview" aria-label="Prepared input preview">
          <p>
            Read at pause <code>{preview.pauseId}</code>, revision {preview.revision}.
            {historical && (
              <strong className="debug-historical">
                {' '}This preview is historical: {current === null ? 'there is no current pause' : `the current pause is ${current.pauseId} at revision ${current.revision}`}. Read it again for the current input.
              </strong>
            )}
          </p>
          <InspectionSections inspection={preview} />
        </div>
      )}
    </section>
  );
}

function InspectionSections({ inspection }: { readonly inspection: DebugInspection }) {
  const { input } = inspection;
  return (
    <>
      <details><summary>Role instructions</summary><pre className="debug-text">{input.roleInstructions}</pre></details>
      <details><summary>Task message</summary><pre className="debug-text">{input.message}</pre></details>
      <InputBlocks title="Inherited blocks" blocks={input.inherited} />
      <InputBlocks title="Current additions" blocks={input.additions} />
      <InputBlocks title="Effective blocks" blocks={input.effective} />
      <details>
        <summary>Tools ({input.tools.length})</summary>
        <ul className="debug-tools">
          {input.tools.map(tool => (
            <li key={tool.name}><code>{tool.name}</code> <span className="badge">{tool.mutating ? 'mutating' : 'read-only'}</span> {tool.description}</li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Continuity</summary>
        <p>{input.continuity}{input.continuityReason ? `: ${input.continuityReason}` : ''}</p>
      </details>
      <details><summary>Source point</summary><p>{input.source === null ? 'none' : <code>{input.source}</code>}</p></details>
      <details><summary>Scope</summary><pre>{JSON.stringify(input.scope, null, 2)}</pre></details>
      <details><summary>Bounds</summary><pre>{JSON.stringify(input.bounds, null, 2)}</pre></details>
    </>
  );
}

function InputBlocks({ title, blocks }: { readonly title: string; readonly blocks: DebugInspection['input']['inherited'] }) {
  return (
    <details>
      <summary>{title} ({blocks.length})</summary>
      {blocks.length === 0 ? <p className="muted">None.</p> : (
        <ul className="debug-blocks">
          {blocks.map((block, index) => (
            <li key={`${block.key}-${index}`}>
              <code>{block.key}</code>{' '}
              <span className="muted">
                {block.kind}{block.source ? ` · ${block.source}` : ''}{block.revision ? ` · revision ${block.revision}` : ''}{block.block ? ` · ${block.block.effect} ${block.block.key}` : ''}
              </span>
              <pre className="debug-text">{block.text}</pre>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

// Conversation

function Conversation({ run, interventions }: { readonly run: RunSnapshot; readonly interventions: readonly DebugIntervention[] }) {
  return (
    <section className="panel" aria-labelledby="debug-conversation-heading">
      <h2 id="debug-conversation-heading">Conversation</h2>
      {interventions.length === 0 ? <p className="muted">No message or resume yet.</p> : (
        <ol className="debug-conversation" aria-label="Interventions">
          {interventions.map(entry => (
            <li key={entry.sequence} className={`debug-entry debug-entry-${entry.kind}`}>
              <p className="muted">
                {entry.kind === 'message' ? 'Message' : 'Resume'} at pause <code>{entry.pauseId}</code>, revision {entry.revision} · <time dateTime={entry.at}>{entry.at}</time>
              </p>
              {entry.kind === 'message'
                ? (
                  <>
                    <p className="debug-text debug-person">{entry.message}</p>
                    {entry.exchange ? <Exchange run={run} exchange={entry.exchange} /> : <p className="muted">The exchange result is not available.</p>}
                  </>
                )
                : (
                  <>
                    <p><strong>Resumed</strong>{entry.message === null ? ' without a message.' : ', with this message:'}</p>
                    {entry.message !== null && <p className="debug-text debug-person">{entry.message}</p>}
                  </>
                )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Exchange({ run, exchange }: { readonly run: RunSnapshot; readonly exchange: DebugExchange }) {
  const transcript = exchange.session !== null && exchange.invocation !== null
    ? chapterHref({ source: 'run', planId: run.planId, runId: run.jobId, session: exchange.session }, exchange.invocation)
    : undefined;
  return (
    <div className={`debug-exchange debug-exchange-${exchange.status}`}>
      {exchange.status === 'admitted' && <p className="muted">The engineer is answering.</p>}
      {(exchange.status === 'stopped' || exchange.status === 'interrupted') && (
        <p className="failure">The exchange was {exchange.status}{exchange.error ? `: ${exchange.error}` : '.'}</p>
      )}
      {exchange.status === 'settled' && (
        <>
          <p><strong>The engineer answered:</strong></p>
          <p className="debug-text debug-answer">{exchange.answer ?? ''}</p>
          {exchange.verdicts.length > 0 && (
            <ul className="debug-verdicts" aria-label="Verdicts">
              {exchange.verdicts.map((verdict, index) => (
                <li key={index}><span className={`badge ${verdict.accepted ? 'state-completed' : 'state-failed'}`}>{verdict.accepted ? 'accepted' : 'rejected'}</span> {verdict.answer}</li>
              ))}
            </ul>
          )}
          <dl className="facts">
            {exchange.outcome !== null && <div><dt>Outcome</dt><dd>{exchange.outcome}</dd></div>}
            {exchange.error !== null && <div><dt>Error</dt><dd>{exchange.error}</dd></div>}
            {exchange.continuityLoss !== null && <div><dt>Continuity loss</dt><dd>{exchange.continuityLoss}</dd></div>}
            {exchange.settlementConfirmed !== undefined && <div><dt>Settlement confirmed</dt><dd>{exchange.settlementConfirmed ? 'yes' : 'no'}</dd></div>}
          </dl>
        </>
      )}
      {transcript && <p><a href={transcript}>Open the transcript chapter ({exchange.invocation})</a></p>}
    </div>
  );
}

// Composer

type SendState =
  | { readonly status: 'idle' | 'sending' }
  | { readonly status: 'refused'; readonly what: string; readonly message: string }
  | { readonly status: 'lost'; readonly what: string; readonly commandId: string };

function Composer({ client, run, current, onChanged }: {
  readonly client: ProtocolClient;
  readonly run: RunSnapshot;
  readonly current: BreakpointState | null;
  readonly onChanged: () => void;
}) {
  const [text, setText] = useState('');
  const [send, setSend] = useState<SendState>({ status: 'idle' });
  const paused = run.state === 'running' && current !== null && current.state === 'paused';
  const idle = send.status !== 'sending';
  const canSend = idle && paused && current?.taskState === 'pending';
  const canResume = idle && paused;

  const submit = async (kind: 'message' | 'resume') => {
    if (current === null) return;
    const commandId = newCommandId();
    const identity = { planId: run.planId, jobId: run.jobId, pauseId: current.pauseId, expectedRevision: current.revision };
    const what = kind === 'message' ? 'message' : 'resume';
    setSend({ status: 'sending' });
    try {
      if (kind === 'message') {
        await client.sendCommand({ commandId, expectedVersion: 0, type: 'debug-message', payload: { ...identity, message: text } });
      } else {
        const message = text.trim() === '' ? {} : { message: text };
        await client.sendCommand({ commandId, expectedVersion: 0, type: 'debug-resume', payload: { ...identity, ...message } });
      }
      setText('');
      setSend({ status: 'idle' });
    } catch (error) {
      if (error instanceof ClientError && error.kind === 'connection') setSend({ status: 'lost', what, commandId });
      else setSend({ status: 'refused', what, message: error instanceof Error ? error.message : String(error) });
    }
    onChanged();
  };

  return (
    <section className="panel" aria-labelledby="debug-composer-heading">
      <h2 id="debug-composer-heading">Message or resume</h2>
      <form className="debug-composer" aria-label="Debugger composer" onSubmit={event => { event.preventDefault(); if (canSend) void submit('message'); }}>
        <textarea name="message" aria-label="Message to the engineer" rows={4} value={text} onChange={event => setText(event.target.value)} disabled={run.state !== 'running'} />
        <div className="debug-composer-actions">
          <button type="submit" disabled={!canSend}>Send message</button>
          <button type="button" onClick={() => void submit('resume')} disabled={!canResume}>Resume</button>
        </div>
      </form>
      <p className="muted">
        Send message needs a paused engineer with a pending task. Resume releases the pause and carries the text above as its message when there is any.
      </p>
      {send.status === 'refused' && <p className="failure" role="alert">The {send.what} was refused: {send.message}</p>}
      {send.status === 'lost' && (
        <p className="failure" role="alert">
          No reply arrived for the {send.what}, command <code>{send.commandId}</code>. The command may have been admitted; the next read shows it.
        </p>
      )}
    </section>
  );
}
