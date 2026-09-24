import { createContext, useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { sessionQueryLimits, type RunSessionView, type SessionBodyResponse, type SessionRef } from '../../harness/src/interfaces/protocol/sessions.js';
import type {
  TranscriptAssistantBlock, TranscriptBody, TranscriptContentBlock, TranscriptEntry, TranscriptEntryOf, TranscriptHarnessDecision,
  TranscriptMessageDetail, TranscriptPoint, TranscriptToolAction,
} from '../../harness/src/interfaces/protocol/transcripts.js';
import type { ProtocolClient } from './client.js';
import { pointHref, sessionHref, sessionKey } from './routes.js';

/*
 * A transcript's entries, in order. Every block shows its header; its body
 * is shown on expansion. Thinking, file contents, tool input and output, the
 * system prompt, the first prompt and appended texts are collapsed by
 * default, and so is a long or stored text. A stored or file body is fetched
 * from the harness on its first expansion and kept for the page; an inline
 * body needs no request.
 */

type ToolCall = Extract<TranscriptAssistantBlock, { type: 'tool-call' }>;
type Usage = Extract<TranscriptEntryOf<'message'>, { role: 'assistant' }>['usage'];
type Range = NonNullable<Extract<TranscriptToolAction, { kind: 'read' }>['range']>;

/** Text shown open by default: inline and at most this many characters. */
const openTextCharacters = 2000;

// Bodies

interface BodySource {
  load(body: TranscriptBody): Promise<SessionBodyResponse>;
}

const BodyContext = createContext<BodySource | null>(null);

function bodyKey(body: TranscriptBody): string {
  switch (body.stored) {
    case 'inline': return 'inline';
    case 'blob': return `blob:${body.hash}`;
    case 'file': return `file:${body.path}`;
  }
}

/** The page's bodies: each stored or file body is requested once, and again only after a failure. */
function useBodySource(client: ProtocolClient, session: SessionRef): BodySource {
  return useMemo(() => {
    const loaded = new Map<string, Promise<SessionBodyResponse>>();
    return {
      load: body => {
        const key = bodyKey(body);
        let answer = loaded.get(key);
        if (answer === undefined) {
          answer = client.getBody(session, body);
          loaded.set(key, answer);
          answer.catch(() => loaded.delete(key));
        }
        return answer;
      },
    };
  // The session's key names it; its object is new on every render.
  }, [client, sessionKey(session)]);
}

export function bytesText(bytes: number | null): string {
  if (bytes === null) return 'size unknown';
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function bodyBytes(body: TranscriptBody): number | null {
  return body.bytes;
}

/** A body's first line, where it is known without a request. */
function previewOf(body: TranscriptBody): string {
  if (body.stored === 'blob') return body.preview;
  if (body.stored === 'inline') {
    const line = body.text.split('\n').find(candidate => candidate.trim() !== '') ?? '';
    return line.length > 120 ? `${line.slice(0, 119)}…` : line;
  }
  return '';
}

function Plain({ content }: { readonly content: string }) {
  return <pre className="body-text">{content}</pre>;
}

/** A body's content: at once where it is inline, otherwise fetched when it is first shown. */
function BodyContent({ body, render = content => <Plain content={content} /> }: {
  readonly body: TranscriptBody;
  readonly render?: (content: string) => ReactNode;
}) {
  const source = useContext(BodyContext)!;
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; data: SessionBodyResponse } | { status: 'failed'; error: string }>(
    () => body.stored === 'inline' ? { status: 'ready', data: { content: body.text, bytes: body.bytes, truncated: false } } : { status: 'loading' },
  );
  const [attempt, setAttempt] = useState(0);
  const key = bodyKey(body);
  useEffect(() => {
    if (body.stored === 'inline') return;
    let current = true;
    setState({ status: 'loading' });
    source.load(body).then(
      data => { if (current) setState({ status: 'ready', data }); },
      (error: unknown) => { if (current) setState({ status: 'failed', error: error instanceof Error ? error.message : String(error) }); },
    );
    return () => { current = false; };
  // A body is named by its key.
  }, [source, key, attempt]);
  if (state.status === 'loading') return <p className="muted" role="status">Loading the body…</p>;
  if (state.status === 'failed') {
    return (
      <p className="failure" role="alert">
        Could not load the body: {state.error}{' '}
        <button type="button" className="link" onClick={() => setAttempt(value => value + 1)}>Try again</button>
      </p>
    );
  }
  return (
    <>
      {render(state.data.content)}
      {state.data.truncated && <p className="warn">Only the first {bytesText(sessionQueryLimits.bodyBytes)} of {bytesText(state.data.bytes)} is shown.</p>}
    </>
  );
}

/** A header that opens its body: collapsed unless `open` says otherwise. The body is rendered only while open. */
function Disclosure({ header, open: initiallyOpen = false, className = '', children }: {
  readonly header: ReactNode;
  readonly open?: boolean;
  readonly className?: string;
  readonly children: () => ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const id = useId();
  return (
    <div className={`block ${className}`.trim()}>
      <button type="button" className="block-header" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
        <span className="block-marker" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="block-title">{header}</span>
      </button>
      <div id={id} className="block-body" hidden={!open}>{open && children()}</div>
    </div>
  );
}

/** A labelled body, collapsed, whose header names its size and first line. */
function BodyBlock({ label, body, open = false, className, render }: {
  readonly label: ReactNode;
  readonly body: TranscriptBody;
  readonly open?: boolean;
  readonly className?: string;
  readonly render?: (content: string) => ReactNode;
}) {
  const preview = previewOf(body);
  return (
    <Disclosure
      className={className}
      open={open}
      header={<>{label} <span className="muted">· {bytesText(bodyBytes(body))}{body.stored === 'file' ? ` · ${body.path}` : ''}{preview && !open ? ` · ${preview}` : ''}</span></>}
    >
      {() => <BodyContent body={body} render={render} />}
    </Disclosure>
  );
}

// Files

function rangeText(range: Range | null): string {
  if (range === null || (range.start === null && range.count === null)) return 'the whole file';
  if (range.start !== null && range.count !== null) return `lines ${range.start}–${range.start + range.count - 1}`;
  if (range.start !== null) return `from line ${range.start}`;
  return range.count === 1 ? 'the first line' : `the first ${range.count} lines`;
}

/**
 * A read's content as a file: its path, its range and its lines, numbered
 * from the range's first line. A last line in brackets after a blank line is
 * the tool's own note on what it left out, shown apart and unnumbered.
 */
export function FileView({ path, range, content }: { readonly path: string; readonly range: Range | null; readonly content: string }) {
  const start = range?.start ?? 1;
  let lines = content.split('\n');
  let note: string | undefined;
  const last = lines.at(-1) ?? '';
  if (lines.length >= 3 && /^\[.*\]$/.test(last) && lines.at(-2) === '') {
    note = last;
    lines = lines.slice(0, -2);
  }
  if (lines.length > 1 && lines.at(-1) === '') lines = lines.slice(0, -1);
  return (
    <figure className="file-view">
      <figcaption><code>{path}</code> <span className="muted">{rangeText(range)}, {lines.length} {lines.length === 1 ? 'line' : 'lines'} shown</span></figcaption>
      <ol className="file-lines" start={start} aria-label={`${path}, from line ${start}`}>
        {lines.map((line, index) => <li key={index}><code>{line === '' ? ' ' : line}</code></li>)}
      </ol>
      {note && <p className="muted file-note">{note}</p>}
    </figure>
  );
}

// Headers

export function ActionText({ tool, action }: { readonly tool: string; readonly action: TranscriptToolAction }) {
  switch (action.kind) {
    case 'read': return <>read <code>{action.path}</code>, {rangeText(action.range)}</>;
    case 'search':
      return <>search{action.pattern !== null && <> for <code>{action.pattern}</code></>}{action.path !== null && <> in <code>{action.path}</code></>}{action.glob !== null && <> matching <code>{action.glob}</code></>}</>;
    case 'write': return <>write {action.paths.length === 0 ? 'no named path' : action.paths.map((path, index) => <span key={path}>{index > 0 && ', '}<code>{path}</code></span>)}</>;
    case 'command': return <>command {action.command === null ? <code>{tool}</code> : <code>{action.command}</code>}</>;
    case 'harness': return <>harness tool <code>{tool}</code></>;
    case 'other': return <>tool <code>{tool}</code></>;
  }
}

function usageText(usage: Usage): string {
  if (usage === null) return 'usage not reported';
  return `tokens in ${usage.input} · out ${usage.output} · cache read ${usage.cacheRead} · cache write ${usage.cacheWrite} · total ${usage.total}`;
}

const detailLabels: ReadonlyArray<readonly [Exclude<keyof TranscriptMessageDetail, 'error'>, string]> = [
  ['model', 'model'],
  ['thinkingLevel', 'thinking level'],
  ['stopReason', 'stop reason'],
  ['reasoningTokens', 'reasoning tokens'],
  ['cost', 'cost'],
  ['cacheWrites', 'cache writes by retention'],
];

/** An assistant message's optional detail: each reported value, and what the executor did not report. */
function MessageDetail({ detail, usage }: { readonly detail: TranscriptMessageDetail; readonly usage: Usage }) {
  const shown: string[] = [];
  const absent: string[] = [];
  for (const [field, label] of detailLabels) {
    const value = detail[field];
    if (value === null) { absent.push(label); continue; }
    if (field === 'cost' && typeof value === 'object' && 'total' in value) shown.push(`cost ${value.total} (in ${value.input}, out ${value.output}, cache read ${value.cacheRead}, cache write ${value.cacheWrite})`);
    else if (field === 'cacheWrites' && typeof value === 'object' && 'short' in value) shown.push(`cache writes ${value.short} short, ${value.long} long`);
    else shown.push(`${label} ${String(value)}`);
  }
  return (
    <p className="message-detail muted">
      {[usageText(usage), ...shown].join(' · ')}
      {absent.length > 0 && <span className="absent"> · not reported: {absent.join(', ')}</span>}
      {detail.error !== null && <span className="failure"> · error: {detail.error}</span>}
    </p>
  );
}

// Blocks

function TextBlock({ body, label = 'Text' }: { readonly body: TranscriptBody; readonly label?: string }) {
  const open = body.stored === 'inline' && body.text.length <= openTextCharacters;
  if (open && body.stored === 'inline') return <div className="text-block"><Plain content={body.text} /></div>;
  return <BodyBlock label={label} body={body} className="block-text" />;
}

function OtherBlock({ block }: { readonly block: Extract<TranscriptContentBlock, { type: 'other' }> }) {
  return <p className="block block-other muted">{block.kind}: {block.description} <span>(not carried)</span></p>;
}

function ToolCallBlock({ block, status }: { readonly block: ToolCall; readonly status: string }) {
  return (
    <div className="tool-call">
      <p className="tool-call-header">
        <span className="badge">tool call</span> <ActionText tool={block.tool} action={block.action} /> <span className="muted">· {block.tool} · {status}</span>
      </p>
      <BodyBlock label="Input" body={block.input} className="block-input" render={content => <Plain content={prettyJson(content)} />} />
    </div>
  );
}

function prettyJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

function AssistantBlock({ block, status }: { readonly block: TranscriptAssistantBlock; readonly status: (callId: string) => string }) {
  switch (block.type) {
    case 'text': return <TextBlock body={block.body} />;
    case 'thinking':
      return block.visibility === 'redacted'
        ? <p className="block block-thinking muted">Thinking, redacted by the provider: no text was returned.</p>
        : <BodyBlock label={<>Thinking <span className="badge">{block.visibility}</span></>} body={block.body} className="block-thinking" />;
    case 'tool-call': return <ToolCallBlock block={block} status={status(block.callId)} />;
    case 'other': return <OtherBlock block={block} />;
  }
}

// Entries

/** What an entry needs of the rest of the transcript and of the session's run. */
export interface TranscriptContext {
  readonly session: SessionRef;
  /** Whether the session may still add entries: a call without its result is then running. */
  readonly live: boolean;
  /** Each call by its ID, to render its result. */
  readonly calls: ReadonlyMap<string, ToolCall>;
  /** Each call ID with a result. */
  readonly results: ReadonlySet<string>;
  /** The run's sessions, for the forks and continuations from a point; empty for a standalone session. */
  readonly sessions: ReadonlyMap<string, RunSessionView>;
}

/** The calls and results of a transcript's entries. */
export function transcriptCalls(entries: readonly TranscriptEntry[]): { calls: Map<string, ToolCall>; results: Set<string> } {
  const calls = new Map<string, ToolCall>();
  const results = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== 'message') continue;
    if (entry.role === 'assistant') for (const block of entry.blocks) if (block.type === 'tool-call') calls.set(block.callId, block);
    if (entry.role === 'tool-result') results.add(entry.callId);
  }
  return { calls, results };
}

