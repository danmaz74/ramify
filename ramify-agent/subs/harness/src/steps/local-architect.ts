import { consultationAvailability, consultationContext } from '../consultations/targets.js';
import { contextSelectorMessage, workOrientationMessage } from '../context-selection/prompts.js';
import {
  contextSelectorJsonSchema, contextSelectorSubmissionSchema, contextSelectorToolName, prepareContextSelection, workOrientationJsonSchema,
  workOrientationSubmissionSchema, workOrientationToolName, type ContextSelectorSubmission, type SelectionIdentity, type SelectionSource,
  type WorkOrientationSubmission,
} from '../context-selection/submissions.js';
import { findModule, type ArchitectIndex } from '../../subs/evidence/src/views.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { deliveredSupportPaths, type TaskKind } from '../prompts/tasks.js';
import { renderContextSelectorPrompt, renderLocalArchitectPrompt, renderWorkOrientationPrompt } from '../prompts/packages.js';
import { invocationLimits } from '../run/policy.js';
import { runDirectory, type ContinueReason, type ForkRelation } from '../run/records.js';
import { validateAgainst, type SubmissionValidation } from '../run/submissions.js';
import { composeTaskBrief } from '../run/task-brief.js';
import { creationAuthority, type AssignmentBody } from '../work/assignment.js';
import { refOf } from '../work/committed.js';
import { createGitInspectionTool } from '../work/git-inspection.js';
import type { Hypothesis, RegistryEntry } from '../analysis/records.js';
import type { PlacementDecision } from '../architecture/records.js';
import type { Obligation } from '../work/obligations.js';
import { checkWriteScope, type WriteScope } from '../work/scope.js';
import { workItemMessage, type WorkItemBriefing } from '../work/session.js';
import type { StartingPointGroup } from '../work/starting-inputs.js';
import {
  capabilityLocalArchitectJsonSchema, localArchitectJsonSchema, localArchitectToolName, unreportedByCompletion, validateLocalArchitect,
  type LocalArchitectSubmission, type WorkEvidence,
} from '../work/submission.js';
import { architectViews, knownFacts, loadedPackage, projectLocation, runLocation, type ConstructedStepCommon } from './constructed.js';
import type { StepEnvironment } from './engineer.js';
import {
  validateStepInputs, type OrientationStepInputs, type SelectorStepInputs, type StepInputs, type WorkBriefingInputs, type WorkTurnStepInputs,
} from './inputs.js';

/*
 * The local architect's steps: its orientation, the selection of its work
 * item's elements by a selector that forks it, and its work turns. The run
 * builds each of these invocations through these constructors, and
 * `step render` renders the same construction.
 */

const readers = ['read', 'grep', 'ls'] as const;

/** The task kind of a local architect's turn, from why it continues its session. */
function workTurnKind(continuing: ContinueReason | undefined): TaskKind {
  return continuing === 'completion-refused' ? 'completion' : continuing === 'repair' ? 'repair' : 'assignment';
}

function expect<R extends StepInputs>(value: unknown, matches: (inputs: StepInputs) => inputs is R, what: string): R {
  const inputs = validateStepInputs(value);
  if (!matches(inputs)) throw new Error(`These step inputs are not ${what} inputs`);
  return inputs;
}

/**
 * The work briefing the run rendered, with its runtime locations restored
 * from the environment: the project root, the turn's working directory and
 * the run's directory, which the captured briefing never holds.
 */
export function workBriefing(environment: StepEnvironment, inputs: { readonly run: StepInputs['run']; readonly briefing: WorkBriefingInputs; readonly workingDirectory: { readonly project: string } }): WorkItemBriefing {
  return {
    ...(inputs.briefing as unknown as WorkItemBriefing),
    projectRoot: environment.projectRoot,
    workingDirectory: projectLocation(environment, inputs.workingDirectory),
    ...(inputs.run === null ? {} : { runDirectory: runDirectory(environment.projectRoot, inputs.run.planId, inputs.run.runId) }),
  };
}

/** The captured form of a work briefing: its records and facts, without its runtime locations or its package. */
export function workBriefingInputs(briefing: WorkItemBriefing): WorkBriefingInputs {
  const { projectRoot: _root, workingDirectory: _cwd, runDirectory: _run, package: _package, deviations: _deviations, ...facts } = briefing;
  return JSON.parse(JSON.stringify(facts)) as WorkBriefingInputs;
}

