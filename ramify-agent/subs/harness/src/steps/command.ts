import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { piBuiltinDeclarations } from '../../subs/agent/subs/pi/src/session-operations.js';
import { privateRamify } from '../../subs/evidence/src/ramify-cli.js';
import { loadPromptPackages } from '../prompts/packages.js';
import { missingContext } from './authored.js';
import { authorEngineerInputs, installedAuthoringPorts, type AuthoringPorts } from './authoring.js';
import { constructStep } from './construct.js';
import { comparisonText, inputsFromRun } from './from-run.js';
import { parseStepInputs, serializeStepInputs, StepInputsError } from './inputs.js';
import { renderedText, renderStep } from './render.js';
import { buildAgent } from './agent.js';
import { createStepProgressText } from './run-text.js';
import { runStep } from './run.js';
import { runStepAfter } from './after.js';
import { runStepGate } from './gate.js';
import { engineerInputsFromAssignment } from './assigned.js';
import { reviewInputsFromRequest } from './review-step.js';

/*
 * The `step` command's entry. `inputs` imports one invocation's inputs from a
 * run, or authors an engineer's from a work item and an assignment judged
 * against the project with no run; `render` prints what a step's session would receive. Neither starts a
 * model or takes the project lock, and `render` writes nothing. `run` runs
 * one invocation from the inputs in a manual run and prints it as it
 * happens. The root receives only the options it parses and the text it
 * prints.
 */

/** What the `step` command does. */
export type StepCommandOptions =
  | {
      readonly command: 'inputs';
      readonly role: string;
      /** The run whose records the inputs, and the context authored files are judged with, come from. */
      readonly fromRun: string | undefined;
      /** The project engineer inputs are authored against when no run is named. */
      readonly projectRoot?: string | undefined;
      readonly invocation: string | undefined;
      /** A review request a manual run recorded, whose question's inputs are composed; with --from-run and no --invocation. */
      readonly request?: string | undefined;
      /** The local architect invocation of a manual run whose recorded assignment the engineer inputs are derived from; with --from-run. */
      readonly assignmentOf?: string | undefined;
      /** Where the imported inputs are written; absent, they are printed. */
      readonly out?: string | undefined;
      /** Files that replace parts of the recorded inputs, each judged as its producing role's output. */
      readonly authored?: {
        readonly workItem?: string | undefined;
        readonly outline?: string | undefined;
        readonly assignment?: string | undefined;
        readonly selection?: string | undefined;
        readonly reviewRequest?: string | undefined;
      } | undefined;
    }
  | {
      readonly command: 'render';
      readonly inputs: string;
      /** The project the inputs' project-relative paths resolve from. */
      readonly projectRoot: string;
      /** The invocation the briefing is identified by, where the inputs name none. */
      readonly invocation?: string | undefined;
    }
  | {
      readonly command: 'run';
      readonly inputs: string;
      /** The manual run directory, `<project>/plans/<plan>/.harness/jobs/<run>`; created where it does not exist. */
      readonly run: string;
      /** pi with the person's own login and an optional model, or the scripted fake reading a JSON script file. */
      readonly agent: { readonly name: 'pi'; readonly model?: string | undefined } | { readonly name: 'fake'; readonly script: string };
      /** Each line of the step as it happens: the agent, its start, tool calls, harness text, submissions and the summary. */
      readonly onLine?: ((line: string) => void) | undefined;
      /** Stops the invocation, as a person interrupting it does. */
      readonly signal?: AbortSignal | undefined;
    }
  | {
      readonly command: 'gate';
      /** The manual run directory. */
      readonly run: string;
      readonly checkpoint: 'iteration' | 'work-item' | 'readiness' | 'final';
      /** The accepted submission the gate's subject is named by. */
      readonly invocation?: string | undefined;
      /** Runs only the in-place diagnosis, which is never audit evidence. */
      readonly noCommit?: boolean | undefined;
      readonly onLine?: ((line: string) => void) | undefined;
      readonly signal?: AbortSignal | undefined;
    }
  | {
      readonly command: 'after';
      /** The manual run directory. */
      readonly run: string;
      readonly invocation: string;
      readonly onLine?: ((line: string) => void) | undefined;
    };

/**
 * What the command prints and how it exits: 0 done (for `run`, a submission
 * was accepted and the session settled), 1 a run that ended otherwise, 2 refused.
 */
export interface StepCommandResult {
  readonly exitStatus: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
}

/** The briefing identity of a render whose inputs name no source invocation. */
export const defaultRenderInvocation = 'step-render';

/** Runs one `step` command. */
export async function runStepCommand(options: StepCommandOptions): Promise<StepCommandResult> {
  return runStepCommandWith(options);
}

