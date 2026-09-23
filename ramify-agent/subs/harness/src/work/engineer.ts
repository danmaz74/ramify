import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandRunner } from '../../subs/evidence/src/run-command.js';
import { z } from 'zod';
import type { JsonSchema, ToolDefinition, ToolResult } from '../../subs/agent/src/interfaces/port.js';
import { modulePathSchema } from '../interfaces/protocol/evidence.js';
import { runCommand } from '../../subs/evidence/src/run-command.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import type { ProjectCommands } from '../checks/checkpoint.js';
import { scopedTestCheck, type ScenarioCheckPlanning } from '../checks/checkpoint.js';
import { describeScenarioCheck, scenarioCheckLines } from '../checks/diagnostics.js';
import { runScenarioCheck, scenarioCheckPassed } from '../checks/scenario-check.js';
import { checkCommandEnvironment } from '../checks/records.js';
import type { TestSelectionPolicy } from '../checks/records.js';
import { resolveTestSelection } from '../checks/selection.js';
import { validateAgainst, type SubmissionError, type SubmissionValidation } from '../run/submissions.js';
import { openFindingsMessage, type HookFinding } from '../hooks/post-write.js';
import { needAsBehaviorSchema } from '../contracts/submission.js';
import { declarationErrors, type DeclarationContext } from './declarations.js';
import type { IterationAssignment } from './iterations.js';
import { engineerScenarioSection, type EngineerScenarios } from './scenario-briefing.js';
import { scopePaths } from './scope.js';

/*
 * The engineer: what it submits, the one harness tool it is given, and the
 * briefing it starts from.
 *
 * Its submission is provisional. A proposal of completion is a request for
 * the gate, never a verdict: the harness runs the checks and owns the
 * outcome. A recommendation is read by the local architect and never widens
 * a scope or discharges an obligation.
 *
 * `edit` and `write` are the implementation's own built-ins, behind the
 * write guard. The `shell` tool arrives in iteration 7.
 *
 * `contract-needed` is how an engineer reports that the behavior it needs is
 * outside its scope. Its turn ends there: no nested live session is started,
 * and the harness answers with a contract iteration of its own. The need is
 * written as behavior, never as an interface, because naming the design
 * would decide for the other side.
 */

const text = z.string().min(1);

/**
 * Why an engineer reports its assignment unsuitable. `obligation-change` and
 * `unplaced-need` arrive with the iterations that act on them: a reason no
 * iteration can act on is not offered.
 *
 * `break-discovered` is how an engineer reports that the work it was given
 * cannot be done without breaking a guarantee somebody else relies on. Its
 * turn ends there: it does not switch approach, widen its writes or adapt
 * the consumers itself, and the work item's local architect revises the
 * remaining iterations. An engineer already working a `breaking` iteration
 * has nothing to discover, so the reason is refused for one.
 *
 * `provider-cannot-conform` is offered only to an engineer whose assignment
 * owes a real-provider obligation. It is the provider's report that the
 * agreement cannot be met as it stands, and it reaches the consumer's local
 * architect as `revision-needed`. Any other engineer using it is refused.
 */
export const unsuitableReasonSchema = z.enum(['scope', 'break-discovered', 'provider-cannot-conform']);

export const engineerSubmissionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('completion-proposed'),
    /** The engineer's own words. They enter the accepted commit's message and nothing else does. */
    summary: text,
    findings: z.array(text),
    recommendation: text.optional(),
    /**
     * The scenarios of this work item's entry whose steps this iteration's
     * step definitions bind and which pass in quick mode. A declaration is
     * a claim: the next gate runs every one strictly.
     */
    scenarios: z.array(text).default([]),
  }).strict(),
  z.object({
    kind: z.literal('partial'),
    done: z.array(text),
    unfinished: z.array(text),
    findings: z.array(text),
  }).strict(),
  z.object({
    kind: z.literal('unsuitable'),
    reason: unsuitableReasonSchema,
    detail: text,
  }).strict(),
  z.object({
    kind: z.literal('contract-needed'),
    /** The need, stated as behavior. The contract iteration designs the interface. */
    need: needAsBehaviorSchema,
    /** Where the engineer believes the behavior belongs; the harness resolves the owner itself. */
    suggestedProvider: modulePathSchema.optional(),
    /** What this iteration did before it stopped, in the engineer's own words. */
    summary: text,
  }).strict(),
]);
export type EngineerSubmission = z.infer<typeof engineerSubmissionSchema>;

