import { z } from 'zod';
import type { JsonSchema, ToolDefinition } from '../../subs/agent/src/interfaces/port.js';
import { inspectGit } from '../../subs/evidence/src/git.js';

const requestSchema = z.object({
  operation: z.enum(['status', 'diff', 'log', 'show']),
  revision: z.string().optional(),
  to: z.string().optional(),
  staged: z.boolean().optional(),
  paths: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

/** Both coordinating roles receive this same tool; untracked content uses ordinary file reads. */
export function createGitInspectionTool(projectRoot: string, signal?: AbortSignal): ToolDefinition {
  return {
    name: 'inspect_git',
    description: 'Read project Git status, diff, log or show. Default diff compares the working tree with HEAD; staged selects the index. Status includes untracked paths: read their content with the normal read tool. Paths are project-relative. This tool cannot write source, index or refs.',
    inputSchema: z.toJSONSchema(requestSchema) as JsonSchema,
    execute: async input => {
      const parsed = requestSchema.safeParse(input);
      if (!parsed.success) return { text: parsed.error.message, isError: true };
      try { return { text: await inspectGit(projectRoot, parsed.data, signal) }; }
      catch (error) { return { text: error instanceof Error ? error.message : String(error), isError: true }; }
    },
  };
}
