import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionToolDeclaration } from '../../../subs/agent/src/interfaces/session-operations.js';
import { piBuiltinDeclarations } from '../../../subs/agent/subs/pi/src/session-operations.js';
import { loadPromptPackages } from '../../prompts/packages.js';
import type { TaskPacket } from '../../prompts/tasks.js';
import { runLayout } from '../../run/records.js';
import { readRecordedOperation } from '../../run/session-operations.js';
import { constructEngineerStep } from '../../steps/engineer.js';
import { constructStep } from '../../steps/construct.js';
import { parseStepInputs, type EngineerStepInputs, type StepInputs } from '../../steps/inputs.js';
import { renderStep, type RenderedStep } from '../../steps/render.js';
import { runEventsOnDisk, runPath } from './runs.js';

/** One engineer invocation of a run: the inputs it recorded, its recorded delivery and the constructor's render of those inputs. */
export interface EngineerDelivery {
  readonly invocation: string;
  readonly inputs: EngineerStepInputs;
  readonly delivered: { readonly packet: TaskPacket; readonly declarations: readonly SessionToolDeclaration[]; readonly mode: string };
  readonly rendered: RenderedStep;
}

/**
 * Every engineer invocation of a finished scripted run, rendered again by the
 * engineer constructor from the inputs the run recorded before it started.
 * The scripted agent declares no built-ins of its own, so the run delivered
 * pi's, as the render does.
 */
export async function engineerDeliveries(root: string, planId: string, runId: string): Promise<EngineerDelivery[]> {
  const events = await runEventsOnDisk(root, planId, runId);
  const invocations = events.flatMap(event => event.type === 'invocation-started' && event.data.role === 'engineer' ? [event.data.invocation] : []);
  const sessionOperations = join(root, 'plans', '.harness', 'session-operations');
  const deliveries: EngineerDelivery[] = [];
  for (const invocation of invocations) {
    const inputs = parseStepInputs(await readFile(runPath(root, planId, runId, runLayout.stepInputs(invocation)), 'utf8'));
    if (inputs.role !== 'engineer') throw new Error(`Invocation ${invocation} recorded ${inputs.role} inputs`);
    const delivered = await readRecordedOperation(sessionOperations, runId, invocation);
    if (delivered === null) throw new Error(`Invocation ${invocation} recorded no delivery`);
    const { packages } = await loadPromptPackages({ capabilityWorkflow: inputs.capabilityWorkflow });
    const step = constructEngineerStep(inputs, { projectRoot: root, packages });
    const rendered = await renderStep(step, { projectRoot: root, packages, builtinDeclarations: piBuiltinDeclarations, operationId: invocation, sessionOperations });
    deliveries.push({ invocation, inputs, delivered, rendered });
  }
  return deliveries;
}

/** One invocation of a run built by a step constructor: its recorded inputs and delivery and the render of those inputs. */
export interface StepDelivery {
  readonly invocation: string;
  readonly role: string;
  readonly inputs: StepInputs;
  readonly delivered: { readonly packet: TaskPacket; readonly declarations: readonly SessionToolDeclaration[]; readonly mode: string };
  readonly rendered: RenderedStep;
}

/**
 * Every invocation of the named roles in a finished scripted run, with the
 * invocations that recorded no step inputs, and those whose session never
 * received its packet, listed apart: each constructed and delivered one
 * rendered again from the inputs the run recorded before it started.
 */
export async function stepDeliveries(root: string, planId: string, runId: string, roles: readonly string[]): Promise<{
  readonly constructed: StepDelivery[];
  readonly unconstructed: readonly { readonly invocation: string; readonly role: string }[];
  /** Invocations that recorded inputs but delivered nothing, with how each ended, where it did. */
  readonly undelivered: readonly { readonly invocation: string; readonly role: string; readonly ended: string | null }[];
}> {
  const events = await runEventsOnDisk(root, planId, runId);
  const invocations = events.flatMap(event => event.type === 'invocation-started' && roles.includes(event.data.role) ? [{ invocation: event.data.invocation, role: event.data.role }] : []);
  const sessionOperations = join(root, 'plans', '.harness', 'session-operations');
  const constructed: StepDelivery[] = [];
  const unconstructed: { invocation: string; role: string }[] = [];
  const undelivered: { invocation: string; role: string; ended: string | null }[] = [];
  for (const { invocation, role } of invocations) {
    let bytes: string;
    try { bytes = await readFile(runPath(root, planId, runId, runLayout.stepInputs(invocation)), 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      unconstructed.push({ invocation, role });
      continue;
    }
    const inputs = parseStepInputs(bytes);
    const delivered = await readRecordedOperation(sessionOperations, runId, invocation);
    if (delivered === null) {
      const ended = events.find(event => event.type === 'invocation-ended' && event.data.invocation === invocation);
      undelivered.push({ invocation, role, ended: ended?.type === 'invocation-ended' ? ended.data.ended : null });
      continue;
    }
    const { packages } = await loadPromptPackages({ capabilityWorkflow: inputs.capabilityWorkflow });
    const rendered = await renderStep(constructStep(inputs, { projectRoot: root, packages }), {
      projectRoot: root, packages, builtinDeclarations: piBuiltinDeclarations, operationId: invocation, sessionOperations,
    });
    constructed.push({ invocation, role, inputs, delivered, rendered });
  }
  return { constructed, unconstructed, undelivered };
}