/** The members this iteration's package offers the role. */
export const engineerSubmissionKinds = ['completion-proposed', 'partial', 'unsuitable', 'contract-needed'] as const;

/** The schema the agent's tool is given, taken from the same definition that validates. */
export const engineerJsonSchema = z.toJSONSchema(engineerSubmissionSchema) as JsonSchema;

export const engineerToolName = 'submit_iteration_result';

/**
 * What one accepted submission is answered with, by kind. Only a proposal of
 * completion asks for the gate; an accepted `partial`, `unsuitable` or
 * `contract-needed` report is a report, and answering it with completed work
 * tells the engineer something that is not so.
 *
 * `checkNotRun` is the reason the fresh Ramify check over the write scope
 * could not run, where it could not. It is stated rather than passed over: a
 * check that did not run is never a pass, and the gate's complete check is
 * what answers instead.
 */
export function iterationAcceptance(kind: EngineerSubmission['kind'], checkNotRun: string | null = null): string {
  const note = checkNotRun === null
    ? ''
    : ` The Ramify check over your write scope could not be run (${checkNotRun}), so nothing here verified it.`;
  switch (kind) {
    case 'completion-proposed':
      return `The submission was accepted and recorded. The iteration gate now runs the complete required set and owns the verdict; nothing is committed until it passes.${note} Nothing more is asked of you in this session.`;
    case 'partial':
      return 'The report was accepted and recorded. The work is not complete: the local architect reads what is unfinished and decides what follows. Nothing more is asked of you in this session.';
    case 'unsuitable':
      return 'The report was accepted and recorded. This iteration closes on it, unverified and uncommitted, and the local architect decides what follows. Nothing more is asked of you in this session.';
    case 'contract-needed':
      return 'The report was accepted and recorded. This iteration closes with what it did, and the harness answers the need you named with a contract iteration of its own. Nothing more is asked of you in this session.';
  }
}

/** What the submission tool tells the engineer about itself. */
export const engineerSubmissionDescription = 'End your turn with the result of this iteration. The harness validates it; an invalid submission is returned with every error and its path, and a valid one ends this invocation.';

/** A line that would be read as one of the trailers the harness writes itself. */
const trailerLine = /^\s*Ramify-[A-Za-z-]*\s*:/m;

/** What the rules beyond the schema are checked against. */
export interface EngineerEvidence {
  /**
   * The real-provider obligation this assignment owes, where it owes one.
   * The harness derives it from the assignment; no submission carries it.
   */
  readonly obligation?: { readonly id: string; readonly revision: number } | null | undefined;
  /** The kind of iteration this engineer is working, as the assignment fixed it. */
  readonly kind?: string | undefined;
  /**
   * Ramify findings this session's own edits introduced that no later hook
   * check has cleared. The gate runs the same check, so a completion
   * proposed while one stands would fail there; it is refused here instead,
   * where the session can still act on it.
   */
  readonly openFindings?: readonly HookFinding[] | undefined;
  /** The work item's entry and the run's tracked scenarios, which a declaration's IDs are judged against. */
  readonly scenarios?: DeclarationContext | undefined;
}

/**
 * Validates one engineer submission: the strict schema, then the rules the
 * schema cannot hold. Nothing changes on a failure and every error names its
 * path.
 */
