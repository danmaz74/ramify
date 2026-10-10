import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { z } from 'zod';
import { readJsonLines } from '../../subs/ledger/src/jsonl.js';
import { consultationId, consultationLayout, consultationStartSchema, consultationOutcomeSchema, type ConsultationStart, type ConsultationOutcome } from '../consultations/records.js';
import { architectAnswerSchema } from '../consultations/submissions.js';
import { runEventSchema } from '../run/log.js';
import { invocationSchema, invocationOutcomeSchema, manualRunRecordSchema, runRecordSchema, runLayout, type Invocation, type InvocationOutcome } from '../run/records.js';
import { ContentStore } from '../transcripts/store.js';
import { readBody, readTranscript } from '../transcripts/writer.js';
import type { TranscriptBody } from '../interfaces/protocol/transcripts.js';
import { readObservationLog } from './metrics.js';

const lineSchema = z.object({ sequence: z.int().positive(), at: z.string().min(1), event: runEventSchema,
  records: z.array(z.object({ path: z.string().min(1), id: z.string().min(1), revision: z.int().positive(), body: z.unknown() })),
  effect: z.unknown().optional() });
const categories = ['input', 'output', 'cacheRead', 'cacheWrite', 'total'] as const;
type Category = typeof categories[number];
interface Usage {
  invocation: string | null;
  knownSubtotal: Record<Category, number> | null;
  complete: boolean;
  limits: string[];
}
interface UsageTotal {
  invocations: string[];
  knownSubtotal: Record<Category, number> | null;
  complete: boolean;
  total: Record<Category, number> | null;
}
export interface ConsultationInspectionOptions { run: string; session?: string; id?: string }