// The orientation

export interface ConstructedOrientationStep extends ConstructedStepCommon {
  readonly consultation: ReturnType<typeof consultationAvailability>;
  readonly role: 'local-architect';
  readonly inputs: OrientationStepInputs;
  /** The orientation briefing: the work item's briefing, its goal and its requirements, which the orientation packet records. */
  readonly briefingText: string;
  readonly validate: (input: unknown) => SubmissionValidation<WorkOrientationSubmission>;
}

/** Builds the local architect's orientation from its inputs. Nothing is read or written. */
export function constructOrientationStep(value: unknown, environment: StepEnvironment): ConstructedOrientationStep {
  const inputs = expect(value, (entry): entry is OrientationStepInputs => entry.role === 'local-architect' && entry.phase === 'orientation', 'local architect orientation');
  const { projectRoot } = environment;
  const loaded = loadedPackage(environment, 'local-architect');
  const workingDirectory = projectLocation(environment, inputs.workingDirectory);
  const goal = inputs.briefing.item.goal;
  const briefingText = [workItemMessage(workBriefing(environment, inputs)), '# Goal', goal, '# Requirements', ...inputs.requirements].join('\n\n');
  const prompt = workOrientationMessage(briefingText) + consultationContext(inputs.consultation, inputs.role);
  const limits = invocationLimits(inputs.limits, {});
  const submission = {
    toolName: workOrientationToolName, description: 'Record your orientation before making an assignment.',
    inputSchema: workOrientationJsonSchema, submissionSchema: 'ramify-agent.work-orientation/1',
  };
  const kind = 'orientation' as const;
  const brief = composeTaskBrief(projectRoot, {
    kind, work: inputs.work, goal, requirements: inputs.requirements, prompt, omit: [], literalSections: [], startingPointGroups: [],
    known: knownFacts(inputs.known),
    environment: { projectRoot, workingDirectory, candidate: null, snapshot: null, limits, availableTools: [...readers, submission.toolName],
      views: architectViews(environment, inputs.architectView), supportPaths: deliveredSupportPaths(loaded, kind), cucumberConfiguration: null },
  });
  return {
    role: 'local-architect', consultation: consultationAvailability(inputs.consultation ?? undefined, inputs.role), inputs, work: inputs.work, attempt: inputs.attempt, loaded,
    systemPrompt: renderWorkOrientationPrompt(loaded, projectRoot, workingDirectory), prompt, briefingText, brief, submission, limits,
    context: inputs.context, start: { mode: 'fresh' },
    equipment: { workingDirectory, builtinTools: [...readers], tools: [] },
    validate: input => validateAgainst(workOrientationSubmissionSchema, input),
    before: { inputs },
  };
}

// The selection

export interface ConstructedSelectorStep extends ConstructedStepCommon {
  readonly role: 'context-selector';
  readonly inputs: SelectorStepInputs;
  /** The message a fresh start is given where the fork was not taken. */
  readonly freshPrompt: string;
  /** The fork relation a forked start records. */
  readonly fork: ForkRelation | undefined;
  readonly source: SelectionSource;
  /** The selection's identity; the run names the selector's invocation and whether it was degraded. */
  readonly identity: Pick<SelectionIdentity, 'workItem' | 'orientationInvocation' | 'orientationPoint'>;
  readonly validate: (input: unknown) => SubmissionValidation<ContextSelectorSubmission>;
}