export function validateEngineer(input: unknown, evidence: EngineerEvidence = {}): SubmissionValidation<EngineerSubmission> {
  const shape = validateAgainst(engineerSubmissionSchema, input);
  if (!shape.ok) return shape;
  const errors: SubmissionError[] = [];
  const value = shape.value;

  // The harness writes the accepted commit's trailers, and one of them is the
  // key a repeat after a crash finds the commit by. Text that would be read
  // as a trailer is refused rather than escaped.
  const prose: Array<{ path: string; value: string }> = value.kind === 'completion-proposed'
    ? [{ path: 'summary', value: value.summary }, ...(value.recommendation === undefined ? [] : [{ path: 'recommendation', value: value.recommendation }])]
    : value.kind === 'unsuitable'
      ? [{ path: 'detail', value: value.detail }]
      : value.kind === 'contract-needed'
        ? [{ path: 'summary', value: value.summary }]
        : [];
  for (const entry of prose) {
    if (trailerLine.test(entry.value)) {
      errors.push({
        path: entry.path,
        message: 'The harness writes the commit\'s trailers; a submission may not contain a line that reads as one',
        expected: 'prose with no "Ramify-…:" line',
      });
    }
  }

  // A need stated as an interface decides for the other side, which is what
  // a contract iteration exists to prevent. The rule the schema cannot hold
  // is that the need names behavior the consumer can observe, not a design.
  if (value.kind === 'contract-needed' && value.need.outputs.length === 0 && value.need.sideEffects.length === 0) {
    errors.push({
      path: 'need.outputs',
      message: 'A need names what the behavior answers or what it changes; with neither there is nothing to agree on',
      expected: 'at least one entry in "outputs" or in "sideEffects"',
    });
  }

  // The provider's report is offered only where there is an agreement to
  // report against. An engineer that owes no real-provider obligation has
  // nothing it could fail to conform to, and the reason is not parsed from
  // free text: it is refused here.
  if (value.kind === 'unsuitable' && value.reason === 'provider-cannot-conform'
    && (evidence.obligation === undefined || evidence.obligation === null)) {
    errors.push({
      path: 'reason',
      message: 'This assignment owes no obligation to a real provider, so there is no agreement it could report itself unable to conform to',
      expected: '"scope", or an assignment that owes a real-provider obligation',
    });
  }

  // A break this iteration was assigned to make is not a discovery. The
  // architect already planned it, the scope already spans the consumers, and
  // reporting it again would ask for a plan that exists.
  if (value.kind === 'unsuitable' && value.reason === 'break-discovered' && evidence.kind === 'breaking') {
    errors.push({
      path: 'reason',
      message: 'This iteration is already the breaking one its outline planned, so there is no break to discover; report what is unfinished instead',
      expected: '"scope", or a "partial" report',
    });
  }

  if (value.kind === 'completion-proposed' && evidence.openFindings !== undefined && evidence.openFindings.length > 0) {
    errors.push({
      path: 'kind',
      message: openFindingsMessage(evidence.openFindings),
      expected: '"completion-proposed" only once no Ramify module violation stands',
    });
  }

  if (value.kind === 'completion-proposed' && value.scenarios.length > 0) {
    errors.push(...declarationErrors(value.scenarios, evidence.scenarios ?? { entry: null, records: [] }));
  }

  if (value.kind === 'partial' && value.done.length === 0 && value.unfinished.length === 0) {
    errors.push({
      path: 'unfinished',
      message: 'A partial report names what was done or what is unfinished; naming neither reports nothing',
      expected: 'at least one entry in "done" or in "unfinished"',
    });
  }

  return errors.length === 0 ? shape : { ok: false, errors };
}

// The one harness tool an engineer is given.

export const scopeTestsToolName = 'run_scope_tests';

/**
 * The tool takes nothing. The assignment, its policy and the files that
 * policy currently selects are the harness's, and no tool schema has a field
 * for what the harness already knows.
 */
export const scopeTestsInputSchema = z.object({}).strict();
export const scopeTestsJsonSchema = z.toJSONSchema(scopeTestsInputSchema) as JsonSchema;

export interface ScopeTestsOptions {
  /** External command execution. Tests script outcomes; actual process tests use the default. */
  readonly commandExecution?: CommandRunner | undefined;
  readonly projectRoot: string;
  readonly commands: ProjectCommands;
  readonly policy: TestSelectionPolicy;
  /** The module inventory, refreshed on each call: the tool resolves the policy anew every time. */
  readonly refresh: () => Promise<ArchitectIndex | null>;
  /**
   * Judges the call's input against the tool's own schema. pi rejects an
   * input its schema refuses before the tool runs; the harness judges again
   * whatever reaches it, so it never relies on that having happened.
   */
  readonly judge: (input: unknown) => Promise<{ readonly ok: true } | { readonly ok: false; readonly text: string }>;
  /** The scenario check of this scope, where the run tracks scenarios; absent, the tool runs the tests alone. */
  readonly scenarios?: ScopeScenarioCheck | undefined;
  /** Records what the run observed of the call. */
  readonly observe: (observation: {
    readonly resolved: readonly string[];
    readonly outcome: 'passed' | 'failed' | 'not-verified';
    readonly notVerified: string | null;
    readonly exitCode: number | null;
    readonly elapsedMs: number;
    /** What the scenario check ran and passed, where the tool ran one. */
    readonly scenarios?: ScopeScenarioObservation | undefined;
  }) => Promise<void>;
}

