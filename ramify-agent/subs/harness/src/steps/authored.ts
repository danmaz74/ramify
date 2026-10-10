import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readJsonLines } from '../../subs/ledger/src/jsonl.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { contextSelectorSubmissionSchema, prepareContextSelection } from '../context-selection/submissions.js';
import { reviewRequestSchema } from '../reviews/records.js';
import { runLayout } from '../run/records.js';
import { validateAgainst } from '../run/submissions.js';
import { iterationAssignmentSchema } from '../work/iterations.js';
import { workItemOutlineSchema, workItemSchema } from '../work/records.js';
import { checkpointOf, testPolicyOf } from '../work/scope.js';
import { localArchitectSubmissionSchema } from '../work/submission.js';
import { parseStepInputs, validateStepInputs, type StepInputs } from './inputs.js';
import { judgeWorkTurn } from './local-architect.js';

/*
 * Inputs an author supplies in place of what a recorded invocation had: a
 * work item, an outline, an assignment, a selection or a review request.
 * Each is judged as its producing role's output, with the schemas and rules
 * the run applies and the context the run recorded for that role; missing
 * context refuses the file with what is missing, and nothing is defaulted.
 * What the authored file cannot change without inputs these records cannot
 * derive again is refused with the reason.
 */

/** The authored files, by option. */
export interface AuthoredFiles {
  readonly workItem?: string | undefined;
  readonly outline?: string | undefined;
  readonly assignment?: string | undefined;
  readonly selection?: string | undefined;
  readonly reviewRequest?: string | undefined;
}

/** What an assignment's scope is prepared with: the provider and the architect view as they stand. */
export interface AuthoringContext {
  readonly ramify: RamifyCli;
  readonly index: (projectRoot: string) => Promise<ArchitectIndex | null>;
}

export type AuthoredResult =
  | { readonly status: 'refused'; readonly reason: string }
  | { readonly status: 'authored'; readonly inputs: StepInputs };

/** The option each authored file is named by. */
export const authoredOptions = { workItem: '--work-item', outline: '--outline', assignment: '--assignment', selection: '--selection', reviewRequest: '--review-request' } as const;

/** Which recorded inputs each authored file replaces part of. */
const replaces = {
  workItem: 'a local architect orientation or work turn',
  outline: 'a local architect orientation or work turn',
  assignment: 'an engineer',
  selection: 'a local architect work turn',
  reviewRequest: 'a code, scope or design review',
} as const;

/** The context each authored file is judged with, which only a run records. */
const contextOf = {
  workItem: 'the work item\'s recorded briefing, which the authored work item replaces',
  outline: 'the work item\'s recorded briefing and outlines',
  assignment: 'the producing work turn\'s registry, hypotheses, decisions, open requirements, obligations, guarded paths, view and scope revision, and the engineer inputs the assignment is given with',
  selection: 'the element catalog, plan deviations and work-item elements of the work item\'s recorded selection',
  reviewRequest: 'the audited candidate\'s captured briefing that the request is asked of',
} as const;

/** The refusal of authored files given without a recorded invocation whose context judges them. */
export function missingContext(files: AuthoredFiles): string {
  const named = (Object.keys(authoredOptions) as (keyof AuthoredFiles)[]).filter(key => files[key] !== undefined);
  return `authored inputs are judged as their producing role's output, with the context a run records for that role; name the run and an invocation with --from-run and --invocation. Missing: ${
    named.map(key => `${authoredOptions[key]} needs ${contextOf[key]}`).join('; ')}`;
}

const refused = (reason: string): AuthoredResult => ({ status: 'refused', reason });
const canonical = (value: unknown): string => JSON.stringify(value, (_key, entry: unknown) =>
  entry !== null && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : entry);
const issues = (errors: readonly { readonly path: string; readonly message: string }[]): string => errors.map(error => `${error.path || '(root)'}: ${error.message}`).join('; ');

async function readAuthored(path: string): Promise<unknown> {
  const bytes = await readFile(resolve(path), 'utf8');
  return JSON.parse(bytes) as unknown;
}

/**
 * Applies authored files to the fresh inputs imported from a run, judging
 * each as its producing role's output. The run directory and the project
 * root supply the context the run recorded.
 */
export async function applyAuthored(base: StepInputs, files: AuthoredFiles, run: { readonly directory: string; readonly projectRoot: string },
  context: AuthoringContext): Promise<AuthoredResult> {
  let inputs: StepInputs = base;
  const authored: (typeof authoredKinds)[number][] = [];
  for (const key of Object.keys(authoredOptions) as (keyof AuthoredFiles)[]) {
    const path = files[key];
    if (path === undefined) continue;
    let value: unknown;
    try { value = await readAuthored(path); }
    catch (error) { return refused(`${authoredOptions[key]} ${path} cannot be read as JSON: ${message(error)}`); }
    const applied = await apply(key, value, inputs, run, context);
    if (typeof applied === 'string') return refused(`${authoredOptions[key]} ${path}: ${applied}`);
    inputs = applied;
    authored.push(authoredKinds[Object.keys(authoredOptions).indexOf(key)]!);
  }
  try {
    return { status: 'authored', inputs: validateStepInputs({ ...inputs, provenance: { ...inputs.provenance!, authored } }) };
  } catch (error) {
    return refused(`the authored inputs are not valid step inputs: ${message(error)}`);
  }
}

