import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionToolDeclaration } from '../../../subs/agent/src/interfaces/session-operations.js';
import { piBuiltinDeclarations } from '../../../subs/agent/subs/pi/src/session-operations.js';
import { loadPromptPackages } from '../../prompts/packages.js';
import type { TaskPacket } from '../../prompts/tasks.js';
import { runLayout } from '../../run/records.js';
import { readRecordedOperation } from '../../run/session-operations.js';
import { constructEngineerStep } from '../../steps/engineer.js';
import { parseStepInputs, type StepInputs } from '../../steps/inputs.js';
import { renderStep, type RenderedStep } from '../../steps/render.js';
import { runEventsOnDisk, runPath } from './runs.js';

/** One engineer invocation of a run: the inputs it recorded, its recorded delivery and the constructor's render of those inputs. */
export interface EngineerDelivery {
  readonly invocation: string;
  readonly inputs: StepInputs;
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
    const delivered = await readRecordedOperation(sessionOperations, runId, invocation);
    if (delivered === null) throw new Error(`Invocation ${invocation} recorded no delivery`);
    const { packages } = await loadPromptPackages({ capabilityWorkflow: inputs.capabilityWorkflow });
    const step = constructEngineerStep(inputs, { projectRoot: root, packages });
    const rendered = await renderStep(step, { projectRoot: root, packages, builtinDeclarations: piBuiltinDeclarations, operationId: invocation, sessionOperations });
    deliveries.push({ invocation, inputs, delivered, rendered });
  }
  return deliveries;
}