/**
 * The scenario check `run_scope_tests` runs beside the tests: in quick mode,
 * the scope's scenarios selected by identity, the work item's pending ones
 * included, so an engineer sees whether the scenarios it binds pass before
 * it declares them.
 */
export interface ScopeScenarioCheck {
  /** Plans the check anew for each call; undefined where the run tracks no scenario or has no scenario harness. */
  readonly plan: () => Promise<ScenarioCheckPlanning | undefined>;
  /** The directory of one call's profiles, streams and log, outside the worktree. */
  readonly directory: () => string;
  /** Each tracked scenario's name, for the result. */
  readonly names?: ReadonlyMap<string, string> | undefined;
}

/** What one call's scenario check ran, as the run records it. */
export interface ScopeScenarioObservation {
  /** The scenarios it selected; empty where none was selected. */
  readonly selected: readonly string[];
  readonly passed: readonly string[];
  /** How many reasons it did not pass. */
  readonly failures: number;
}

/**
 * The engineer's own test run: the assignment's policy, resolved anew from
 * the current tree, run through the project's own runner, and the scope's
 * scenarios in quick mode. It proves nothing — only a gate does — and it
 * never narrows to the files that changed.
 */
export function createScopeTestsTool(options: ScopeTestsOptions): ToolDefinition {
  return {
    name: scopeTestsToolName,
    description: [
      'Runs the tests this iteration is judged on. It takes no arguments: the harness resolves the',
      'assignment\'s selection from the tree as it stands on every call, so a test you have just written',
      'runs. Its result is a diagnosis, never a verdict: only the gate accepts an iteration.',
      ...(options.scenarios === undefined ? [] : [
        'It also runs your scope\'s scenarios in quick mode, the declared ones and this work item\'s pending',
        'ones, and reports each scenario\'s status, its failing step and the steps no definition matches.',
      ]),
    ].join(' '),
    inputSchema: scopeTestsJsonSchema,
    mutating: false,
    async execute(input: unknown, signal: AbortSignal): Promise<ToolResult> {
      const judged = await options.judge(input);
      if (!judged.ok) return { isError: true, text: judged.text };
      const tests = await runScopeTestSelection(options, signal);
      const scenarios = options.scenarios === undefined ? undefined : await runScopeScenarios(options, options.scenarios, signal);
      await options.observe({ ...tests.observation, ...(scenarios?.observation === undefined ? {} : { scenarios: scenarios.observation }) });
      const failed = tests.observation.outcome !== 'passed' || scenarios?.failed === true;
      return {
        isError: failed,
        text: scenarios === undefined ? tests.text : [tests.text, '', ...scenarios.lines].join('\n'),
      };
    },
  };
}

/** The test half of one call: what it ran, what the run records, and what the engineer reads. */
async function runScopeTestSelection(options: ScopeTestsOptions, signal: AbortSignal): Promise<{
  readonly observation: {
    readonly resolved: readonly string[];
    readonly outcome: 'passed' | 'failed' | 'not-verified';
    readonly notVerified: string | null;
    readonly exitCode: number | null;
    readonly elapsedMs: number;
  };
  readonly text: string;
}> {
  const index = await options.refresh();
  const resolved = await resolveTestSelection({ projectRoot: options.projectRoot, index, policy: options.policy });
  const check = scopedTestCheck(options.commands, resolved);
  if (resolved.failure !== null) {
    return {
      observation: { resolved: resolved.selection.resolved, outcome: 'not-verified', notVerified: resolved.failure.failed, exitCode: null, elapsedMs: 0 },
      text: `The selection could not be resolved (${resolved.failure.failed}): ${resolved.failure.detail}. Nothing ran.`,
    };
  }
  if (resolved.selection.resolved.length === 0) {
    return {
      observation: { resolved: [], outcome: 'not-verified', notVerified: 'empty-selection', exitCode: null, elapsedMs: 0 },
      text: 'The selection is empty: this assignment owns no test file yet. Writing the first one is part of the work.',
    };
  }
  const run = await (options.commandExecution ?? runCommand)({
    argv: check.command.argv,
    cwd: check.command.cwd,
    env: checkCommandEnvironment(check.command),
    timeoutMs: check.command.timeoutMs,
    ...(signal === undefined ? {} : { signal }),
  });
  const exitCode = run.outcome.kind === 'completed' ? run.outcome.exitCode : null;
  const outcome = run.outcome.kind !== 'completed' ? 'not-verified' : exitCode === 0 ? 'passed' : 'failed';
  return {
    observation: {
      resolved: resolved.selection.resolved,
      outcome,
      notVerified: run.outcome.kind === 'completed' ? null : run.outcome.kind,
      exitCode,
      elapsedMs: run.elapsedMs,
    },
    text: [
      `${resolved.selection.resolved.length} test file(s): ${resolved.selection.resolved.join(', ')}`,
      `Outcome: ${outcome}${exitCode === null ? '' : ` (exit ${exitCode})`}, ${(run.elapsedMs / 1000).toFixed(1)} s.`,
      '',
      run.output.tail,
    ].join('\n'),
  };
}