const authoredKinds = ['work-item', 'outline', 'assignment', 'selection', 'review-request'] as const;

async function apply(key: keyof AuthoredFiles, value: unknown, inputs: StepInputs, run: { readonly directory: string; readonly projectRoot: string },
  context: AuthoringContext): Promise<StepInputs | string> {
  const wrongRole = `it replaces part of ${replaces[key]}'s inputs, not of ${describe(inputs)}`;
  switch (key) {
    case 'workItem': {
      if (inputs.role !== 'local-architect') return wrongRole;
      const parsed = workItemSchema.safeParse(value);
      if (!parsed.success) return `not a work item: ${zodIssues(parsed.error.issues)}`;
      const recorded = inputs.briefing.item;
      if (parsed.data.id !== recorded.id || parsed.data.module !== recorded.module) {
        return `the work item ${parsed.data.id} in ${parsed.data.module} is not the recorded ${recorded.id} in ${recorded.module}, whose briefing these inputs hold`;
      }
      return { ...inputs, briefing: { ...inputs.briefing, item: parsed.data } };
    }
    case 'outline': {
      if (inputs.role !== 'local-architect') return wrongRole;
      const parsed = workItemOutlineSchema.safeParse(value);
      if (!parsed.success) return `not a work-item outline: ${zodIssues(parsed.error.issues)}`;
      if (parsed.data.workItem !== inputs.work.workItem) return `the outline is of ${parsed.data.workItem}, not of ${inputs.work.workItem}`;
      const outlines = inputs.briefing.outlines;
      const at = outlines.findIndex(outline => outline.revision === parsed.data.revision);
      const last = outlines.at(-1)?.revision ?? 0;
      if (at < 0 && parsed.data.revision !== last + 1) return `outline revision ${parsed.data.revision} neither replaces a recorded revision nor follows the last, ${last}`;
      return { ...inputs, briefing: { ...inputs.briefing, outlines: at < 0 ? [...outlines, parsed.data] : outlines.map((outline, index) => index === at ? parsed.data : outline) } };
    }
    case 'selection': {
      if (inputs.role !== 'local-architect' || inputs.phase !== 'work-turn') return wrongRole;
      const parsed = validateAgainst(contextSelectorSubmissionSchema, value);
      if (!parsed.ok) return `the context selector's submission schema refuses it: ${issues(parsed.errors)}`;
      const selector = await latestRecorded(run.directory, inputs.work.workItem, entry => entry.role === 'context-selector');
      if (typeof selector === 'string') return `missing context: ${selector}`;
      if (selector.role !== 'context-selector') return 'missing context: unreachable';
      const prepared = prepareContextSelection(parsed.value, {
        workItem: inputs.work.workItem, orientationInvocation: selector.orientation.invocation, orientationPoint: selector.orientation.point,
        selectorInvocation: 'authored', degraded: selector.start.kind !== 'fork',
      }, { catalog: selector.catalog, planDeviations: selector.planDeviations, workItemElements: selector.workItemElements });
      if (prepared.status === 'unavailable') return `the selection rules refuse it: ${issues(prepared.errors)}`;
      const cited = prepared.selection.package;
      return { ...inputs, package: { hash: cited.hash, elements: [...cited.elements], deviations: [...cited.deviations], text: prepared.text } };
    }
    case 'reviewRequest': {
      if (inputs.role !== 'reviewer' || inputs.question === 'design-orientation') return wrongRole;
      const parsed = reviewRequestSchema.safeParse(value);
      if (!parsed.success) return `not a review request: ${zodIssues(parsed.error.issues)}`;
      const recorded = inputs.request;
      for (const field of ['key', 'workItem', 'assignment', 'base', 'gate', 'tree'] as const) {
        if (canonical(parsed.data[field]) !== canonical(recorded[field])) {
          return `its ${field} differs from the recorded request's; the captured briefing was read from the candidate that request names`;
        }
      }
      return { ...inputs, request: parsed.data };
    }
    case 'assignment':
      if (inputs.role !== 'engineer') return wrongRole;
      return authoredAssignment(value, inputs, run, context);
  }
}

/**
 * An authored assignment in its producing `assign` envelope, judged as the
 * work turn that assigned the recorded iteration judged its own: the local
 * architect's schema and rules over that turn's recorded evidence, then the
 * scope preparation the provider answers. The engineer inputs keep what the
 * assignment does not change; what would need the run to derive again is refused.
 */