/** Reads only retained committed lines and raw observation files. Never opens a writer or repairs mirrors. */
export async function readConsultations(options: ConsultationInspectionOptions) {
  const directory = resolve(options.run);
  const raw = JSON.parse(await readFile(join(directory, runLayout.record), 'utf8')) as unknown;
  const record = z.union([manualRunRecordSchema, runRecordSchema]).parse(raw);
  const loaded = await readJsonLines(join(directory, runLayout.events));
  const limits = loaded.discardedPartial === null ? [] : ['events.jsonl has an unfinished trailing line; only complete committed lines are shown'];
  const lines = loaded.records.map((value, index) => {
    const line = lineSchema.parse(value);
    if (line.sequence !== index + 1 || line.event.sequence !== line.sequence || line.event.jobId !== record.jobId) throw new Error(`events.jsonl:${index + 1}: inconsistent run or sequence`);
    for (const body of line.records) {
      const path = relative(directory, resolve(directory, body.path));
      if (isAbsolute(body.path) || path === '..' || path.startsWith('../') || resolve(directory, body.path) === directory) throw new Error(`events.jsonl:${index + 1}: invalid record path ${body.path}`);
    }
    return line;
  });
  const starts = new Map<string, { value: ConsultationStart; sequence: number; path: string }>();
  const outcomes = new Map<string, { value: ConsultationOutcome; path: string }>();
  const invocations = new Map<string, Invocation>();
  const invocationOutcomes = new Map<string, InvocationOutcome>();
  for (const line of lines) for (const body of line.records) {
    const schema = (body.body as { schema?: unknown } | null)?.schema;
    if (body.path.startsWith('consultations/')) {
      if (schema === 'ramify-agent.consultation-start/1') {
        const value = consultationStartSchema.parse(body.body);
        if (value.id !== consultationId(value.caller.invocation, value.caller.toolCall) || body.id !== value.id || body.path !== consultationLayout.start(value.id)) throw new Error(`Invalid consultation identity at ${body.path}`);
        if (starts.has(value.id)) throw new Error(`Duplicate consultation start ${value.id}`);
        starts.set(value.id, { value, sequence: line.sequence, path: body.path });
      } else if (schema === 'ramify-agent.consultation-outcome/1') {
        const value = consultationOutcomeSchema.parse(body.body);
        if (!starts.has(value.id) || body.id !== value.id || body.path !== consultationLayout.outcome(value.id, body.revision)) throw new Error(`Invalid consultation outcome at ${body.path}`);
        outcomes.set(value.id, { value, path: body.path });
      } else throw new Error(`Unsupported or malformed consultation record ${body.path}: ${String(schema)}`);
    } else if (schema === 'ramify-agent.invocation/1') {
      const value = invocationSchema.parse(body.body); invocations.set(value.id, value);
    } else if (schema === 'ramify-agent.invocation-outcome/1') {
      const value = invocationOutcomeSchema.parse(body.body); invocationOutcomes.set(value.invocation, value);
    }
  }
  for (const line of lines) {
    const event = line.event;
    if (event.type === 'consultation-started') {
      const committed = line.records.find(body => body.id === event.data.consultation && (body.body as { schema?: unknown } | null)?.schema === 'ramify-agent.consultation-start/1');
      if (committed === undefined) throw new Error(`Consultation ${event.data.consultation} has no committed start body`);
      const body = consultationStartSchema.parse(committed.body);
      if (body.caller.invocation !== event.data.caller || body.caller.toolCall !== event.data.toolCall || body.parent !== event.data.parent) throw new Error(`Consultation ${body.id} start event disagrees with its body`);
    }
    if (event.type === 'consultation-finished' || event.type === 'consultation-delivery-recorded') {
      const committed = line.records.find(body => body.id === event.data.consultation && (body.body as { schema?: unknown } | null)?.schema === 'ramify-agent.consultation-outcome/1');
      if (committed === undefined) throw new Error(`Consultation ${event.data.consultation} event ${event.type} has no committed outcome body`);
      const body = consultationOutcomeSchema.parse(committed.body);
      if (event.type === 'consultation-finished' ? body.status !== event.data.status || body.delivery !== event.data.delivery
        : committed.revision !== event.data.revision || body.delivery !== 'recorded' || body.result?.entry == null) throw new Error(`Consultation ${body.id} outcome event disagrees with its body`);
    }
  }
  for (const { value } of starts.values()) if (value.parent !== null && !starts.has(value.parent)) throw new Error(`Consultation ${value.id} has unknown parent ${value.parent}`);
  // The supported shape is a direct call or a child of a direct call.
  for (const { value } of starts.values()) if (value.parent !== null && starts.get(value.parent)!.value.parent !== null) throw new Error(`Consultation ${value.id} has invalid nested parentage`);
  const transcripts = new Map<string, Awaited<ReturnType<typeof readTranscript>>>();
  const transcript = async (session: string) => {
    let value = transcripts.get(session);
    if (value === undefined) { value = await readTranscript(join(directory, runLayout.transcript(session))); transcripts.set(session, value); }
    return value;
  };
  const store = new ContentStore(join(directory, runLayout.blobs));
  const text = async (body: TranscriptBody): Promise<string> => {
    const value = await readBody(directory, store, body);
    if (value === null) throw new Error('Retained consultation content is missing or unreadable');
    return value;
  };
  const exchanges = [];
  for (const { value: start, sequence, path } of starts.values()) {
    const kept = outcomes.get(start.id);
    const outcome = kept?.value ?? null;
    const childEvent = lines.find(line => line.event.type === 'invocation-started' && line.event.data.work.request === start.id)?.event;
    const child = outcome?.child ?? (childEvent?.type === 'invocation-started' ? { invocation: childEvent.data.invocation, session: childEvent.data.session } : null);
    const childInvocation = child === null ? null : invocations.get(child.invocation) ?? null;
    const childOutcome = child === null ? null : invocationOutcomes.get(child.invocation) ?? null;
    let accepted = outcome?.accepted ?? null;
    if (accepted === null && child !== null && childOutcome?.submission != null) {
      const submission = runLayout.submission(child.invocation);
      const bytes = await readFile(join(directory, submission));
      if (createHash('sha256').update(bytes).digest('hex') !== childOutcome.submission.hash) throw new Error(`Accepted consultation submission hash mismatch: ${submission}`);
      const { schema, ...body } = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
      if (schema !== 'ramify-agent.architect-consultation-answer/1') throw new Error(`Unsupported accepted consultation submission: ${submission}`);
      const answer = architectAnswerSchema.parse(body);
      accepted = { submission, answer: { stored: 'inline', text: answer.answer, bytes: Buffer.byteLength(answer.answer) } };
    }
    const sessionEvent = lines.find(line => line.event.type === 'session-opened' && line.event.data.session === child?.session)?.event;
    const callerRead = await transcript(start.caller.session);
    const callLimits = callerRead.missing ? ['Caller transcript missing'] : [];
    if (callerRead.discardedPartial || callerRead.unreadable.length > 0) callLimits.push(`Caller transcript incomplete: unreadable lines ${callerRead.unreadable.join(',')}; trailing partial=${callerRead.discardedPartial}`);
    const request = callerRead.entries.find(entry => entry.type === 'message' && entry.role === 'assistant' && entry.invocation === start.caller.invocation && entry.blocks.some(block => block.type === 'tool-call' && block.callId === start.caller.toolCall && block.tool === 'consult_architect'));
    const result = callerRead.entries.find(entry => entry.type === 'message' && entry.role === 'tool-result' && entry.invocation === start.caller.invocation && entry.callId === start.caller.toolCall && entry.tool === 'consult_architect');
    if (outcome?.delivery === 'recorded' && (result === undefined || outcome.result?.session !== start.caller.session || outcome.result.entry !== result.n)) throw new Error(`Consultation ${start.id} records a caller result that cannot be resolved`);
    const subsequent = result === undefined ? undefined : callerRead.entries.find(entry => entry.n > result.n && entry.type === 'message' && entry.role === 'assistant');
    const point = (session: string, entry: number | null) => ({ session, path: runLayout.transcript(session), entry });
    const delivered = result?.type === 'message' && result.role === 'tool-result' ? { isError: result.isError,
      blocks: await Promise.all(result.blocks.map(async block => block.type === 'text' ? { type: 'text' as const, text: await text(block.body), body: block.body } : block)),
      position: point(start.caller.session, result.n) } : null;
    const investigation = child?.session === null || child === null ? null : await transcript(child.session);
    if (investigation?.missing) callLimits.push('Child transcript missing');
    if (investigation?.discardedPartial || (investigation?.unreadable.length ?? 0) > 0) callLimits.push('Child transcript incomplete');
    const elapsedMs = outcome?.endedAt === null || outcome === null ? null : Date.parse(outcome.endedAt) - Date.parse(start.startedAt);
    if (elapsedMs !== null && elapsedMs < 0) throw new Error(`Consultation ${start.id} ends before it starts`);
    exchanges.push({ id: start.id, parent: start.parent, occurrence: sequence, caller: start.caller, question: await text(start.message), questionBody: start.message,
      target: start.target, globalTarget: start.globalTarget, status: outcome?.status ?? 'incomplete', startedAt: start.startedAt, endedAt: outcome?.endedAt ?? null, elapsedMs,
      child: child === null ? null : { ...child, record: runLayout.invocation(child.invocation), outcome: childOutcome === null ? null : runLayout.outcome(child.invocation),
        role: childInvocation?.role ?? null, work: childInvocation?.work ?? null,
        model: sessionEvent?.type === 'session-opened' ? sessionEvent.data.model : null, fork: sessionEvent?.type === 'session-opened' ? sessionEvent.data.fork ?? null : null,
        investigation: child.session === null ? null : { ...point(child.session, null), invocation: child.invocation } },
      accepted: accepted === null ? null : { ...accepted, text: await text(accepted.answer) },
      error: outcome?.error === null || outcome?.error === undefined ? null : { ...outcome.error, text: await text(outcome.error.message) },
      delivery: { recordedOutcome: outcome?.delivery ?? 'unknown', observed: delivered === null ? 'unknown' : 'recorded', result: delivered,
        modelConsumption: 'unknown' as const, subsequentCaller: point(start.caller.session, subsequent?.n ?? null) },
      references: { start: path, outcome: kept?.path ?? null, request: point(start.caller.session, request?.n ?? start.request.entry), recordedRequest: start.request,
        callerInvocation: runLayout.invocation(start.caller.invocation) },
      usage: await usageOf(directory, child?.invocation ?? null, childOutcome), limits: callLimits,
    });
  }
  if (options.id !== undefined && !starts.has(options.id)) throw new Error(`Unknown consultation ${options.id}`);
  const selected = new Set(exchanges.filter(exchange => options.id !== undefined ? exchange.id === options.id : options.session === undefined || exchange.caller.session === options.session).map(exchange => exchange.id));
  if (options.id === undefined) for (const exchange of exchanges) if (exchange.parent !== null && selected.has(exchange.parent)) selected.add(exchange.id);
  const shown = exchanges.filter(exchange => selected.has(exchange.id));
  const metricShown = options.id === undefined ? shown : exchanges.filter(exchange => exchange.id === options.id || exchange.parent === options.id);
  const roots = shown.filter(exchange => exchange.parent === null || !selected.has(exchange.parent));
  const durations = roots.map(exchange => exchange.elapsedMs);
  return { schema: 'ramify-agent.consultation-inspection/1', run: { directory, planId: record.planId, runId: record.jobId },
    consultations: shown, count: shown.length, usage: sumUsage(metricShown.map(exchange => exchange.usage)),
    chains: roots.map(root => ({ consultation: root.id, usage: sumUsage(metricShown.filter(exchange => exchange.id === root.id || exchange.parent === root.id).map(exchange => exchange.usage)) })),
    cumulativeCallTime: { label: 'cumulative top-level call time (not session wall time)', knownSubtotalMs: durations.some(value => value !== null) ? durations.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null,
      complete: durations.every(value => value !== null), totalMs: durations.every(value => value !== null) ? durations.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null },
    limits: [...limits, 'Recorded caller tool results and subsequent transcript pointers do not establish model consumption or usefulness'],
  };
}