function samePoint(a: TranscriptPoint, b: TranscriptPoint): boolean {
  return a.session === b.session && ('invocation' in a ? 'invocation' in b && a.invocation === b.invocation : 'append' in b && a.append === b.append);
}

/** A point's words: the end of an invocation, or an append, in its session. */
export function pointText(point: TranscriptPoint, session?: string): string {
  const where = 'invocation' in point ? `the end of ${point.invocation}` : `the append at event ${point.append}`;
  return point.session === session ? where : `${where} in ${point.session}`;
}

/** A link to a point. */
export function PointLink({ from, point }: { readonly from: SessionRef; readonly point: TranscriptPoint }) {
  return <a href={pointHref(from, point)}>{pointText(point, from.session)}</a>;
}

/** The element ID of a point entry, which a point's link opens. */
export function pointElementId(point: TranscriptPoint): string {
  return 'invocation' in point ? `point-${point.invocation}` : `point-append-${point.append}`;
}

function StartedEntry({ entry }: { readonly entry: TranscriptEntryOf<'started'> }) {
  return (
    <>
      <p className="entry-header">
        <strong>{entry.invocation} started</strong> <span className="muted">· {entry.role} · {entry.start} · requested {entry.requested} · {entry.executor} · model {entry.model ?? 'the executor\'s own'}</span>
      </p>
      <BodyBlock label="System prompt" body={entry.systemPrompt} className="block-system-prompt" />
      <BodyBlock label="Prompt" body={entry.prompt} className="block-prompt" />
    </>
  );
}

