import { z } from 'zod';
import type { GlobalContext } from '../architecture/context.js';
import type { RunEvent } from '../run/log.js';
import { sessionIdSchema, sessionPointSchema } from '../run/records.js';
import { readSessionPointReference } from '../run/session-operations.js';

const text = z.string().min(1);
/** A delegation point, independent of the architect's subsequent history. */
export const consultationTargetSchema = z.object({
  role: z.enum(['local-architect', 'capability-architect', 'global-fork']),
  run: z.object({ planId: text, runId: text }).strict(),
  session: sessionIdSchema,
  ref: text.refine(value => readSessionPointReference(value) !== null, 'a provider-neutral session point'),
  point: sessionPointSchema,
  task: text.optional(),
}).strict().superRefine((target, ctx) => {
  if (readSessionPointReference(target.ref)?.runId !== target.run.runId) ctx.addIssue({ code: 'custom', path: ['ref'], message: 'The point belongs to another run.' });
  if (target.point.session !== target.session) ctx.addIssue({ code: 'custom', path: ['point'], message: 'The point names another harness session.' });
});
export type ConsultationTarget = z.infer<typeof consultationTargetSchema>;
const targetsSchema = z.object({
  assigning: consultationTargetSchema.refine(target => target.role === 'local-architect' || target.role === 'capability-architect', 'An assigning target is a local or capability architect.').optional(),
  global: consultationTargetSchema.refine(target => target.role === 'global-fork', 'A global target is a global architect.').optional(),
}).strict();
export const consultationInputsSchema = targetsSchema.extend({
  unavailable: text.optional(),
  /** References retained for inspection only, never executable in the imported run. */
  provenance: targetsSchema.optional(),
}).strict();
export type ConsultationInputs = z.infer<typeof consultationInputsSchema>;

export function captureGlobalTarget(run: ConsultationTarget['run'], context: GlobalContext): ConsultationTarget | null {
  if (context.session === null || context.ref === null || context.point === null) return null;
  return consultationTargetSchema.parse({ role: 'global-fork', run, session: context.session, ref: context.ref, point: context.point });
}

/** Recovery and continued turns read the dispatch, never the live global context. */
export function localConsultationInputs(events: readonly RunEvent[], workItem: string, before = Infinity): ConsultationInputs {
  const dispatch = events.filter(event => event.sequence < before && (event.type === 'work-item-started' || event.type === 'work-item-resumed') && event.data.workItem === workItem).at(-1);
  const global = dispatch !== undefined && (dispatch.type === 'work-item-started' || dispatch.type === 'work-item-resumed') ? dispatch.data.globalTarget : undefined;
  return global == null ? { unavailable: 'This work dispatch recorded no settled global architect point.' } : { global };
}

/** Repairs and handbacks use the original assignment event, including nested capability tasks. */
export function engineerConsultationInputs(events: readonly RunEvent[], run: ConsultationTarget['run'], assignment: string): ConsultationInputs {
  const assigned = events.find(event => (event.type === 'iteration-assigned' && event.data.iteration === assignment) || (event.type === 'capability-assigned' && event.data.assignment === assignment));
  if (assigned === undefined || (assigned.type !== 'iteration-assigned' && assigned.type !== 'capability-assigned') || assigned.data.architectRef == null) return { unavailable: 'This assignment recorded no assigning architect point.' };
  const { session, ref } = assigned.data.architectRef;
  const parsed = consultationTargetSchema.safeParse({ role: assigned.type === 'capability-assigned' ? 'capability-architect' : 'local-architect',
    run, session, ref, point: { session, invocation: assigned.data.invocation }, ...(assigned.type === 'capability-assigned' ? { task: assigned.data.task } : {}) });
  if (!parsed.success) return { unavailable: 'The assignment has no valid provider-neutral architect point.' };
  const assigning = parsed.data;
  return assigned.type === 'capability-assigned' ? { assigning }
    : { ...localConsultationInputs(events, assigned.data.workItem, assigned.sequence), assigning };
}

export function unavailableConsultation(inputs: ConsultationInputs | undefined, reason: string): ConsultationInputs {
  const { assigning, global } = inputs ?? {};
  const provenance = assigning === undefined && global === undefined ? inputs?.provenance : { ...(assigning === undefined ? {} : { assigning }), ...(global === undefined ? {} : { global }) };
  return { unavailable: reason, ...(provenance === undefined ? {} : { provenance }) };
}

export function consultationAvailability(inputs: ConsultationInputs | undefined, role: string): { target: ConsultationTarget | null; global: ConsultationTarget | null; reason: string | null } {
  const target = role === 'engineer' ? inputs?.assigning : role === 'local-architect' ? inputs?.global : undefined;
  return { target: target ?? null, global: target?.role === 'local-architect' ? inputs?.global ?? null : null,
    reason: target === undefined ? inputs?.unavailable ?? 'These inputs recorded no consultation target.' : null };
}

/** A captured fact in new input renderings; old inputs keep their original task bytes. */
export function consultationContext(inputs: ConsultationInputs | null | undefined, role: string): string {
  if (inputs == null) return '';
  const available = consultationAvailability(inputs, role);
  return available.target === null ? `\n\nConsultation context unavailable: ${available.reason}`
    : `\n\nConsultation context: ${available.target.role}, session ${available.target.session}, point ${JSON.stringify(available.target.point)}. Inherited observations may be stale; current files and generated views can differ.`;
}
