import type { BuiltinTool, WriteTool } from '../../subs/agent/src/interfaces/port.js';
import type { SessionToolDeclaration } from '../../subs/agent/src/interfaces/session-operations.js';
import type { TaskPacket } from '../prompts/tasks.js';
import type { DeliveredInput } from '../prompts/delivered-manifest.js';
import {
  composeOperationPacket, operationDeclarations, readPointContext, readSessionPointReference, ReusableSessionUnavailableError, type PointContext,
} from '../run/session-operations.js';
import { constructStep, freshFallback } from './construct.js';
import type { ConstructedStepCommon } from './constructed.js';
import type { StepEnvironment } from './engineer.js';

/*
 * What a constructed step delivers, without a model, a lock or a record:
 * the packet the session operations would build for it, and every tool it
 * would declare. A fresh start delivers the whole packet; a continuation
 * appends only its additions to the session it continues.
 */

export interface RenderEnvironment extends StepEnvironment {
  /** The executor's own built-in declarations for these names and working directory. */
  readonly builtinDeclarations: (names: readonly (BuiltinTool | WriteTool)[], workingDirectory: string) => readonly SessionToolDeclaration[];
  /** The identity the briefing occurrence is keyed by: the invocation it renders. */
  readonly operationId: string;
  /**
   * The session operations directory, whose recorded ancestry a continuation
   * appends to and a fork inherits. Absent, or without the point's ancestry,
   * such a start is rendered as the fresh start the run would fall back to.
   */
  readonly sessionOperations?: string | undefined;
}

export interface RenderedStep {
  readonly role: ConstructedStepCommon['role'];
  /** The start the inputs ask for. */
  readonly requested: ConstructedStepCommon['inputs']['start']['kind'];
  /** What is rendered: the whole fresh packet, or what a continuation or a fork adds to the history it inherits. */
  readonly rendered: 'fresh' | 'continuation' | 'fork';
  /** Why a requested continuation or fork is rendered fresh. */
  readonly fallback: string | null;
  readonly point: string | null;
  readonly packet: TaskPacket;
  readonly declarations: readonly SessionToolDeclaration[];
  /** The submission schema the declaration carries, as the model receives it. */
  readonly submissionSchema: unknown;
}

/** Renders a constructed step as its session would receive it. Nothing is written. */
export async function renderStep(constructed: ConstructedStepCommon, environment: RenderEnvironment): Promise<RenderedStep> {
  let step = constructed;
  // Inputs authored without a run start fresh: they name no run, and no session point.
  const runId = step.inputs.run?.runId ?? null;
  let source: { readonly point: PointContext['point']; readonly prior: PointContext } | null = null;
  let fallback: string | null = null;
  if (step.start.mode !== 'fresh') {
    const reference = readSessionPointReference(step.start.ref);
    if (runId === null) fallback = 'the inputs name no run, so no session point of one can be read';
    else if (reference === null) fallback = 'the session point reference cannot be read';
    else if (reference.runId !== runId) fallback = `the session point belongs to run ${reference.runId}, not ${runId}`;
    else if (environment.sessionOperations === undefined) fallback = 'no session operations directory was given to read the point\'s recorded ancestry from';
    else {
      try { source = { point: reference.point, prior: await readPointContext(environment.sessionOperations, runId, reference.point) }; }
      catch (error) {
        if (!(error instanceof ReusableSessionUnavailableError)) throw error;
        fallback = error.message;
      }
    }
  }
  // A start whose point is unavailable is rendered as the fresh inputs the run falls back to.
  const fresh = fallback === null ? null : freshFallback(step.inputs, fallback);
  if (fresh !== null) step = constructStep(fresh, environment);
  const workingDirectory = step.equipment.workingDirectory;
  const builtins = environment.builtinDeclarations(step.equipment.builtinTools, workingDirectory);
  const { packet } = composeOperationPacket({
    // The run identity names only an inherited point, which a start without a run never has.
    runId: runId ?? '', operationId: environment.operationId, loaded: step.loaded, brief: step.brief, role: step.role,
    mode: source === null ? 'fresh' : step.start.mode, workingDirectory, builtinDeclarations: builtins, tools: step.equipment.tools,
    submissionName: step.submission.toolName, source: source?.point ?? null, prior: source?.prior ?? null,
  });
  const described = /^Submit this task using exactly this JSON schema: ([\s\S]*)$/u.exec(packet.declaration.description);
  return {
    role: step.role,
    requested: constructed.inputs.start.kind,
    rendered: source === null ? 'fresh' : step.start.mode === 'fork' ? 'fork' : 'continuation',
    fallback,
    point: constructed.start.mode === 'fresh' ? null : constructed.start.ref,
    packet,
    declarations: operationDeclarations(builtins, step.equipment.tools, packet),
    submissionSchema: described === null ? null : JSON.parse(described[1]!) as unknown,
  };
}

const rule = (title: string) => `==== ${title} ====`;

function declarationText(declaration: SessionToolDeclaration, submission: string): string {
  return [`--- ${declaration.name}${declaration.name === submission ? ' (submission)' : ''}${declaration.mutating ? ' (mutating)' : ''}`,
    declaration.description, `Input schema: ${JSON.stringify(declaration.inputSchema)}`].join('\n');
}

function additionText(addition: DeliveredInput): string {
  return [`--- ${addition.kind} ${addition.key}`, addition.text].join('\n');
}

/** The rendering as a person or an agent reads it. */
export function renderedText(rendered: RenderedStep): string {
  const head = `Step: ${rendered.role}, start ${rendered.requested}${rendered.point === null ? '' : ` from ${rendered.point}`}`;
  const schema = [rule(`Submission schema (${rendered.packet.submissionTool})`), JSON.stringify(rendered.submissionSchema, null, 2)];
  if (rendered.rendered !== 'fresh') {
    return [head, '',
      rule(rendered.rendered === 'fork'
        ? 'Fork additions only: delivered over the forked point, whose inherited instructions, tools and briefing are not repeated'
        : 'Continuation additions only: appended to the continued session, whose inherited instructions, tools and briefing are not repeated'),
      ...rendered.packet.additions.map(additionText), '', ...schema, ''].join('\n');
  }
  return [head, ...(rendered.fallback === null ? [] : [`Rendered as the complete fresh start the run falls back to: ${rendered.fallback}.`]), '',
    rule('Role instructions'), rendered.packet.roleInstructions, '',
    rule('Message'), rendered.packet.message, '',
    rule(`Tool declarations (${rendered.declarations.length})`), ...rendered.declarations.map(item => declarationText(item, rendered.packet.submissionTool)), '',
    ...schema, ''].join('\n');
}