/**
 * The scenario half of one call: the check planned for the scope, run in
 * quick mode through the same runner a gate uses, and its result per
 * scenario. Undefined where the run tracks nothing to say about.
 */
async function runScopeScenarios(options: ScopeTestsOptions, scenarios: ScopeScenarioCheck, signal: AbortSignal): Promise<{
  readonly observation: ScopeScenarioObservation;
  readonly failed: boolean;
  readonly lines: string[];
} | undefined> {
  const planning = await scenarios.plan();
  if (planning === undefined) return undefined;
  if ('none' in planning) {
    return {
      observation: { selected: [], passed: [], failures: 0 },
      failed: false,
      lines: ['Scenarios: none of this scope is declared yet, and this work item has no pending one, so none ran.'],
    };
  }
  const { check } = planning;
  const plan = check.scenarios!;
  const directory = scenarios.directory();
  await mkdir(directory, { recursive: true });
  const { summary } = await runScenarioCheck({
    command: check.command,
    plan,
    projectRoot: options.projectRoot,
    attemptDirectory: directory,
    outputFile: join(directory, 'scenarios.log'),
    signal,
    ...(options.commandExecution === undefined ? {} : { runner: options.commandExecution }),
  });
  const passed = scenarioCheckPassed(summary);
  const selected = plan.selection.kind === 'identity' ? plan.selection.scenarios : summary.scenarios.map(result => result.id);
  return {
    observation: {
      selected: [...selected],
      passed: summary.scenarios.filter(result => result.status === 'passed').map(result => result.id),
      failures: summary.failures.length,
    },
    failed: !passed,
    lines: [
      `Scenarios: ${passed ? 'passed' : 'failed'}; ${describeScenarioCheck(summary)}.`,
      ...scenarioCheckLines(summary, scenarios.names ?? new Map()),
    ],
  };
}

// The briefing.

/** What one written module may import: its API views, or why none was materialized. */
export interface IterationApiViews {
  readonly module: string;
  readonly views: readonly { readonly area: string; readonly path: string; readonly coverage: number | null }[];
  readonly unavailable: string | null;
}

export interface IterationBriefing {
  readonly assignment: IterationAssignment;
  readonly projectRoot: string;
  /** The commit `git diff` compares against: the last accepted boundary. */
  readonly base: string;
  /** The API views of the modules this iteration writes, or why one has none. */
  readonly views?: readonly IterationApiViews[] | undefined;
  /**
   * Diagnostics of the attempt that did not pass, where this invocation is a
   * repair: its cause and the lines the harness prepared, one per failing
   * command with the findings or the output end of that command.
   */
  readonly failedGate?: { readonly id: string; readonly cause: string | null; readonly summary: readonly string[] } | undefined;
  /** What an earlier invocation of this iteration reported before it ran out of context. */
  readonly handoff?: { readonly done: readonly string[]; readonly unfinished: readonly string[]; readonly returns: number } | undefined;
  /** The work item's scenarios; absent for a provider or follow-up work item, whose briefing says nothing of them. */
  readonly scenarios?: EngineerScenarios | undefined;
}