/** Runs one `step` command, authoring through the given ports; the installed ones where absent. */
export async function runStepCommandWith(options: StepCommandOptions, authoringPorts?: AuthoringPorts): Promise<StepCommandResult> {
  if (options.command === 'run') return run(options);
  if (options.command === 'gate' || options.command === 'after') return gateOrAfter(options);
  return options.command === 'inputs' ? importInputs(options, authoringPorts) : render(options);
}

async function run(options: Extract<StepCommandOptions, { command: 'run' }>): Promise<StepCommandResult> {
  const line = (text: string) => { try { options.onLine?.(text); } catch { /* A reader that fails does not end the step. */ } };
  const chosen = await buildAgent(options.agent);
  if (!chosen.ok) return { exitStatus: 2, stdout: '', stderr: `The step did not start: ${chosen.reason}\n` };
  line(`Agent: ${chosen.description}`);
  const printer = createStepProgressText();
  const { ramify, dispose } = await privateRamify();
  try {
    const result = await runStep({
      inputs: options.inputs, run: options.run, agent: chosen.agent, model: chosen.model, ramify, signal: options.signal,
      onProgress: event => { const text = printer(event); if (text !== null) line(text); },
    });
    if (result.status === 'not-started') {
      return { exitStatus: 2, stdout: '', stderr: `The step did not start: ${result.reason}\n${result.records === null ? '' : `Records: ${result.records}\n`}` };
    }
    return { exitStatus: result.exitStatus, stdout: '', stderr: '' };
  } finally {
    await dispose().catch(() => undefined);
  }
}

/** A `gate` or `after` over a manual run, printed as it happens; its refusals and errors are on standard error. */
async function gateOrAfter(options: Extract<StepCommandOptions, { command: 'gate' | 'after' }>): Promise<StepCommandResult> {
  const { ramify, dispose } = await privateRamify();
  const stderr: string[] = [];
  const onLine = (text: string) => {
    if (/^(Refused|Error|Last completed transition|Records):/u.test(text)) stderr.push(text);
    else try { options.onLine?.(text); } catch { /* A reader that fails does not end the command. */ }
  };
  try {
    const result = options.command === 'gate'
      ? await runStepGate({ run: options.run, checkpoint: options.checkpoint, invocation: options.invocation, noCommit: options.noCommit,
        ramify, onLine, signal: options.signal })
      : await runStepAfter({ run: options.run, invocation: options.invocation, ramify, onLine });
    return { exitStatus: result.exitStatus, stdout: '', stderr: stderr.length === 0 ? '' : `${stderr.join('\n')}\n` };
  } finally {
    await dispose().catch(() => undefined);
  }
}

/** An engineer's inputs, derived from the assignment one local architect invocation of a manual run made. */
async function assignedInputs(options: Extract<StepCommandOptions, { command: 'inputs' }>, invocation: string,
  authoringPorts: AuthoringPorts | undefined): Promise<StepCommandResult> {
  if (options.role !== 'engineer') return { exitStatus: 2, stdout: '', stderr: `Refused: --assignment-of derives an engineer's inputs, not ${options.role}'s\n` };
  if (options.fromRun === undefined || options.invocation !== undefined || Object.values(options.authored ?? {}).some(path => path !== undefined)) {
    return { exitStatus: 2, stdout: '', stderr: 'Refused: --assignment-of takes the manual run that recorded the assignment as --from-run, with no --invocation or authored files\n' };
  }
  const result = await engineerInputsFromAssignment({ runDirectory: options.fromRun, invocation, ports: authoringPorts ?? installedAuthoringPorts() });
  if (result.status === 'refused') return { exitStatus: 2, stdout: '', stderr: `Refused: ${result.reason}\n` };
  return written(serializeStepInputs(result.inputs), options.out, [
    `Derived the engineer inputs of ${result.inputs.assignment.id} (attempt 1, fresh start) from the assignment ${invocation} made, as the manual run recorded it.`,
  ]);
}

/** A review question's inputs, composed from a review request a manual run recorded. */
async function requestInputs(options: Extract<StepCommandOptions, { command: 'inputs' }>, request: string): Promise<StepCommandResult> {
  if (options.role !== 'reviewer') return { exitStatus: 2, stdout: '', stderr: `Refused: --request composes a reviewer's inputs, not ${options.role}'s\n` };
  if (options.fromRun === undefined || options.invocation !== undefined || Object.values(options.authored ?? {}).some(path => path !== undefined)) {
    return { exitStatus: 2, stdout: '', stderr: 'Refused: --request takes the manual run that recorded it as --from-run, with no --invocation or authored files\n' };
  }
  const result = await reviewInputsFromRequest({ runDirectory: options.fromRun, request });
  if (result.status === 'refused') return { exitStatus: 2, stdout: '', stderr: `Refused: ${result.reason}\n` };
  return written(serializeStepInputs(result.inputs), options.out, [
    `Composed the ${result.inputs.question} review of ${request} (attempt ${result.inputs.attempt}) from the manual run's records and the audited candidate ${result.inputs.request.key.candidate}.`,
    ...result.notes,
  ]);
}

