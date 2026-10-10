import { z } from 'zod';
import { transcriptBodySchema } from '../interfaces/protocol/transcripts.js';
import { roleSchema } from '../interfaces/protocol/runs.js';
import { sessionIdSchema } from '../run/records.js';
import { consultationTargetSchema } from './targets.js';
const text = z.string().min(1);
export const consultationId = (invocation: string, toolCall: string): string => `consult-${encodeURIComponent(invocation)}:${encodeURIComponent(toolCall)}`;
const transcriptRefSchema = z.object({ session: sessionIdSchema, entry: z.int().positive().nullable() }).strict();
export const consultationStartSchema = z.object({
  schema: z.literal('ramify-agent.consultation-start/1'), id: text,
  caller: z.object({ invocation: text, toolCall: text, session: sessionIdSchema, role: roleSchema,
    work: z.object({ workItem: text.optional(), iteration: text.optional(), task: text.optional() }).strict() }).strict(),
  parent: text.nullable(), target: consultationTargetSchema, globalTarget: consultationTargetSchema.nullable(), startedAt: z.iso.datetime(),
  message: transcriptBodySchema, request: transcriptRefSchema,
}).strict();
export type ConsultationStart = z.infer<typeof consultationStartSchema>;
export const consultationOutcomeSchema = z.object({
  schema: z.literal('ramify-agent.consultation-outcome/1'), id: text,
  status: z.enum(['answered', 'failed', 'cancelled', 'incomplete']), endedAt: z.iso.datetime().nullable(),
  child: z.object({ invocation: text, session: sessionIdSchema.nullable() }).strict().nullable(),
  /** Acceptance and observed tool result delivery are separate facts. */
  accepted: z.object({ submission: text, answer: transcriptBodySchema }).strict().nullable(),
  error: z.object({ code: text, message: transcriptBodySchema }).strict().nullable(),
  delivery: z.enum(['recorded', 'not-recorded', 'unknown']), result: transcriptRefSchema.nullable(),
}).strict();
export type ConsultationOutcome = z.infer<typeof consultationOutcomeSchema>;
export const consultationLayout = {
  start: (id: string): string => `consultations/${encodeURIComponent(id)}/start.json`,
  outcome: (id: string, revision = 1): string => `consultations/${encodeURIComponent(id)}/outcome.${revision}.json`,
};