/** The first user message of one engineer invocation. */
export function iterationMessage(briefing: IterationBriefing): string {
  const { assignment } = briefing;
  const paths = scopePaths(briefing.projectRoot, assignment.scope);
  const lines: string[] = [
    `# Iteration ${assignment.id} — ${describeBase(assignment)}`,
    '',
    '## Goal',
    '',
    assignment.goal,
    '',
    '## Approach the architect asked for',
    '',
    assignment.approach,
    '',
    '## What you may write',
    '',
    ...paths.roots.map(root => `- \`${root}/\` and everything beneath it`),
    ...paths.files.map(file => `- \`${file}\``),
    '',
    'Nothing else. A write outside this scope is refused before it happens; report the need instead of working around it.',
    '',
  ];

  if (briefing.views !== undefined && briefing.views.length > 0) {
    lines.push('## What you may import', '');
    lines.push('Imports from other modules are answered by the API view of the module that imports, not by other modules\' source:', '');
    for (const entry of briefing.views) {
      if (entry.views.length === 0) {
        lines.push(`- \`${entry.module}\`: no API view, because ${entry.unavailable ?? 'none was materialized'}. Absence of a view is not permission; the Ramify check after each change still answers.`);
        continue;
      }
      for (const view of entry.views) {
        lines.push(`- \`${entry.module}\` (${view.area}): \`${view.path}/\`; ${view.coverage === null
          ? 'coverage complete, so a symbol it does not list is not importable'
          : `coverage limits: ${view.coverage}, so absence is not proof`}.`);
      }
    }
    lines.push('', 'A symbol you need that is not there is reported with `unsuitable`, reason `scope`; it is never imported anyway.', '');
  }

  if (assignment.scope.bootstrap.length > 0) {
    lines.push('This iteration creates a module. Its directory does not exist yet, and you may create it with its');
    lines.push('declaration, its README and its own source. Creating any other module is not authorized.', '');
  }

  lines.push('## Completion evidence', '', assignment.completionEvidence, '');
  lines.push(
    `The gate runs the \`${assignment.gate.checkpoint}\` checkpoint: the tests owned by`,
    `${[...assignment.gate.tests.exactOwners, ...assignment.gate.tests.subtrees.map(subtree => `${subtree} (subtree)`)].join(', ') || 'nothing yet'},`,
    'the project\'s type check and a complete Ramify check. Call `run_scope_tests` to run the same selection yourself.',
    '',
  );
  if (briefing.scenarios !== undefined) {
    lines.push(
      'It also runs, in quick mode, every scenario of your scope that has been declared, selected by identity.',
      '`run_scope_tests` runs those and this work item\'s pending ones.',
      '',
    );
  }
  lines.push(...engineerScenarioSection(briefing.scenarios, assignment.scenarios ?? []));

  if (assignment.externalCapabilities.length > 0) {
    lines.push('## Capabilities other modules own', '');
    for (const capability of assignment.externalCapabilities) {
      lines.push(`- \`${capability.capability}\` is owned by \`${capability.owner}\`; you may ${capability.role} it.`);
    }
    lines.push('');
  }

  lines.push(
    '## The tree you start from',
    '',
    `\`git diff ${briefing.base}\` shows exactly the work since the last accepted boundary, this iteration's included.`,
    'Uncommitted changes are that work; the harness commits only after a gate passes.',
    '',
  );

  if (briefing.handoff !== undefined) {
    lines.push('## What the last session of this iteration reported', '');
    for (const done of briefing.handoff.done) lines.push(`- Done: ${done}`);
    for (const unfinished of briefing.handoff.unfinished) lines.push(`- Unfinished: ${unfinished}`);
    lines.push('', `This is return ${briefing.handoff.returns} of this iteration's context budget. Continue from the files, not from memory.`, '');
  }

  if (briefing.failedGate !== undefined) {
    lines.push('## The gate did not pass', '');
    lines.push(`Attempt \`${briefing.failedGate.id}\`${briefing.failedGate.cause === null ? '' : ` (${briefing.failedGate.cause})`}. What ran, and what it reported:`, '');
    lines.push(...briefing.failedGate.summary);
    lines.push('', 'Repair it and propose completion again. The next attempt runs the complete required set, not only what failed.', '');
  }

  lines.push(`Work within the scope above and end your turn with \`${engineerToolName}\`.`);
  return lines.join('\n');
}

function describeBase(assignment: IterationAssignment): string {
  const base = assignment.scope.base;
  if ('module' in base) {
    return base.includedChildren.length === 0
      ? base.module
      : `${base.module}, with ${base.includedChildren.join(', ')}`;
  }
  return base.modules.join(', ');
}