async function importInputs(options: Extract<StepCommandOptions, { command: 'inputs' }>, authoringPorts: AuthoringPorts | undefined): Promise<StepCommandResult> {
  if (options.request !== undefined) return requestInputs(options, options.request);
  if (options.assignmentOf !== undefined) return assignedInputs(options, options.assignmentOf, authoringPorts);
  const authored = options.authored ?? {};
  if (options.fromRun === undefined || options.invocation === undefined) {
    const { workItem, outline, assignment, selection, reviewRequest } = authored;
    if (options.fromRun !== undefined || options.invocation !== undefined) {
      return { exitStatus: 2, stdout: '', stderr: 'Refused: --from-run and --invocation name a recorded invocation together; give both or neither\n' };
    }
    if (options.role !== 'engineer' || options.projectRoot === undefined || workItem === undefined || assignment === undefined
      || selection !== undefined || reviewRequest !== undefined) {
      return { exitStatus: 2, stdout: '', stderr: `Refused: ${missingContext(options.role, authored, options.projectRoot)}\n` };
    }
    const result = await authorEngineerInputs({
      projectRoot: options.projectRoot, files: { workItem, outline, assignment }, ports: authoringPorts ?? installedAuthoringPorts(),
    });
    if (result.status === 'refused') return { exitStatus: 2, stdout: '', stderr: `Refused: ${result.reason}\n` };
    const provenance = result.inputs.provenance;
    const lines = [
      `Authored engineer inputs for ${result.inputs.assignment.id} with no run, the assignment judged as the output of the local architect's first work turn of ${result.inputs.work.workItem} against the project.`,
      `Authored: ${provenance !== undefined && 'origin' in provenance && provenance.origin === 'authored' ? provenance.authored.join(', ') : ''}.`,
    ];
    return written(serializeStepInputs(result.inputs), options.out, lines);
  }
  const result = await inputsFromRun({
    role: options.role, runDirectory: options.fromRun, invocation: options.invocation, builtinDeclarations: piBuiltinDeclarations, authored,
  });
  if (result.status === 'refused') return { exitStatus: 2, stdout: '', stderr: `Refused: ${result.reason}\n` };
  const bytes = serializeStepInputs(result.inputs);
  const provenance = result.inputs.provenance;
  const fromRun = provenance === undefined || 'origin' in provenance ? undefined : provenance;
  const original = fromRun?.originalStart ?? 'fresh';
  const replaced = fromRun?.authored ?? [];
  const lines = [
    `Imported ${options.role} invocation ${options.invocation} (original start ${original}) as a fresh start with the complete briefing; no provider history is imported.`,
    ...(replaced.length === 0 ? [] : [`Authored, each judged as its producing role's output: ${replaced.join(', ')}.`]),
    comparisonText(result.comparison),
  ];
  return written(bytes, options.out, lines);
}

/** Prints the inputs, or writes them where `out` names, with the lines that describe them. */
async function written(bytes: string, out: string | undefined, lines: readonly string[]): Promise<StepCommandResult> {
  if (out === undefined) return { exitStatus: 0, stdout: bytes, stderr: `${lines.join('\n')}\n` };
  const path = resolve(out);
  await writeFile(path, bytes);
  return { exitStatus: 0, stdout: `Wrote ${path}\n`, stderr: `${lines.join('\n')}\n` };
}

async function render(options: Extract<StepCommandOptions, { command: 'render' }>): Promise<StepCommandResult> {
  const path = resolve(options.inputs);
  let bytes: string;
  try { bytes = await readFile(path, 'utf8'); }
  catch (error) { return { exitStatus: 2, stdout: '', stderr: `The inputs file ${path} cannot be read: ${error instanceof Error ? error.message : String(error)}\n` }; }
  let inputs;
  try { inputs = parseStepInputs(bytes); }
  catch (error) {
    if (error instanceof StepInputsError) return { exitStatus: 2, stdout: '', stderr: `Refused: ${error.message}\n` };
    throw error;
  }
  const projectRoot = resolve(options.projectRoot);
  const { packages } = await loadPromptPackages({ capabilityWorkflow: inputs.capabilityWorkflow });
  const step = constructStep(inputs, { projectRoot, packages });
  const rendered = await renderStep(step, {
    projectRoot, packages, builtinDeclarations: piBuiltinDeclarations,
    operationId: options.invocation ?? (inputs.provenance !== undefined && !('origin' in inputs.provenance) ? inputs.provenance.invocation : undefined) ?? defaultRenderInvocation,
    sessionOperations: join(projectRoot, 'plans', '.harness', 'session-operations'),
  });
  return { exitStatus: 0, stdout: renderedText(rendered), stderr: '' };
}