/** Builds one selection of a work item's elements from its inputs. Nothing is read or written. */
export function constructSelectorStep(value: unknown, environment: StepEnvironment): ConstructedSelectorStep {
  const inputs = expect(value, (entry): entry is SelectorStepInputs => entry.role === 'context-selector', 'context selector');
  const { projectRoot } = environment;
  const loaded = loadedPackage(environment, 'context-selector');
  const forked = inputs.start.kind === 'fork';
  const workingDirectory = runLocation(environment, inputs.run, inputs.workspace);
  const prompt = contextSelectorMessage(forked ? inputs.update : inputs.packet, inputs.catalog);
  const limits = invocationLimits(inputs.limits, {});
  const submission = {
    toolName: contextSelectorToolName, description: 'Select, by ID, the elements an engineer working this work item must keep in view.',
    inputSchema: contextSelectorJsonSchema, submissionSchema: 'ramify-agent.context-selector-submission/1',
  };
  // A fork inherits the briefing, the known facts and the starting points of the session it forks.
  const brief = composeTaskBrief(projectRoot, {
    kind: inputs.kind, work: inputs.work, goal: inputs.goal, requirements: inputs.requirements, prompt, omit: [], literalSections: [],
    startingPointGroups: forked ? [] : inputs.startingPoints as StartingPointGroup[], known: forked ? undefined : knownFacts(inputs.known),
    retainInheritedSections: forked,
    environment: { projectRoot, workingDirectory, candidate: null, snapshot: null, limits, availableTools: [...readers, submission.toolName],
      views: architectViews(environment, inputs.architectView), supportPaths: deliveredSupportPaths(loaded, inputs.kind), cucumberConfiguration: null },
  });
  const source: SelectionSource = { catalog: inputs.catalog, planDeviations: inputs.planDeviations, workItemElements: inputs.workItemElements };
  const identity = { workItem: inputs.work.workItem, orientationInvocation: inputs.orientation.invocation, orientationPoint: inputs.orientation.point };
  const start = inputs.start;
  return {
    role: 'context-selector', inputs, work: inputs.work, attempt: inputs.attempt, loaded,
    systemPrompt: renderContextSelectorPrompt(loaded, projectRoot), prompt, freshPrompt: contextSelectorMessage(inputs.packet, inputs.catalog),
    brief, submission, limits, context: inputs.context,
    start: start.kind === 'fork' ? { mode: 'fork', ref: start.point, session: start.session, invocation: start.invocation }
      : { mode: 'fresh', ...(start.degraded === undefined ? {} : { degraded: start.degraded }) },
    fork: start.kind === 'fork' ? { from: { session: start.session as ForkRelation['from']['session'], invocation: start.invocation }, reason: 'context-selection', briefs: [] } : undefined,
    equipment: { workingDirectory, builtinTools: [...readers], tools: [] },
    source, identity,
    validate: input => {
      const parsed = validateAgainst(contextSelectorSubmissionSchema, input);
      if (!parsed.ok) return parsed;
      const checked = prepareContextSelection(parsed.value, { ...identity, selectorInvocation: 'candidate', degraded: !forked }, source);
      return checked.status === 'available' ? parsed : { ok: false, errors: checked.errors };
    },
    before: { inputs },
  };
}

// The work turn

export interface ConstructedWorkTurnStep extends ConstructedStepCommon {
  readonly consultation: ReturnType<typeof consultationAvailability>;
  readonly role: 'local-architect';
  readonly inputs: WorkTurnStepInputs;
  readonly work: { readonly workItem: string };
  /** Why the turn continues its session, where it does; the run records it with the start. */
  readonly continuing: ContinueReason | undefined;
  /** The task inputs the run's invocation record keeps. */
  readonly task: { readonly kind: TaskKind; readonly goal: string; readonly requirements: readonly string[]; readonly omit: readonly string[] };
}

