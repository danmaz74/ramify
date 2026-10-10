import { orientationMessage, reviewMessage } from '../../subs/reviews/src/message.js';
import { snapshotToolDeclarations } from '../../subs/reviews/src/snapshot.js';
import {
  orientationJsonSchema, orientationSubmissionDescription, orientationToolName, reviewJsonSchema, reviewSubmissionDescription, reviewToolName,
  validateOrientation,
} from '../../subs/reviews/src/submission.js';
import type { OrientationSubmission } from '../../subs/reviews/src/interfaces/submissions.js';
import { deliveredSupportPaths } from '../prompts/tasks.js';
import { renderOrientationPrompt, renderReviewerPrompt } from '../prompts/packages.js';
import { invocationLimits } from '../run/policy.js';
import type { ForkRelation } from '../run/records.js';
import type { SubmissionValidation } from '../run/submissions.js';
import { composeTaskBrief } from '../run/task-brief.js';
import { architectViews, loadedPackage, runLocation, type ConstructedStepCommon } from './constructed.js';
import type { StepEnvironment } from './engineer.js';
import { validateStepInputs, type DesignOrientationStepInputs, type ReviewStepInputs } from './inputs.js';

/*
 * The reviewer's steps: one question of one audited candidate, and the
 * design-guidance orientation its design reviews fork. Each is its own
 * invocation. The reviews child prepares a question's patches, tools and
 * validator from the candidate while the run holds it; the message and the
 * declarations here are composed from the same exposed contracts over the
 * captured inputs, so a render needs no candidate.
 */

/** What every reviewer's working directory says, since it reads the audited candidate only. */
export const reviewerWorkingDirectory = '(no working directory: the audited candidate only)';

export interface ConstructedReviewStep extends ConstructedStepCommon {
  readonly role: 'reviewer';
  readonly inputs: ReviewStepInputs;
  readonly work: { readonly workItem: string; readonly iteration: string };
  /** The fork relation a forked start records. */
  readonly fork: ForkRelation | undefined;
  /** The task inputs the run's invocation record keeps. */
  readonly task: { readonly kind: 'code' | 'scope' | 'design'; readonly goal: string; readonly requirements: readonly string[]; readonly omit: readonly string[] };
  readonly bounds: { readonly absoluteMs: number };
}

/** Builds one review question from its inputs. Nothing is read or written. */
export function constructReviewStep(value: unknown, environment: StepEnvironment): ConstructedReviewStep {
  const inputs = validateStepInputs(value);
  if (inputs.role !== 'reviewer' || inputs.question === 'design-orientation') throw new Error('These step inputs are not review inputs');
  const { projectRoot } = environment;
  const loaded = loadedPackage(environment, 'reviewer');
  const kind = inputs.question;
  const { request, briefing } = inputs;
  const workingDirectory = runLocation(environment, inputs.run, inputs.workspace);
  const prompt = reviewMessage({
    request: {
      id: request.id, key: { kind, iteration: request.key.iteration, candidate: request.key.candidate },
      workItem: request.workItem, base: request.base, tree: request.tree, gate: request.gate, guidance: request.guidance,
    },
    snapshot: { changes: briefing.changes, directories: new Set(briefing.directories) },
    assignment: briefing.assignment,
    checkFindings: briefing.checkFindings,
    ...(briefing.pendingBindings === undefined ? {} : { pendingBindings: briefing.pendingBindings }),
    ...(briefing.package === undefined ? {} : { package: briefing.package }),
    ...(briefing.setup === undefined ? {} : { setup: briefing.setup }),
    ...(briefing.planDocument === undefined ? {} : { planDocument: briefing.planDocument }),
    diffPayload: briefing.diffPayload,
  });
  const limits = invocationLimits(inputs.limits, { absoluteMs: inputs.bounds.absoluteMs });
  const tools = snapshotToolDeclarations();
  const submission = { toolName: reviewToolName, description: reviewSubmissionDescription, inputSchema: reviewJsonSchema, submissionSchema: 'ramify-agent.review-submission/1' };
  const task = {
    kind, goal: `Review ${request.key.candidate}`, requirements: [JSON.stringify(request)],
    omit: [...(briefing.package === undefined ? [] : [briefing.package]), briefing.diffPayload],
  };
  const brief = composeTaskBrief(projectRoot, {
    kind, work: inputs.work, goal: task.goal, requirements: task.requirements, prompt, omit: task.omit,
    literalSections: [...(briefing.package === undefined ? [] : [{ key: 'support:assignment-package', text: briefing.package }]),
      { key: 'support:candidate-diff', text: briefing.diffPayload }, ...(inputs.discovery === undefined ? [] : [inputs.discovery])],
    startingPointGroups: [], known: undefined,
    environment: { projectRoot, workingDirectory, candidate: request.key.candidate, snapshot: inputs.snapshotTree, limits,
      availableTools: [...tools.map(tool => tool.name), submission.toolName], views: [], supportPaths: deliveredSupportPaths(loaded, kind), cucumberConfiguration: null },
  });
  const start = inputs.start;
  return {
    role: 'reviewer', inputs, work: inputs.work, attempt: inputs.attempt, loaded,
    systemPrompt: renderReviewerPrompt(loaded, reviewerWorkingDirectory, kind), prompt, brief, submission, limits, context: inputs.context,
    start: start.kind === 'fork' ? { mode: 'fork', ref: start.point, session: start.session, invocation: start.invocation }
      : { mode: 'fresh', ...(start.degraded === undefined ? {} : { degraded: start.degraded }) },
    fork: start.kind === 'fork' ? { from: { session: start.session as ForkRelation['from']['session'], invocation: start.invocation }, reason: start.reason, briefs: [...start.briefs] } : undefined,
    task, bounds: inputs.bounds,
    // A reviewer reads the audited candidate through the snapshot tools alone.
    equipment: { workingDirectory, builtinTools: [], tools },
    before: { inputs },
  };
}