function MessageEntry({ entry, context }: { readonly entry: TranscriptEntryOf<'message'>; readonly context: TranscriptContext }) {
  if (entry.role === 'user') {
    return (
      <>
        <p className="entry-header"><strong>User</strong></p>
        {entry.blocks.map((block, index) => block.type === 'text' ? <TextBlock key={index} body={block.body} label="User text" /> : <OtherBlock key={index} block={block} />)}
      </>
    );
  }
  if (entry.role === 'assistant') {
    const status = (callId: string) => context.results.has(callId) ? 'answered' : context.live ? 'running' : 'no result';
    return (
      <>
        <p className="entry-header"><strong>Assistant</strong></p>
        {entry.blocks.map((block, index) => <AssistantBlock key={index} block={block} status={status} />)}
        <MessageDetail detail={entry.detail} usage={entry.usage} />
      </>
    );
  }
  const call = context.calls.get(entry.callId);
  const read = call?.action.kind === 'read' && !entry.isError ? call.action : undefined;
  const texts = entry.blocks.filter(block => block.type === 'text');
  const size = texts.reduce<number | null>((total, block) => total === null || block.body.bytes === null ? null : total + block.body.bytes, 0);
  return (
    <>
      <p className="entry-header">
        <strong>Result</strong> of {call ? <ActionText tool={call.tool} action={call.action} /> : <code>{entry.tool}</code>}
        {entry.isError && <span className="badge state-failed">error</span>}
      </p>
      {texts.length > 0 && (
        <Disclosure
          className={read ? 'block-file' : 'block-output'}
          header={<>{read ? <>File <code>{read.path}</code></> : 'Output'} <span className="muted">· {bytesText(size)}{previewOf(texts[0]!.body) && !read ? ` · ${previewOf(texts[0]!.body)}` : ''}</span></>}
        >
          {() => texts.map((block, index) => (
            <BodyContent key={index} body={block.body} render={read && index === 0 ? content => <FileView path={read.path} range={read.range} content={content} /> : undefined} />
          ))}
        </Disclosure>
      )}
      {entry.blocks.filter(block => block.type === 'other').map((block, index) => <OtherBlock key={index} block={block as Extract<TranscriptContentBlock, { type: 'other' }>} />)}
      {entry.output !== null && <BodyBlock label="Complete output" body={entry.output} className="block-output" />}
    </>
  );
}

