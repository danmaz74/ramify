import { z } from 'zod';
import { passageReferenceSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';

const text = z.string().min(1);

/** The accepted architect judgment; capture alone never incorporates text. */
export const incorporationSchema = z.object({
  schema: z.literal('ramify-agent.document-incorporation/1'),
  documents: z.array(z.object({
    document: z.string().regex(/^doc-\d{3,}$/),
    scenarios: z.boolean(),
    governing: z.array(passageReferenceSchema).min(1),
    uncertainty: z.string(),
  }).strict()),
  missing: z.array(z.object({ target: text, judgment: z.enum(['required', 'unclear', 'advisory']), reason: text }).strict()),
}).strict();
