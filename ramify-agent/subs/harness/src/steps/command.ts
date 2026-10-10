import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { piBuiltinDeclarations } from '../../subs/agent/subs/pi/src/session-operations.js';
import { loadPromptPackages } from '../prompts/packages.js';
import { constructEngineerStep } from './engineer.js';
import { comparisonText, inputsFromRun } from './from-run.js';
import { parseStepInputs, serializeStepInputs, StepInputsError } from './inputs.js';
import { renderedText, renderStep } from './render.js';

/*
 * The `step` command's entry. `inputs` imports one invocation's inputs from a
 * run; `render` prints what a step's session would receive. Neither starts a
 * model or takes the project lock, and `render` writes nothing. The root
 * receives only the options it parses and the text it prints.
 */

/** What the `step` command does. */
export type StepCommandOptions =
  | {
      readonly command: 'inputs';
      readonly role: string;
      readonly fromRun: string;
      readonly invocation: string;
      /** Where the imported inputs are written; absent, they are printed. */
      readonly out?: string | undefined;
    }
  | {
      readonly command: 'render';
      readonly inputs: string;
      /** The project the inputs' project-relative paths resolve from. */
      readonly projectRoot: string;
      /** The invocation the briefing is identified by, where the inputs name none. */
      readonly invocation?: string | undefined;
    };

/** What the command prints and how it exits: 0 done, 2 refused. */
export interface StepCommandResult {
  readonly exitStatus: 0 | 2;
  readonly stdout: string;
  readonly stderr: string;
}

/** The briefing identity of a render whose inputs name no source invocation. */
export const defaultRenderInvocation = 'step-render';

/** Runs one `step` command. */
export async function runStepCommand(options: StepCommandOptions): Promise<StepCommandResult> {
  return options.command === 'inputs' ? importInputs(options) : render(options);
}

async function importInputs(options: Extract<StepCommandOptions, { command: 'inputs' }>): Promise<StepCommandResult> {
  const result = await inputsFromRun({
    role: options.role, runDirectory: options.fromRun, invocation: options.invocation, builtinDeclarations: piBuiltinDeclarations,
  });
  if (result.status === 'refused') return { exitStatus: 2, stdout: '', stderr: `Refused: ${result.reason}\n` };
  const bytes = serializeStepInputs(result.inputs);
  const original = result.inputs.provenance?.originalStart ?? 'fresh';
  const lines = [
    `Imported ${options.role} invocation ${options.invocation} (original start ${original}) as a fresh start with the complete briefing; no provider history is imported.`,
    comparisonText(result.comparison),
  ];
  if (options.out === undefined) return { exitStatus: 0, stdout: bytes, stderr: `${lines.join('\n')}\n` };
  const out = resolve(options.out);
  await writeFile(out, bytes);
  return { exitStatus: 0, stdout: `Wrote ${out}\n`, stderr: `${lines.join('\n')}\n` };
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
  const step = constructEngineerStep(inputs, { projectRoot, packages });
  const rendered = await renderStep(step, {
    projectRoot, packages, builtinDeclarations: piBuiltinDeclarations,
    operationId: options.invocation ?? inputs.provenance?.invocation ?? defaultRenderInvocation,
    sessionOperations: join(projectRoot, 'plans', '.harness', 'session-operations'),
  });
  return { exitStatus: 0, stdout: renderedText(rendered), stderr: '' };
}
