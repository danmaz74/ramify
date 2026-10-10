import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { SessionToolDeclaration } from '../../subs/agent/src/interfaces/session-operations.js';
import type { TaskPacket } from '../prompts/tasks.js';
import { loadPromptPackages } from '../prompts/packages.js';
import { invocationSchema, runLayout, runRecordSchema } from '../run/records.js';
import { readRecordedOperation } from '../run/session-operations.js';
import { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { loadArchitectIndex } from '../../subs/evidence/src/views.js';
import { contextSelectorToolName, workOrientationToolName } from '../context-selection/submissions.js';
import { orientationToolName, reviewToolName } from '../../subs/reviews/src/submission.js';
import { engineerToolName } from '../work/engineer.js';
import { localArchitectToolName } from '../work/submission.js';
import { applyAuthored, type AuthoredFiles, type AuthoringContext } from './authored.js';
import { constructStep } from './construct.js';
import { parseStepInputs, StepInputsError, stepRoles, validateStepInputs, type StepInputs } from './inputs.js';
import { renderStep, type RenderEnvironment, type RenderedStep } from './render.js';

/*
 * Step inputs imported from a run: the structured inputs the run recorded
 * before the invocation started, never a reading of the prompt prose. The
 * imported step starts fresh with the complete briefing, whatever start the
 * original had, which it keeps as provenance; no provider history is
 * imported. Rendering the recorded start again and comparing it with the
 * recorded delivery is a diagnostic, never a condition of the import.
 */

export interface InputsFromRunOptions {
  readonly role: string;
  /** The run directory, `<project>/plans/<plan>/.harness/jobs/<run>`. */
  readonly runDirectory: string;
  readonly invocation: string;
  /** The executor's built-in declarations the comparison renders with. */
  readonly builtinDeclarations: RenderEnvironment['builtinDeclarations'];
  /** The skill directory of the prompt packages, for a test that supplies its own. */
  readonly skillDirectory?: string | undefined;
  /** Files an author supplies in place of parts of the recorded inputs, each judged as its producing role's output. */
  readonly authored?: AuthoredFiles | undefined;
  /** The provider and the architect view an authored assignment's scope is prepared with; the installed ones where absent. */
  readonly authoring?: AuthoringContext | undefined;
}

/** How the recorded start renders today against what the run delivered. */
export type DeliveryComparison =
  | { readonly status: 'equal' }
  | { readonly status: 'different'; readonly sections: readonly string[] }
  | { readonly status: 'not-compared'; readonly reason: string };

export type InputsFromRunResult =
  | { readonly status: 'refused'; readonly reason: string }
  | {
      readonly status: 'imported';
      readonly projectRoot: string;
      /** The inputs the run recorded, with their original start. */
      readonly recorded: StepInputs;
      /** The fresh inputs a re-execution starts from, the original start kept as provenance. */
      readonly inputs: StepInputs;
      readonly comparison: DeliveryComparison;
    };

const supportedRoles: readonly string[] = stepRoles;

/** The submission tools of the invocations a step constructor builds: the first set. */
const constructedSubmissions = [engineerToolName, workOrientationToolName, contextSelectorToolName, localArchitectToolName, reviewToolName, orientationToolName];
const invocationId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

/** The project root and identities a run directory names, or why it names none. */
function runLocation(directory: string): { readonly projectRoot: string; readonly planId: string; readonly runId: string } | string {
  const run = resolve(directory);
  const jobs = dirname(run);
  const harness = dirname(jobs);
  const plan = dirname(harness);
  const plans = dirname(plan);
  if (basename(jobs) !== 'jobs' || basename(harness) !== '.harness' || basename(plans) !== 'plans') {
    return `${run} is not a run directory: expected <project>/plans/<plan>/.harness/jobs/<run>`;
  }
  return { projectRoot: dirname(plans), planId: basename(plan), runId: basename(run) };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

/** Imports one invocation's step inputs from a run, or refuses with the reason. */
export async function inputsFromRun(options: InputsFromRunOptions): Promise<InputsFromRunResult> {
  if (!supportedRoles.includes(options.role)) return refused(`no step inputs are defined for the role "${options.role}"; supported: ${supportedRoles.join(', ')}`);
  if (!invocationId.test(options.invocation)) return refused(`"${options.invocation}" is not an invocation id`);
  const location = runLocation(options.runDirectory);
  if (typeof location === 'string') return refused(location);
  const run = resolve(options.runDirectory);
  let record;
  try { record = runRecordSchema.safeParse(await readJson(join(run, runLayout.record))); }
  catch (error) { return refused(missing(error) ? `${run} records no run: ${runLayout.record} is missing` : `${runLayout.record} cannot be read: ${message(error)}`); }
  if (!record.success) return refused(`${runLayout.record} is not a run record this harness reads`);
  if (record.data.jobId !== location.runId || record.data.planId !== location.planId) return refused(`${runLayout.record} names run ${record.data.planId}/${record.data.jobId}, not its directory ${location.planId}/${location.runId}`);
  let invocation;
  try { invocation = invocationSchema.safeParse(await readJson(join(run, runLayout.invocation(options.invocation)))); }
  catch (error) { return refused(missing(error) ? `the run records no invocation ${options.invocation}` : `${runLayout.invocation(options.invocation)} cannot be read: ${message(error)}`); }
  if (!invocation.success) return refused(`${runLayout.invocation(options.invocation)} is not an invocation record this harness reads`);
  if (invocation.data.role !== options.role) {
    return refused(`invocation ${options.invocation} is a ${invocation.data.role} invocation, not ${options.role}${supportedRoles.includes(invocation.data.role) ? '' : `; no step inputs are defined for ${invocation.data.role}`}`);
  }
  // Only the structured inputs the run recorded are imported; the prompt prose is never read back into them.
  let recorded: StepInputs;
  try { recorded = parseStepInputs(await readFile(join(run, runLayout.stepInputs(options.invocation)), 'utf8')); }
  catch (error) {
    if (missing(error)) {
      // A role in the first set also makes invocations no step constructor builds yet.
      const delivered = await readRecordedOperation(join(location.projectRoot, 'plans', '.harness', 'session-operations'), location.runId, options.invocation).catch(() => null);
      const tool = delivered?.packet.submissionTool;
      if (tool !== undefined && !constructedSubmissions.includes(tool)) {
        return refused(`invocation ${options.invocation} is a ${options.role} start outside the first set: it submits through ${tool}, which no step constructor builds; supported submissions: ${constructedSubmissions.join(', ')}`);
      }
      return refused(`incomplete task records: invocation ${options.invocation} has no recorded step inputs (${runLayout.stepInputs(options.invocation)}); a run recorded before step inputs were captured cannot be imported`);
    }
    if (error instanceof StepInputsError) return refused(`incomplete task records: ${runLayout.stepInputs(options.invocation)} is not valid step inputs: ${error.errors.join('; ')}`);
    return refused(`${runLayout.stepInputs(options.invocation)} cannot be read: ${message(error)}`);
  }
  if (recorded.run.planId !== location.planId || recorded.run.runId !== location.runId) return refused(`the recorded step inputs name run ${recorded.run.planId}/${recorded.run.runId}, not ${location.planId}/${location.runId}`);
  const { start, provenance: _earlier, ...fields } = recorded;
  // A work turn keeps why it continued its session, which its task kind follows.
  const continuing = recorded.role === 'local-architect' && recorded.phase === 'work-turn' && recorded.start.continuing !== undefined
    ? { continuing: recorded.start.continuing } : {};
  let inputs = validateStepInputs({
    ...fields,
    start: { kind: 'fresh', ...continuing },
    provenance: {
      run: recorded.run,
      invocation: options.invocation,
      record: { run: runLayout.stepInputs(options.invocation) },
      originalStart: start.kind,
      ...(start.kind === 'fresh' ? {} : { originalPoint: start.point }),
    },
  });
  const authored = options.authored ?? {};
  if (Object.values(authored).some(path => path !== undefined)) {
    const applied = await applyAuthored(inputs, authored, { directory: run, projectRoot: location.projectRoot },
      options.authoring ?? { ramify: new RamifyCli(), index: loadArchitectIndex });
    if (applied.status === 'refused') return refused(applied.reason);
    inputs = applied.inputs;
  }
  const comparison = await compareDelivery(location.projectRoot, recorded, options, invocation.data.prompt.hash);
  return { status: 'imported', projectRoot: location.projectRoot, recorded, inputs, comparison };
}

/** Renders the recorded start with the current harness and compares it, section by section, with the recorded delivery. */
async function compareDelivery(projectRoot: string, recorded: StepInputs, options: InputsFromRunOptions, packageHash: string): Promise<DeliveryComparison> {
  const sessionOperations = join(projectRoot, 'plans', '.harness', 'session-operations');
  const delivered = await readRecordedOperation(sessionOperations, recorded.run.runId, options.invocation);
  if (delivered === null) return { status: 'not-compared', reason: `no delivery is recorded for invocation ${options.invocation}` };
  let rendered: RenderedStep;
  try {
    const { packages } = await loadPromptPackages({ capabilityWorkflow: recorded.capabilityWorkflow, ...(options.skillDirectory === undefined ? {} : { skillDirectory: options.skillDirectory }) });
    const step = constructStep(recorded, { projectRoot, packages });
    rendered = await renderStep(step, { projectRoot, packages, builtinDeclarations: options.builtinDeclarations, operationId: options.invocation, sessionOperations });
    const sections = differingSections(rendered, delivered);
    if (step.loaded.hash !== packageHash) sections.unshift(`prompt package (recorded ${packageHash}, current ${step.loaded.hash})`);
    if (rendered.fallback !== null) sections.unshift(`start (recorded ${delivered.mode}, rendered fresh: ${rendered.fallback})`);
    return sections.length === 0 ? { status: 'equal' } : { status: 'different', sections };
  } catch (error) {
    return { status: 'not-compared', reason: `the recorded start cannot be rendered: ${message(error)}` };
  }
}

/** The sections in which a rendering differs from a recorded delivery. */
export function differingSections(rendered: Pick<RenderedStep, 'packet' | 'declarations'>, delivered: { readonly packet: TaskPacket; readonly declarations: readonly SessionToolDeclaration[] }): string[] {
  const sections: string[] = [];
  const now = rendered.packet;
  const then = delivered.packet;
  if (now.roleInstructions !== then.roleInstructions) sections.push('role instructions');
  if (now.message !== then.message) {
    const before = new Map(then.additions.map(item => [item.key, item.text]));
    const after = new Map(now.additions.map(item => [item.key, item.text]));
    const keys = [...new Set([...before.keys(), ...after.keys()])].filter(key => before.get(key) !== after.get(key));
    sections.push(...(keys.length === 0 ? ['message'] : keys.map(key => `message: ${key}${!before.has(key) ? ' (added)' : !after.has(key) ? ' (removed)' : ''}`)));
  }
  const before = new Map(delivered.declarations.map(item => [item.name, JSON.stringify(item)]));
  const after = new Map(rendered.declarations.map(item => [item.name, JSON.stringify(item)]));
  for (const name of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(name) !== after.get(name)) sections.push(`tool declaration: ${name}${!before.has(name) ? ' (added)' : !after.has(name) ? ' (removed)' : ''}`);
  }
  return sections;
}

/** The comparison as one diagnostic line or a list. */
export function comparisonText(comparison: DeliveryComparison): string {
  if (comparison.status === 'equal') return 'Recorded delivery: equal';
  if (comparison.status === 'not-compared') return `Recorded delivery: not compared, because ${comparison.reason}`;
  return ['Recorded delivery: different sections (a diagnostic; the import stands):', ...comparison.sections.map(section => `  - ${section}`)].join('\n');
}

function refused(reason: string): InputsFromRunResult {
  return { status: 'refused', reason };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