/** Builds one local architect work turn from its inputs. Nothing is read or written. */
export function constructWorkTurnStep(value: unknown, environment: StepEnvironment): ConstructedWorkTurnStep {
  const inputs = expect(value, (entry): entry is WorkTurnStepInputs => entry.role === 'local-architect' && entry.phase === 'work-turn', 'local architect work turn');
  const { projectRoot } = environment;
  const loaded = loadedPackage(environment, 'local-architect');
  const workingDirectory = projectLocation(environment, inputs.workingDirectory);
  const briefing = workBriefing(environment, inputs);
  const selected = inputs.package;
  let prompt = workItemMessage({ ...briefing, ...(selected === undefined ? {} : {
    package: { hash: selected.hash, elements: selected.elements },
    ...(inputs.deviations === undefined ? {} : { deviations: inputs.deviations }),
  }) });
  // The package is in the session once: carried by the first prompt of a session that lacks it.
  if (selected !== undefined && inputs.packageInPrompt) prompt = `${prompt}\n\n# Your work-item package\n\n${selected.text}`;
  if (inputs.obligationLines.length > 0) prompt = `${prompt}\n\n${inputs.obligationLines.join('\n')}`;
  if (inputs.intervening !== undefined) prompt += `\n\n# Intervening capability work\n\n${inputs.intervening}`;
  prompt += consultationContext(inputs.consultation, inputs.role);
  const start = inputs.start;
  const continuing = start.kind === 'continued' ? start.continuing : start.continuing;
  const kind = workTurnKind(continuing);
  const requirements = selected === undefined ? inputs.requirements
    : [`Use the accepted work-item package ${selected.hash}, with selected elements ${selected.elements.join(', ') || '(none)'}. Its complete context is supplied once and remains in this session.`];
  const groups = [...inputs.startingPoints] as StartingPointGroup[];
  // A session that does not hold the orientation is given its starting points.
  if (inputs.orientation !== undefined && (start.kind === 'fresh' || (start.session ?? null) !== inputs.orientation.session)) groups.unshift(inputs.orientation.group as StartingPointGroup);
  const limits = invocationLimits(inputs.limits, {});
  const git = createGitInspectionTool(projectRoot);
  const tools = [{ name: git.name, description: git.description, inputSchema: git.inputSchema, mutating: git.mutating ?? false }];
  const submission = {
    toolName: localArchitectToolName,
    description: 'End this turn with the work item\'s result. The harness validates it; an invalid submission is returned with every error and its path, and a valid one ends this invocation.',
    inputSchema: inputs.capabilityWorkflow ? capabilityLocalArchitectJsonSchema : localArchitectJsonSchema,
    submissionSchema: 'ramify-agent.local-architect-submission/1',
  };
  const task = { kind, goal: inputs.briefing.item.goal, requirements, omit: selected === undefined ? [] : [selected.text] };
  const brief = composeTaskBrief(projectRoot, {
    kind, work: inputs.work, goal: task.goal, requirements, prompt, omit: task.omit,
    literalSections: selected === undefined ? [] : [{ key: 'support:work-item-package', text: selected.text }],
    startingPointGroups: groups, known: knownFacts(inputs.known),
    environment: { projectRoot, workingDirectory, candidate: null, snapshot: null, limits,
      availableTools: [...readers, ...tools.map(tool => tool.name), submission.toolName],
      views: (inputs.briefing.views.evidence?.views ?? []).map(view => ({ path: view.path, revision: view.revision, modules: [inputs.briefing.item.module],
        coverage: view.coverage === null ? [] : [`${view.coverage} coverage limits`] })),
      supportPaths: deliveredSupportPaths(loaded, kind), cucumberConfiguration: null },
  });
  return {
    role: 'local-architect', consultation: consultationAvailability(inputs.consultation ?? undefined, inputs.role), inputs, work: inputs.work, attempt: inputs.attempt, loaded,
    systemPrompt: renderLocalArchitectPrompt(loaded, projectRoot, workingDirectory), prompt, brief, submission, limits, context: inputs.context,
    start: start.kind === 'continued' ? { mode: 'continue', ref: start.point, ...(start.session === undefined ? {} : { session: start.session }) }
      : { mode: 'fresh', ...(start.degraded === undefined ? {} : { degraded: start.degraded }) },
    continuing, task,
    equipment: { workingDirectory, builtinTools: [...readers], tools },
    before: { inputs },
  };
}

/**
 * The creation authority an ordinary base is captured with: the accepted
 * registry entry that proposes an owner the view does not have yet. A broad
 * base names existing modules only.
 */
export function assignmentBootstrap(index: ArchitectIndex | null, registry: ReadonlyMap<string, RegistryEntry>, body: AssignmentBody): WriteScope['bootstrap'] {
  const owner = 'module' in body.scope.base ? body.scope.base.module : null;
  const authority = owner === null || (index !== null && findModule(index, owner) !== undefined)
    ? undefined
    : creationAuthority(registry, owner);
  return authority?.proposed === undefined
    ? []
    : [{ capability: refOf(authority.capability, authority.revision, authority), owner: authority.owner, parent: authority.proposed.parent, directory: authority.proposed.directory }];
}