async function authoredAssignment(value: unknown, inputs: Extract<StepInputs, { role: 'engineer' }>,
  run: { readonly directory: string; readonly projectRoot: string }, context: AuthoringContext): Promise<StepInputs | string> {
  const shape = validateAgainst(localArchitectSubmissionSchema, value);
  if (!shape.ok) return `the local architect's submission schema refuses it: ${issues(shape.errors)}`;
  if (shape.value.kind !== 'assign') return `it is a ${shape.value.kind} submission, not an assign envelope`;
  const events = await runEvents(run.directory);
  const assigned = events.find(event => event.type === 'iteration-assigned' && event.data.iteration === inputs.work.iteration);
  if (assigned === undefined) return `missing context: the run records no assignment of ${inputs.work.iteration}, so no work turn's evidence can judge it`;
  const turnInvocation = String(assigned.data.invocation);
  let turn: StepInputs;
  try { turn = parseStepInputs(await readFile(join(run.directory, runLayout.stepInputs(turnInvocation)), 'utf8')); }
  catch (error) { return `missing context: the work turn ${turnInvocation} that assigned ${inputs.work.iteration} recorded no usable step inputs (${message(error)})`; }
  if (turn.role !== 'local-architect' || turn.phase !== 'work-turn') return `missing context: invocation ${turnInvocation} recorded ${describe(turn)} inputs, not a work turn's`;
  let index: ArchitectIndex | null;
  try { index = await context.index(run.projectRoot); }
  catch (error) { return `missing context: the architect view cannot be read: ${message(error)}`; }
  const judged = await judgeWorkTurn({ inputs: turn }, value, { index, ramify: context.ramify, projectRoot: run.projectRoot });
  if (!judged.verdict.ok) return `the local architect's rules refuse it: ${issues(judged.verdict.errors)}`;
  if (judged.prepared === undefined) return 'it carries no assignment whose scope the provider can capture';
  const body = judged.prepared.body;
  const recorded = inputs.assignment;
  // What the engineer inputs derive from beyond the assignment's own text.
  const unchanged: [string, unknown, unknown][] = [
    ['kind', body.kind, recorded.kind],
    ['scope.base', body.scope.base, recorded.scope.base],
    ['scope.extra', body.scope.extra, recorded.scope.extra],
    ['citedElements', [...body.citedElements].sort(), [...recorded.source?.elements ?? []].sort()],
    ['obligations', body.obligations ?? [], recorded.obligations ?? []],
    ['authorizations', (body.authorizations ?? []).map(entry => entry.path).sort(), recorded.authorizations.map(entry => entry.path).sort()],
    ['bounds', body.bounds ?? {}, recorded.bounds ?? {}],
  ];
  const changed = unchanged.filter(([, now, then]) => canonical(now) !== canonical(then)).map(([field]) => field);
  if (changed.length > 0) return `it changes ${changed.join(', ')}, which the engineer inputs derive the gate, test policy, focused command and protected files from; these records cannot derive them again`;
  if (shape.value.localDecisions.length > 0) return 'it carries local decisions, which a run commits before the assignment; an authored assignment commits nothing';
  const scope = judged.prepared.scope;
  const tests = testPolicyOf(body.kind, scope.base, recorded.evidenceObligations, scope.extra, scope.resolved.included);
  if (canonical(tests) !== canonical(recorded.gate.tests)) return 'its scope changes the test policy the recorded engineer inputs were derived with';
  const assignment = iterationAssignmentSchema.parse({
    ...recorded, stage: body.stage, goal: body.goal, approach: body.approach, scope, completionEvidence: body.completionEvidence,
    externalCapabilities: body.externalCapabilities, gate: { checkpoint: checkpointOf(body.kind), tests },
    ...(body.startingPoints === undefined ? {} : { startingPoints: body.startingPoints }),
  });
  const { startingPoints: _points, ...withoutPoints } = assignment;
  return {
    ...inputs,
    assignment: body.startingPoints === undefined ? withoutPoints as typeof assignment : assignment,
    startingPoints: inputs.startingPoints === null ? null : { origin: inputs.startingPoints.origin, ...(body.startingPoints === undefined ? {} : { points: body.startingPoints }) },
  };
}

/** The latest invocation of a work item whose recorded inputs match, or why there is none. */
async function latestRecorded(directory: string, workItem: string, matches: (inputs: StepInputs) => boolean): Promise<StepInputs | string> {
  const events = await runEvents(directory);
  const started = events.filter(event => event.type === 'invocation-started' && (event.data.work as { workItem?: string } | undefined)?.workItem === workItem).reverse();
  for (const event of started) {
    try {
      const inputs = parseStepInputs(await readFile(join(directory, runLayout.stepInputs(String(event.data.invocation))), 'utf8'));
      if (matches(inputs)) return inputs;
    } catch { /* An invocation without step inputs records no context to judge with. */ }
  }
  return `the run records no selection of ${workItem} with step inputs, whose catalog and elements judge one`;
}

async function runEvents(directory: string): Promise<{ readonly type: string; readonly data: Record<string, unknown> }[]> {
  const loaded = await readJsonLines(join(directory, runLayout.events));
  return loaded.records.map(record => (record as { event: { type: string; data: Record<string, unknown> } }).event);
}

function describe(inputs: StepInputs): string {
  return inputs.role === 'local-architect' ? `a local architect ${inputs.phase}` : inputs.role === 'reviewer' ? `a ${inputs.question} reviewer` : `a ${inputs.role}`;
}

function zodIssues(list: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[]): string {
  return list.map(issue => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`).join('; ');
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