async function usageOf(directory: string, invocation: string | null, outcome: InvocationOutcome | null): Promise<Usage> {
  if (invocation === null) return { invocation, knownSubtotal: null, complete: false, limits: ['No actual child invocation recorded'] };
  const observations = await readObservationLog(join(directory, runLayout.observations(invocation)), runLayout.observations(invocation));
  const limits: string[] = [];
  if (outcome === null) limits.push('Child invocation has no completed outcome');
  if (outcome !== null && 'unavailable' in outcome.usage) limits.push(outcome.usage.unavailable);
  if ('unavailable' in observations) return { invocation, knownSubtotal: outcome === null || 'unavailable' in outcome.usage ? null : outcome.usage, complete: false, limits: [...limits, observations.unavailable] };
  const usage = observations.filter(row => row.type === 'usage');
  for (const row of observations) if (row.type === 'coverage-gap' && ['usage-unavailable', 'observation-truncated'].includes(row.data.kind)) limits.push(row.data.detail);
  const subtotal = usage.length === 0 ? outcome === null || 'unavailable' in outcome.usage ? null : outcome.usage : Object.fromEntries(categories.map(key => [key, usage.reduce((sum, row) => sum + row.data.usage[key], 0)])) as Record<Category, number>;
  if (usage.length === 0) limits.push('No provider usage observations; retained outcome subtotal only where available');
  if (subtotal !== null && outcome !== null && !('unavailable' in outcome.usage) && categories.some(key => subtotal[key] !== (outcome.usage as Record<Category, number>)[key])) limits.push('Observed usage subtotal differs from invocation outcome');
  return { invocation, knownSubtotal: subtotal, complete: limits.length === 0, limits };
}
function sumUsage(values: Usage[]): UsageTotal {
  const actual = [...new Map(values.filter(value => value.invocation !== null).map(value => [value.invocation!, value])).values()];
  const known = actual.filter(value => value.knownSubtotal !== null);
  const knownSubtotal = known.length === 0 ? null : Object.fromEntries(categories.map(key => [key, known.reduce((sum, value) => sum + value.knownSubtotal![key], 0)])) as Record<Category, number>;
  const complete = values.every(value => value.complete);
  return { invocations: actual.map(value => value.invocation!), knownSubtotal, complete, total: complete ? knownSubtotal : null };
}
export type ConsultationInspection = Awaited<ReturnType<typeof readConsultations>>;