function HarnessDecision({ decision }: { readonly decision: TranscriptHarnessDecision }) {
  switch (decision.kind) {
    case 'guard-denied':
      return (
        <>
          <p className="entry-header"><strong>Guard denied</strong> <code>{decision.tool}</code> <span className="muted">· {decision.verdict} · {decision.requested} · {decision.reason}</span></p>
          <BodyBlock label="What the agent was told" body={decision.text} />
        </>
      );
    case 'submission-verdict':
      return (
        <>
          <p className="entry-header"><strong>Submission {decision.verdict}</strong> <span className="muted">· {decision.tool} · call {decision.callId}</span></p>
          {decision.text === null
            ? <p className="muted entry-note">The executor's own acknowledgement was the answer.</p>
            : <BodyBlock label="The answer" body={decision.text} />}
        </>
      );
    case 'post-write-check':
      return (
        <>
          <p className="entry-header">
            <strong>{decision.atCompletion ? 'Check at completion' : 'Post-write check'}</strong>
            <span className="muted">{decision.callId === null ? '' : ` · after call ${decision.callId}`}</span>
          </p>
          <ul className="checks">
            {decision.checks.map((check, index) => (
              <li key={index}>
                <span className={`badge check-${check.outcome}`}>{check.outcome}</span> {check.mode} check of {check.paths.length === 0 ? 'the scope' : check.paths.join(', ')}
                {check.newFindings > 0 && <> · {check.newFindings} new findings</>}{check.reason && <span className="muted"> · {check.reason}</span>}
                {check.log !== null && <BodyBlock label="Check log" body={check.log} />}
              </li>
            ))}
          </ul>
          {decision.text !== null && <BodyBlock label="What the call's result was told" body={decision.text} />}
        </>
      );
    case 'read-reminder':
      return (
        <>
          <p className="entry-header"><strong>Read reminder</strong><span className="muted">{decision.callId === null ? '' : ` · with the result of call ${decision.callId}`}</span></p>
          <BodyBlock label="Reminder" body={decision.text} />
        </>
      );
    case 'brief-appended':
      return (
        <>
          <p className="entry-header"><strong>Brief appended</strong> <span className="muted">· decision {decision.decision} · context generation {decision.generation} · {decision.outcome}</span></p>
          <BodyBlock label="Brief" body={decision.text} className="block-brief" />
        </>
      );
    case 'note-appended':
      return (
        <>
          <p className="entry-header"><strong>Note appended</strong></p>
          <BodyBlock label="Note" body={decision.text} className="block-brief" />
        </>
      );
    case 'budget-reached':
      return (
        <p className="entry-header">
          <strong>Context budget reached</strong>{' '}
          <span className="muted">· {decision.tokens ?? 'unknown'} tokens of {decision.threshold ?? 'an unknown threshold'} · {decision.reportDelivered ? 'the final report was delivered' : 'no final report'}</span>
        </p>
      );
  }
}

