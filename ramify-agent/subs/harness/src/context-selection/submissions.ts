import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { JsonSchema } from '../../subs/agent/src/interfaces/port.js';
import {
  passageReferenceSchema, type Catalog, type DocumentManifest,
} from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { contextSelectionSchema, type ContextSelection } from './contracts.js';
import { assembleContextPackage, type SelectionPackage } from './selection.js';

const text = z.string().min(1);

/** The local architect's first, assignment-free turn for one work item. */
export const workOrientationSubmissionSchema = z.object({
  focus: text,
  currentUnderstanding: text,
  questions: z.array(text),
}).strict();
export type WorkOrientationSubmission = z.infer<typeof workOrientationSubmissionSchema>;
export const workOrientationToolName = 'submit_work_orientation';
export const workOrientationJsonSchema = z.toJSONSchema(workOrientationSubmissionSchema) as JsonSchema;

/** Selector judgments only; invocation identity and package hash belong to the harness. */
export const contextSelectorSubmissionSchema = z.object({
  examined: z.array(text),
  selected: z.array(z.object({
    item: text,
    passage: passageReferenceSchema.optional(),
    reason: text,
    conditions: z.array(text),
    uncertainty: z.string(),
  }).strict()),
  unavailable: z.array(z.object({ item: text, reason: text }).strict()),
}).strict();
export type ContextSelectorSubmission = z.infer<typeof contextSelectorSubmissionSchema>;
export const contextSelectorToolName = 'submit_context_selection';
export const contextSelectorJsonSchema = z.toJSONSchema(contextSelectorSubmissionSchema) as JsonSchema;

export interface OrientationPacketInput {
  readonly workItem: string;
  /** The exact local architect briefing the parent saw before orienting. */
  readonly briefing: string;
  readonly submission: WorkOrientationSubmission;
}

/** Rebuildable packet from a committed orientation, with no inferred plan force. */
export function orientationPacket(input: OrientationPacketInput): { readonly text: string; readonly hash: string } {
  const submission = workOrientationSubmissionSchema.parse(input.submission);
  const text = [
    `# Work orientation ${input.workItem}`,
    '', '## Local architect briefing', '', input.briefing,
    '', '## Local architect orientation', '',
    `Focus: ${submission.focus}`,
    `Current understanding: ${submission.currentUnderstanding}`,
    'Open questions:',
    ...(submission.questions.length === 0 ? ['None recorded.'] : submission.questions.map(question => `- ${question}`)),
  ].join('\n');
  return { text, hash: createHash('sha256').update(text, 'utf8').digest('hex') };
}

export interface SelectionIdentity {
  readonly workItem: string;
  readonly orientationInvocation: string;
  readonly orientationPoint: string | null;
  readonly selectorInvocation: string;
  readonly degraded: boolean;
}

export type PreparedSelection = { readonly status: 'available'; readonly selection: ContextSelection; readonly package: Extract<SelectionPackage, { status: 'available' }> } |
  { readonly status: 'unavailable'; readonly errors: readonly string[] };

/** The harness supplies IDs and records a hash of the assembled context text. */
export function prepareContextSelection(
  submitted: unknown,
  identity: SelectionIdentity,
  catalog: Catalog,
  manifest: DocumentManifest,
  bytes: ReadonlyMap<string, Uint8Array>,
): PreparedSelection {
  const parsed = contextSelectorSubmissionSchema.safeParse(submitted);
  if (!parsed.success) return { status: 'unavailable', errors: ['Invalid selector submission'] };
  const catalogIds = new Set(catalog.items.map(item => item.id));
  const candidate = { schema: 'ramify-agent.context-selection/1' as const, ...identity, ...parsed.data,
    selected: parsed.data.selected.map(entry => catalogIds.has(entry.item)
      ? { item: entry.item, reason: entry.reason, conditions: entry.conditions, uncertainty: entry.uncertainty }
      : entry),
  };
  const assembled = assembleContextPackage(candidate, catalog, manifest, bytes);
  if (assembled.status === 'unavailable') return assembled;
  const selection = contextSelectionSchema.parse({ ...candidate, packageHash: assembled.hash });
  return { status: 'available', selection, package: assembled };
}