/** Compact occurrence order with nested child calls; detail retains exact strings and all references. */
export function consultationText(view: ConsultationInspection, detail = false): string {
  if (detail) {
    const exchange = view.consultations[0]!;
    return [`Consultation ${exchange.id}`, `Question:\n${exchange.question}`, `Accepted answer:\n${exchange.accepted?.text ?? '(none recorded)'}`,
      `Caller result:\n${exchange.delivery.result?.blocks.map(block => block.type === 'text' ? block.text : block.description).join('\n') ?? '(unknown; no recorded caller result)'}`,
      `Error:\n${exchange.error?.text ?? '(none recorded)'}`, JSON.stringify(exchange, null, 2), JSON.stringify({ usage: view.usage, limits: view.limits }, null, 2)].join('\n') + '\n';
  }
  const lines = [`Consultations: ${view.count} (run ${view.run.runId})`];
  const selected = new Set(view.consultations.map(exchange => exchange.id));
  const print = (exchange: ConsultationInspection['consultations'][number], indent: string) => {
    lines.push(`${indent}${exchange.id} — ${exchange.caller.role} ${exchange.caller.session}/${exchange.caller.invocation} ${JSON.stringify(exchange.caller.work)}`,
      `${indent}  ${JSON.stringify(exchange.question.slice(0, 100))} — ${exchange.status}; elapsed ${exchange.elapsedMs === null ? 'unknown' : `${exchange.elapsedMs}ms`}; delivery ${exchange.delivery.observed}`,
      `${indent}  Target ${exchange.target.role}: ${JSON.stringify(exchange.target.point)}; model ${exchange.child?.model ?? 'unknown'}`,
      `${indent}  Usage ${JSON.stringify(exchange.usage.knownSubtotal)}; complete=${exchange.usage.complete}`,
      `${indent}  Records ${exchange.references.start}; ${exchange.references.outcome ?? 'outcome unknown'}`,
      `${indent}  Request ${exchange.references.request.path}:${exchange.references.request.entry ?? '?'}; fork ${exchange.child?.investigation?.path ?? 'unknown'}`,
      `${indent}  Caller result ${exchange.delivery.result?.position.entry ?? '?'}; subsequent ${exchange.delivery.subsequentCaller.path}:${exchange.delivery.subsequentCaller.entry ?? '?'}`,
      ...[...exchange.limits, ...exchange.usage.limits].map(limit => `${indent}  Limit: ${limit}`));
    const chain = view.chains.find(value => value.consultation === exchange.id);
    if (chain !== undefined) lines.push(`${indent}  Chain usage known subtotal ${JSON.stringify(chain.usage.knownSubtotal)}; complete=${chain.usage.complete}`);
    for (const child of view.consultations.filter(candidate => candidate.parent === exchange.id)) print(child, `${indent}  `);
  };
  for (const exchange of view.consultations) if (exchange.parent === null || !selected.has(exchange.parent)) print(exchange, '');
  lines.push(`Usage known subtotal ${JSON.stringify(view.usage.knownSubtotal)}; complete=${view.usage.complete}`,
    `${view.cumulativeCallTime.label}: ${view.cumulativeCallTime.totalMs ?? 'unknown'}ms; known subtotal=${view.cumulativeCallTime.knownSubtotalMs ?? 'unknown'}ms`, ...view.limits);
  return lines.join('\n') + '\n';
}
