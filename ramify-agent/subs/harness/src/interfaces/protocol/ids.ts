import { z } from 'zod';

/** A plan's ID: the name of its directory under `plans/`, never hidden. */
export const planIdSchema = z.string().regex(/^(?!\.)[^/\\\x00-\x1f]+$/, 'A plan ID is one non-hidden path segment');
export type PlanId = z.infer<typeof planIdSchema>;

/** A job's ID: letters, digits, `_` and `-`, starting with a letter or digit. */
export const jobIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'A job ID is letters, digits, "_" and "-"');
export type JobId = z.infer<typeof jobIdSchema>;
