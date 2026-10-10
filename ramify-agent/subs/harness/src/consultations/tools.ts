import { readFile } from 'node:fs/promises';
import type { AgentPort, ToolDefinition, ToolResult } from '../../subs/agent/src/interfaces/port.js';
import type { TranscriptBody } from '../interfaces/protocol/transcripts.js';
import { sha256, type LoadedPackage } from '../prompts/packages.js';
import type { TaskEnvironment } from '../prompts/tasks.js';
import { invocationLimits } from '../run/policy.js';
import { invocationOutcomeSchema, runLayout, type Invocation, type SessionId } from '../run/records.js';
import { validateAgainst } from '../run/submissions.js';
import { composeTaskBrief } from '../run/task-brief.js';
import { committedBody, finished, type InvocationRunner, type RunnerRun } from '../steps/runner.js';
import { readBody, readTranscript } from '../transcripts/writer.js';
import type { EquipContext } from '../work/engineer-equipment.js';
import { consultationId, type ConsultationOutcome } from './records.js';
import { consultationOutcome, recordConsultationOutcome, recordConsultationStart } from './store.js';
import { consultationTargetSchema, type ConsultationTarget } from './targets.js';

import { consultArchitectName, architectAnswerName, consultationMessageSchema, architectAnswerSchema, architectAnswerJsonSchema, consultArchitectDeclaration } from './submissions.js';
export { consultArchitectName, architectAnswerName, consultationMessageSchema, architectAnswerSchema, architectAnswerJsonSchema, consultArchitectDeclaration } from './submissions.js';

export interface ConsultationEquipmentInputs<R extends RunnerRun> {
  readonly run: R;
  readonly runner: InvocationRunner<R>;
  readonly agent: AgentPort;
  readonly packages: ReadonlyMap<string, LoadedPackage>;
  readonly target: ConsultationTarget;
  readonly global: ConsultationTarget | null;
  readonly caller: { readonly session: SessionId; readonly role: Invocation['role']; readonly work: Invocation['work'] };
  readonly parent?: string | undefined;
  readonly views: TaskEnvironment['views'];
  readonly projectRoot: string;
  readonly holdMs: number;
  readonly now: () => Date;
}

