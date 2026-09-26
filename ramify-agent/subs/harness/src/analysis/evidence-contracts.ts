import { z } from 'zod';

const text = z.string().min(1);
const documentId = z.string().regex(/^doc-\d{3,}$/);

/**
 * The intake's accepted judgment of which captured plan documents supply
 * binding scenarios, and of every missing reference; capture alone never
 * incorporates text.
 */
export const incorporationSchema = z.object({
  schema: z.literal('ramify-agent.document-incorporation/2'),
  documents: z.array(z.object({
    document: documentId,
    scenarios: z.boolean(),
    uncertainty: z.string(),
  }).strict()),
  missing: z.array(z.object({
    from: documentId, target: text,
    source: z.object({ start: z.int().nonnegative(), end: z.int().positive() }).strict(),
    judgment: z.enum(['required', 'unclear', 'advisory']), reason: text,
  }).strict()),
}).strict();
export type Incorporation = z.infer<typeof incorporationSchema>;
export type SubmittedIncorporation = Omit<Incorporation, 'schema'>;
