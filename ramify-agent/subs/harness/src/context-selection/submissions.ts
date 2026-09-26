import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { JsonSchema } from '../../subs/agent/src/interfaces/port.js';
import type { ElementCatalog, PackageDeviation } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import type { SubmissionError } from '../run/submissions.js';
import { contextSelectionSchema, type ContextSelection } from './contracts.js';
import { citePackage } from './delivery.js';
import { selectableKinds } from './prompts.js';

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

/** Selector judgments only: the elements it selects by ID. Invocation identity and the package belong to the harness. */
export const contextSelectorSubmissionSchema = z.object({
  selected: z.array(z.object({
    id: text,
    reason: text,
    conditions: z.array(text),
    uncertainty: z.string(),
  }).strict()),
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

export type PreparedSelection = { readonly status: 'available'; readonly selection: ContextSelection; readonly text: string } |
  { readonly status: 'unavailable'; readonly errors: readonly SubmissionError[] };

/** What a selection is made over: the frozen catalog, the work item's own elements and the run's plan deviations. */
export interface SelectionSource {
  readonly catalog: ElementCatalog;
  /** The entry's functional and context elements, which every work-item package carries. */
  readonly workItemElements: readonly string[];
  readonly planDeviations: readonly PackageDeviation[];
}

/**
 * Validate a selector's IDs, each once and each a non-functional, fixed or
 * recommendation element of the catalog, and cite the work-item package
 * with every plan deviation recorded so far.
 */
export function prepareContextSelection(submitted: ContextSelectorSubmission, identity: SelectionIdentity, source: SelectionSource): PreparedSelection {
  const kinds = new Map(source.catalog.elements.map(element => [element.id, element.kind]));
  const errors: SubmissionError[] = [];
  const seen = new Set<string>();
  submitted.selected.forEach((entry, index) => {
    const kind = kinds.get(entry.id);
    if (kind === undefined) errors.push({ path: `selected.${index}.id`, message: `Unknown element ${entry.id}`, expected: 'an element ID of the message' });
    else if (!(selectableKinds as readonly string[]).includes(kind)) errors.push({ path: `selected.${index}.id`, message: `${entry.id} is a ${kind} element, which the work item carries already`, expected: 'a non-functional, fixed or recommendation element' });
    if (seen.has(entry.id)) errors.push({ path: `selected.${index}.id`, message: `${entry.id} is selected twice`, expected: 'each element once' });
    seen.add(entry.id);
  });
  if (errors.length > 0) return { status: 'unavailable', errors };
  const cited = citePackage(source.catalog, source.planDeviations,
    [...source.workItemElements, ...submitted.selected.map(entry => entry.id)], source.planDeviations.map(deviation => deviation.id));
  if ('missing' in cited) return { status: 'unavailable', errors: [{ path: 'selected', message: `The work-item package cites IDs the run does not hold: ${cited.missing.join(', ')}` }] };
  const selection = contextSelectionSchema.parse({ schema: 'ramify-agent.context-selection/2', ...identity,
    selected: submitted.selected.map(entry => ({ ...entry })), package: cited.citation });
  return { status: 'available', selection, text: cited.text };
}