/** The evidence a work turn's submission is judged against: its inputs, with the architect view as it stands. */
export function workEvidenceOf(step: Pick<ConstructedWorkTurnStep, 'inputs'>, index: ArchitectIndex | null): WorkEvidence & Required<Pick<WorkEvidence, 'obligations'>> {
  const { inputs } = step;
  const { briefing, validation } = inputs;
  const registry = briefing.registry as unknown as RegistryEntry[];
  const integration = briefing.integration as { readonly scope?: WorkEvidence['integration'] } | undefined;
  return {
    index,
    registry: new Map(registry.map(entry => [entry.capability, entry])),
    outline: briefing.outlines.at(-1) ?? null,
    hypotheses: new Map((validation.hypotheses as unknown as Hypothesis[]).map(hypothesis => [hypothesis.id, hypothesis])),
    decisions: new Map((validation.decisions as unknown as PlacementDecision[]).map(decision => [decision.id, decision])),
    workItems: new Set(validation.workItems),
    openRequirements: new Set(validation.openRequirements),
    contracts: new Set(validation.contracts),
    guardedPaths: new Set(validation.guardedPaths),
    harnessOnly: new Set(validation.harnessOnly),
    ...(integration === undefined ? {} : { integration: integration.scope }),
    bounds: briefing.bounds as unknown as WorkEvidence['bounds'],
    ...(inputs.package === undefined ? {} : { package: new Set(inputs.package.elements) }),
    obligations: {
      actor: { kind: 'work-item', id: inputs.work.workItem },
      projection: { obligations: new Map(validation.obligations.entries as unknown as [string, Obligation][]), tests: validation.obligations.tests },
    },
  };
}

/** What judging a work turn's submission answers: the verdict, what a rejected completion left unreported, and the scope an assignment captured. */
export interface WorkTurnJudgement {
  readonly verdict: SubmissionValidation<LocalArchitectSubmission>;
  /** What a completion request the local architect's rules rejected left without a done report; undefined where they accepted it. */
  readonly unreported: readonly string[] | undefined;
  readonly prepared?: { readonly body: AssignmentBody; readonly scope: WriteScope } | undefined;
}

/**
 * Judges one work-turn submission as the run does: the historical workflow
 * the capability workflow retired, the local architect's rules over the
 * step's evidence, and, for an assignment, the scope preparation the
 * provider answers. Nothing is committed.
 */
export async function judgeWorkTurn(step: Pick<ConstructedWorkTurnStep, 'inputs'>, input: unknown,
  context: { readonly index: ArchitectIndex | null; readonly ramify: RamifyCli; readonly projectRoot: string }): Promise<WorkTurnJudgement> {
  const evidence = workEvidenceOf(step, context.index);
  const shaped = input as { kind?: unknown; assignment?: { kind?: unknown; revisesContract?: unknown } } | null;
  const historical = step.inputs.capabilityWorkflow && typeof input === 'object' && input !== null
    && (shaped?.kind === 'yield-for-providers' || shaped?.assignment?.kind === 'contract' || shaped?.assignment?.revisesContract !== undefined);
  const verdict: SubmissionValidation<LocalArchitectSubmission> = historical
    ? { ok: false, errors: [{ path: 'kind', message: 'The contract and provider-yield workflow is historical; use capability requests and scoped assignments' }] }
    : validateLocalArchitect(input, evidence);
  const unreported = verdict.ok ? undefined : unreportedByCompletion(input, evidence.obligations);
  if (!verdict.ok || verdict.value.kind !== 'assign' || verdict.value.assignment.revisesContract !== undefined) return { verdict, unreported };
  const body = verdict.value.assignment;
  const { scope } = step.inputs.validation;
  const checked = await checkWriteScope({ ramify: context.ramify, projectRoot: context.projectRoot, index: context.index,
    view: scope.view, revision: scope.revision, base: body.scope.base, extra: body.scope.extra, read: body.scope.read,
    bootstrap: assignmentBootstrap(context.index, evidence.registry, body), rationale: body.scope.rationale });
  if (checked.scope === null) return { verdict: { ok: false, errors: checked.errors }, unreported };
  return { verdict, unreported, prepared: { body, scope: checked.scope } };
}
