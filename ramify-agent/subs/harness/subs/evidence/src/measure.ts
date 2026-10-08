import { z } from 'zod';
import type { RamifyCli } from './ramify-cli.js';

/*
 * The measurement document Ramify produces. Its format stays here: a caller
 * names the project and receives per-module buckets, or the reason there are
 * none. A producer that cannot be run, a document of another version and a
 * document the format rejects are each unavailable with that reason. None of
 * them is a zero.
 */

const bucketSchema = z.object({
  production: z.object({ sourceFiles: z.number(), sourceBytes: z.number(), resourceFiles: z.number(), resourceBytes: z.number() }),
  tests: z.object({ sourceFiles: z.number(), sourceBytes: z.number(), resourceFiles: z.number(), resourceBytes: z.number() }),
  documentation: z.object({ files: z.number(), bytes: z.number() }),
  // The /2 producer omits view bytes when its projection was unavailable.
  views: z.object({ ordinaryBytes: z.number(), testsBytes: z.number() }).optional(),
});

export const moduleSchema = z.object({
  id: z.string(),
  dir: z.string(),
  parent: z.string().nullable(),
  /** This module alone. */
  exact: bucketSchema,
  /** This module and every descendant. */
  subtree: bucketSchema,
});

/** The one document version this reader supports. */
export const measureSchemaVersion = 'ramify.measure/2';

export const documentSchema = z.object({
  schema: z.literal(measureSchemaVersion),
  revision: z.string(),
  root: z.string(),
  ownershipRule: z.string(),
  /** Whether the generated views were measured, as the producer reports it. */
  views: z.union([z.literal('measured'), z.object({ state: z.literal('unavailable'), reason: z.enum(['not-requested', 'resource-unavailable', 'analysis-failed']) })]),
  modules: z.array(moduleSchema),
  files: z.array(z.object({
    path: z.string(), owner: z.string(), area: z.enum(['ordinary', 'tests', 'documentation']),
    kind: z.enum(['source', 'resource', 'documentation']), bytes: z.number(),
  })),
}).loose();

/** One module's measured bytes, by source area, for itself and for its subtree. */
export type ModuleMeasurement = z.infer<typeof moduleSchema>;

/** A `ramify.measure/2` document: its revision, its root and its per-module buckets. */
export type MeasurementDocument = z.infer<typeof documentSchema>;

/** The document, or the reason the project has none. A reason is never a zero. */
export type MeasurementRead =
  | { readonly available: true; readonly document: MeasurementDocument; readonly raw: string }
  | { readonly available: false; readonly unavailable: string };

/**
 * Read the project's measurement document with `ramify measure --format json`
 * and validate it. `raw` is the producer's bytes, for a caller that stores the
 * document verbatim with its hash.
 */
export async function readMeasurement(ramify: RamifyCli, projectRoot: string, signal?: AbortSignal): Promise<MeasurementRead> {
  const run = await ramify.run(['measure', '--root', projectRoot, '--format', 'json'], projectRoot, signal);
  if (run.code !== 0) {
    const detail = `${run.stderr}\n${run.stdout}`.trim();
    return { available: false, unavailable: `\`ramify measure\` exited with ${run.code}${detail === '' ? '' : `: ${detail.slice(-2000)}`}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(run.stdout);
  } catch (error) {
    return { available: false, unavailable: `\`ramify measure\` did not print a JSON document: ${(error as Error).message}` };
  }

  const declared = (parsed as { schema?: unknown } | null)?.schema;
  if (declared !== measureSchemaVersion) {
    return { available: false, unavailable: `the measurement document declares ${typeof declared === 'string' ? declared : 'no schema'}, and this reader supports ${measureSchemaVersion}` };
  }

  const result = documentSchema.safeParse(parsed);
  if (!result.success) {
    const messages = result.error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    return { available: false, unavailable: `the measurement document is not valid: ${messages.join('; ')}` };
  }
  return { available: true, document: result.data, raw: run.stdout };
}