function PointEntry({ entry, context }: { readonly entry: TranscriptEntryOf<'point'>; readonly context: TranscriptContext }) {
  const forks: string[] = [];
  const continuations: Array<{ session: string; invocation: string }> = [];
  for (const session of context.sessions.values()) {
    if (session.lineage.fork && samePoint(session.lineage.fork.from, entry.point)) forks.push(session.session);
    for (const invocation of session.invocations) {
      if (invocation.continues && samePoint(invocation.continues.from, entry.point)) continuations.push({ session: session.session, invocation: invocation.invocation });
    }
  }
  const from = context.session;
  return (
    <p className="entry-header point" id={pointElementId(entry.point)} tabIndex={-1}>
      <strong>Point</strong> <span className="muted">· {pointText(entry.point, from.session)}: a later start may continue or fork from here</span>
      {forks.length > 0 && <> · forked from here: {forks.map((session, index) => <span key={session}>{index > 0 && ', '}<a href={sessionHref(from.source === 'run' ? { ...from, session } : from)}>{session}</a></span>)}</>}
      {continuations.length > 0 && <> · continued from here by {continuations.map((next, index) => <span key={next.invocation}>{index > 0 && ', '}{next.invocation}</span>)}</>}
    </p>
  );
}

function EndedEntry({ entry }: { readonly entry: TranscriptEntryOf<'ended'> }) {
  const actual = entry.actual === null
    ? 'its start is not known: the session never ran, or recovery closed it'
    : `started ${entry.actual.mode}${entry.actual.degradedReason ? ` (degraded: ${entry.actual.degradedReason})` : ''}`;
  return (
    <p className="entry-header">
      <strong>{entry.invocation} ended: {entry.ended}</strong>
      <span className="muted"> · {actual}{entry.interruption ? ` · interrupted: ${entry.interruption}` : ''}</span>
      {entry.error !== null && <span className="failure"> · error: {entry.error}</span>}
    </p>
  );
}

