import { z } from 'zod';

export const consultArchitectName = 'consult_architect';
export const architectAnswerName = 'answer_architect_consultation';
const nonblank = z.string().refine(value => value.trim().length > 0, 'Must contain a nonblank string');
export const consultationMessageSchema = z.object({ message: nonblank }).strict();
export const architectAnswerSchema = z.object({ answer: nonblank }).strict();
export const architectAnswerJsonSchema = z.toJSONSchema(architectAnswerSchema);
export const consultArchitectDeclaration = {
  name: consultArchitectName,
  description: 'Consult your assigning architect for explanation or research help. Advisory only: advice changes no assignment, scope, permissions, source or architectural decision. Include relevant new facts; inherited context is pinned and may be stale.',
  inputSchema: z.toJSONSchema(consultationMessageSchema), mutating: false,
} as const;