/** The same ordinary awaited tool equips an engineer, a local turn and a local consultation fork. */
export function consultationTool<R extends RunnerRun>(inputs: ConsultationEquipmentInputs<R>, context: EquipContext): ToolDefinition {
  return { ...consultArchitectDeclaration, action: () => ({ kind: 'harness' }), execute: async (raw, signal, actualCallId) => {
    const parsed = consultationMessageSchema.safeParse(raw);
    if (!parsed.success) return { text: parsed.error.message, isError: true };
    const callId = actualCallId ?? context.callId(consultArchitectName);
    if (!callId) return { text: 'Consultation tool call identity is unavailable', isError: true };
    const id = consultationId(context.invocation, callId);
    const { run } = inputs;
    const previous = consultationOutcome(run.log, id);
    if (previous !== null) {
      if (previous.status === 'answered' && previous.accepted !== null) return { text: await bodyText(run, previous.accepted.answer) };
      return { text: previous.error === null ? 'Consultation completion is unknown; it will not be retried implicitly.' : await bodyText(run, previous.error.message), isError: true };
    }
    if (run.log.all('consultation-started').some(event => event.data.consultation === id)) return { text: 'Consultation completion is unknown; it will not be retried implicitly.', isError: true };
    await inputs.runner.transcriptOf(run, inputs.caller.session).drain();
    const transcript = await readTranscript(run.path(runLayout.transcript(inputs.caller.session))).catch(() => ({ entries: [] }));
    const request = transcript.entries.find(entry => entry.invocation === context.invocation && entry.type === 'message' && entry.role === 'assistant' && entry.blocks.some(block => block.type === 'tool-call' && block.callId === callId));
    const work = inputs.caller.work;
    await run.mutex.run(() => recordConsultationStart(run.log, {
      schema: 'ramify-agent.consultation-start/1', id,
      caller: { invocation: context.invocation, toolCall: callId, session: inputs.caller.session, role: inputs.caller.role,
        work: { ...(work.workItem === undefined ? {} : { workItem: work.workItem }), ...(work.iteration === undefined ? {} : { iteration: work.iteration }), ...(work.capabilityTask === undefined ? {} : { task: work.capabilityTask }) } },
      parent: inputs.parent ?? null, target: inputs.target, globalTarget: inputs.target.role === 'local-architect' ? inputs.global : null,
      startedAt: inputs.now().toISOString(), message: inline(parsed.data.message), request: { session: inputs.caller.session, entry: request?.n ?? null },
    }));
    let child: ConsultationOutcome['child'] = null;
    let accepted: ConsultationOutcome['accepted'] = null;
    const outcome = async (status: ConsultationOutcome['status'], code: string | null, message: string | null): Promise<ToolResult> => {
      await run.mutex.run(() => recordConsultationOutcome(run.log, { schema: 'ramify-agent.consultation-outcome/1', id, status,
        endedAt: inputs.now().toISOString(), child, accepted, error: code === null ? null : { code, message: inline(message ?? code) },
        delivery: 'unknown', result: null }));
      return status === 'answered' && accepted !== null ? { text: await bodyText(run, accepted.answer) } : { text: message ?? code ?? 'Consultation incomplete', isError: true };
    };
    if (signal.aborted) return outcome('cancelled', 'cancelled', 'Consultation cancelled before dispatch');
    const checked = consultationTargetSchema.safeParse(inputs.target);
    if (!checked.success || inputs.target.run.runId !== run.jobId || inputs.target.run.planId !== run.planId) return outcome('failed', 'invalid-source', 'Consultation source point is invalid for this run');
    const release = context.hold?.(inputs.holdMs);
    try {
      const loaded = inputs.packages.get(inputs.target.role);
      if (loaded === undefined) return await outcome('failed', 'unavailable-role', `No package for ${inputs.target.role}`);
      signal.throwIfAborted();
      const limits = invocationLimits(run.policy.limits, {});
      const prompt = `# Advisory architect consultation\n\nCaller: ${inputs.caller.role}, session ${inputs.caller.session}.\nPinned source: ${JSON.stringify(inputs.target.point)}.\nInherited observations may be stale; the known generated-view paths/revisions/limits describe available current evidence. No source snapshot or view refresh is performed.\nKnown views: ${JSON.stringify(inputs.views)}\n\n# Exact caller question\n\n${parsed.data.message}`;
      const nestedTarget = inputs.target.role === 'local-architect' ? inputs.global : null;
      const brief = composeTaskBrief(inputs.projectRoot, { kind: 'architect-consultation', work: { ...work, request: id },
        goal: parsed.data.message, requirements: ['Provide advisory explanation or research only; change no source, assignment or decision.'],
        prompt, omit: [], literalSections: [], startingPointGroups: [], retainInheritedSections: true,
        environment: { projectRoot: inputs.projectRoot, workingDirectory: inputs.projectRoot, candidate: null, snapshot: null, limits,
          availableTools: ['read', 'grep', 'ls', ...(nestedTarget === null ? [] : [consultArchitectName]), architectAnswerName], views: inputs.views, supportPaths: [], cucumberConfiguration: null } });
      const result = await inputs.runner.runInvocation(run, inputs.agent, {
        role: inputs.target.role, work: { ...work, request: id }, attempt: 1, loaded, systemPrompt: loaded.system, prompt, brief,
        start: { mode: 'fork', from: inputs.target.ref }, fork: { from: inputs.target.point, reason: 'architect-consultation', briefs: [] },
        allowFreshFallback: false, reader: true, workingDirectory: inputs.projectRoot, signal, fenced: () => signal.aborted,
        toolName: architectAnswerName, description: 'Submit the advisory answer as one nonblank string.', inputSchema: architectAnswerJsonSchema,
        submissionSchema: 'ramify-agent.architect-consultation-answer/1', validate: raw => validateAgainst(architectAnswerSchema, raw),
        scope: { write: null, measurement: null, size: null }, keep: () => finished('not-kept'),
        onStarted: async (invocation, session) => { child = { invocation, session }; },
        equip: nestedContext => ({ builtinTools: ['read', 'grep', 'ls'], tools: nestedTarget === null ? [] : [consultationTool({ ...inputs,
          target: nestedTarget, global: null, parent: id, caller: { session: child!.session!, role: 'local-architect', work }, holdMs: limits.invocationAbsoluteMs }, nestedContext)] }),
      });
      if (result.value !== undefined) accepted = { submission: runLayout.submission(result.id), answer: inline(result.value.answer) };
      else if (result.id !== '') {
        // The fork may accept its answer before cancellation closes the invocation.
        // Its returned value is then intentionally absent, but retained acceptance is still a fact.
        const ended = invocationOutcomeSchema.parse(committedBody(run, runLayout.outcome(result.id)));
        if (ended.submission !== null) {
          const path = runLayout.submission(result.id);
          const bytes = await readFile(run.path(path));
          if (sha256(bytes) !== ended.submission.hash) throw new Error('Accepted consultation submission changed');
          const { schema, ...body } = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
          const answer = architectAnswerSchema.parse(body);
          if (schema !== 'ramify-agent.architect-consultation-answer/1') throw new Error('Accepted consultation schema changed');
          accepted = { submission: path, answer: inline(answer.answer) };
        }
      }
      if (signal.aborted || result.ended === 'stopped') return await outcome('cancelled', 'cancelled', 'Consultation cancelled; no late answer delivered');
      if (accepted !== null) return await outcome('answered', null, null);
      const code = result.interruption === 'session-lost' ? 'unavailable-source' : result.ended === 'invalid-submission' ? 'answer-exhausted' : result.interruption ?? (result.ended === 'failed' ? 'provider-failure' : 'no-answer');
      return await outcome('failed', code, result.error ?? `Consultation ended ${result.ended} without an accepted answer`);
    } catch (error) {
      return await outcome(signal.aborted ? 'cancelled' : 'failed', signal.aborted ? 'cancelled' : 'executor-failure', error instanceof Error ? error.message : String(error));
    } finally { release?.(); }
  } };
}
function inline(text: string): TranscriptBody { return { stored: 'inline', text, bytes: Buffer.byteLength(text) }; }

async function bodyText(run: RunnerRun, body: TranscriptBody): Promise<string> {
  const text = await readBody(run.directory, run.store, body);
  if (text === null) throw new Error("Retained consultation content is unavailable");
  return text;
}
