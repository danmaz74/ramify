import { z } from 'zod';

/** Declared navigation help only; it confers no read/write or completion authority. */
export const startingPointSchema = z.object({
  path: z.string().min(1).regex(
    /^(?!\/|~|[A-Za-z]:)(?!.*[\\*?\[\]{}\x00-\x1f\x7f])(?!.*[!+@]\()(?:\.|(?!(?:\.{1,2})(?:\/|$))[^/]+(?:\/(?!(?:\.{1,2})(?:\/|$))[^/]+)*)$/u,
    'A literal normalized project-relative file or directory, without absolute paths, traversal or globs',
  ),
  note: z.string().min(1).regex(/\S/u, 'A short explanation of what to inspect'),
}).strict();
export type StartingPoint = z.infer<typeof startingPointSchema>;

export const startingPointsSchema = z.array(startingPointSchema).optional().describe(
  'Optional useful locations already encountered, each with a short note. Paths are project-relative navigation hints; '
  + 'they do not authorize writes, bind obligations or establish completion. Omit when there are none to share.',
);