export interface ConstructedDesignOrientationStep extends ConstructedStepCommon {
  readonly role: 'reviewer';
  readonly inputs: DesignOrientationStepInputs;
  readonly work: { readonly workItem: string; readonly iteration: string };
  readonly task: { readonly kind: 'design-orientation'; readonly goal: string; readonly requirements: readonly string[]; readonly omit: readonly string[] };
  readonly bounds: { readonly absoluteMs: number };
  readonly validate: (input: unknown) => SubmissionValidation<OrientationSubmission>;
}

/** Builds the design-guidance orientation of one guidance selection from its inputs. Nothing is read or written. */
export function constructDesignOrientationStep(value: unknown, environment: StepEnvironment): ConstructedDesignOrientationStep {
  const inputs = validateStepInputs(value);
  if (inputs.role !== 'reviewer' || inputs.question !== 'design-orientation') throw new Error('These step inputs are not design orientation inputs');
  const { projectRoot } = environment;
  const loaded = loadedPackage(environment, 'reviewer');
  const workingDirectory = runLocation(environment, inputs.run, inputs.workspace);
  const prompt = orientationMessage(inputs.guidance);
  const limits = invocationLimits(inputs.limits, { absoluteMs: inputs.bounds.absoluteMs });
  const submission = { toolName: orientationToolName, description: orientationSubmissionDescription, inputSchema: orientationJsonSchema, submissionSchema: 'ramify-agent.orientation-submission/1' };
  const kind = 'design-orientation' as const;
  const task = {
    kind, goal: `Read the captured design guidance for ${inputs.work.workItem}.`,
    requirements: ['Name every captured guidance path and summarize what it asks of the design.'], omit: [prompt],
  };
  const brief = composeTaskBrief(projectRoot, {
    kind, work: inputs.work, goal: task.goal, requirements: task.requirements, prompt, omit: task.omit,
    literalSections: [{ key: 'support:design-guidance', text: prompt }], startingPointGroups: [], known: undefined,
    environment: { projectRoot, workingDirectory, candidate: null, snapshot: null, limits, availableTools: [submission.toolName],
      views: architectViews(environment, inputs.architectView), supportPaths: deliveredSupportPaths(loaded, kind), cucumberConfiguration: null },
  });
  const guidance = inputs.guidance.map(entry => entry.ref);
  return {
    role: 'reviewer', inputs, work: inputs.work, attempt: inputs.attempt, loaded,
    systemPrompt: renderOrientationPrompt(loaded), prompt, brief, submission, limits, context: inputs.context, start: { mode: 'fresh' },
    task, bounds: inputs.bounds,
    equipment: { workingDirectory, builtinTools: [], tools: [] },
    validate: input => validateOrientation(input, guidance),
    before: { inputs },
  };
}