function EntryContent({ entry, context }: { readonly entry: TranscriptEntry; readonly context: TranscriptContext }) {
  switch (entry.type) {
    case 'started': return <StartedEntry entry={entry} />;
    case 'message': return <MessageEntry entry={entry} context={context} />;
    case 'harness': return <HarnessDecision decision={entry.decision} />;
    case 'compaction':
      return (
        <p className="entry-header">
          <strong>Compaction {entry.phase}</strong> <span className="muted">· {entry.reason}
            {entry.phase === 'ended' && <> · {entry.tokensBefore ?? 'unknown'} → {entry.tokensAfter ?? 'unknown'} tokens{entry.aborted ? ' · aborted' : ''}{entry.errorText ? ` · ${entry.errorText}` : ''}</>}
          </span>
        </p>
      );
    case 'retry':
      return (
        <p className="entry-header">
          <strong>Retry {entry.phase}</strong> <span className="muted">· attempt {entry.attempt}
            {entry.phase === 'started'
              ? <>{entry.maxAttempts !== null ? ` of ${entry.maxAttempts}` : ''}{entry.delayMs !== null ? ` after ${entry.delayMs} ms` : ''}{entry.errorText ? ` · ${entry.errorText}` : ''}</>
              : <> · {entry.succeeded ? 'succeeded' : 'failed'}{entry.errorText ? ` · ${entry.errorText}` : ''}</>}
          </span>
        </p>
      );
    case 'point': return <PointEntry entry={entry} context={context} />;
    case 'ended': return <EndedEntry entry={entry} />;
  }
}

/** One entry: its number and time, then its headers and collapsed bodies. */
export function TranscriptEntryView({ entry, context }: { readonly entry: TranscriptEntry; readonly context: TranscriptContext }) {
  const role = entry.type === 'message' ? ` entry-${entry.role}` : '';
  return (
    <li className={`entry entry-${entry.type}${role}`} data-n={entry.n}>
      <span className="entry-meta muted"><span className="entry-number">{entry.n}</span> <time dateTime={entry.at}>{entry.at.slice(11, 19)}</time></span>
      <div className="entry-content"><EntryContent entry={entry} context={context} /></div>
    </li>
  );
}

/** Supplies the bodies of one session's transcript to the entries inside it. */
export function TranscriptBodies({ client, session, children }: { readonly client: ProtocolClient; readonly session: SessionRef; readonly children: ReactNode }) {
  const source = useBodySource(client, session);
  return <BodyContext.Provider value={source}>{children}</BodyContext.Provider>;
}
