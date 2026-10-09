import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, basename, relative, sep } from 'node:path';
import { childEnvironment, type CommandRunner } from '../../subs/evidence/src/run-command.js';
import { loadCucumberConfiguration } from '../../subs/evidence/src/cucumber-configuration.js';
import { buildFocusedScenarioCommand, type FocusedScenarioCommand } from './focused-scenarios.js';
import { readFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { architectViewDirectory, findModule, readApiView, readArchitectMeta, type ApiViewSnapshot, type ArchitectIndex, type SourceArea } from '../../subs/evidence/src/views.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import type { ApiViewEvidence } from '../interfaces/protocol/jobs.js';
import type { RegistryEntry, Hypothesis } from '../analysis/records.js';
import type { PlacementDecision } from '../architecture/records.js';
import type { EnvironmentProblem } from '../deviations/records.js';
import type { IterationApiViews } from './engineer.js';
import type { IntegrationBriefing } from './integration.js';
import { architectScenarioSection, type BriefedScenario } from './scenario-briefing.js';
import type { WorkItem, WorkItemOutline } from './records.js';
import type { EngineerBounds } from '../run/policy.js';
import { analysisLines, boundOf, digestLines } from './failure.js';
import type { IterationResult, WriteScope } from './iterations.js';
import type { DefaultWriteScope } from './scope.js';
import type { TestArea } from '../run/project-config.js';

/*
 * What a local architect is given for one work item: the goal, its
 * requirement and acceptance references, its module's onboarding and API
 * view, the hypotheses it received with their rationales, and the registry.
 *
 * Its own API view is the evidence of what its module may import; the
 * architect view says what exists and who owns it. Where the view cannot be
 * materialized the message says so, so that absence is never read as a
 * refusal.
 */

/** A module's onboarding: the first top-level prose paragraph of its README, and where that is. */
export interface Onboarding {
  readonly path: string;
  readonly purpose: string | null;
  /** Why there is none; never a fallback to another owner's prose. */
  readonly missing?: string;
}

/** The first top-level prose paragraph of a module's README, as a tour reads it. */
export async function onboardingOf(projectRoot: string, directory: string): Promise<Onboarding> {
  const relative = directory === '' ? 'README.md' : `${directory}/README.md`;
  let text: string;
  try {
    text = await readFile(join(projectRoot, relative), 'utf8');
  } catch (error) {
    return { path: relative, purpose: null, missing: `it cannot be read: ${error instanceof Error ? error.message : String(error)}` };
  }
  for (const block of text.split(/\n\s*\n/)) {
    const paragraph = block.trim();
    if (paragraph === '' || paragraph.startsWith('#') || paragraph.startsWith('<!--')) continue;
    return { path: relative, purpose: paragraph.replace(/\s+/g, ' ') };
  }
  return { path: relative, purpose: null, missing: 'it has no top-level prose paragraph' };
}

/** The API views of one module, materialized for this work item, or why there are none. */
export interface ApiViewResult {
  readonly evidence: ApiViewEvidence | null;
  readonly unavailable: string | null;
}

/**
 * Materializes and reads the work item's module's own API views. A module
 * that does not exist yet has none, and a Ramify that cannot materialize one
 * leaves the reason rather than an empty view.
 */
export async function apiViewsOf(
  ramify: RamifyCli,
  projectRoot: string,
  index: ArchitectIndex | null,
  module: string,
): Promise<ApiViewResult> {
  if (index === null) return { evidence: null, unavailable: 'this run has no architect view, so no API view was materialized' };
  const entry = findModule(index, module);
  if (!entry) return { evidence: null, unavailable: `"${module}" is not a module of the architect view, so it has no API view yet` };
  const result = await ramify.materialize(projectRoot, entry.dir);
  if (!result.ok) return { evidence: null, unavailable: `the API view could not be materialized: ${result.message}` };
  // Materialization refreshes the architect and API views together. A run's
  // earlier index remains useful for module selection, but its revision may
  // correctly predate edits made during the run.
  let current;
  try {
    current = await readArchitectMeta(projectRoot);
  } catch (error) {
    return { evidence: null, unavailable: `the materialized architect view could not be read: ${error instanceof Error ? error.message : String(error)}` };
  }
  const views: ApiViewEvidence['views'][number][] = [];
  const unavailable: string[] = [];
  for (const area of ['src', 'src/tests'] as const satisfies readonly SourceArea[]) {
    try {
      const source = await stat(join(projectRoot, entry.dir, area)).catch(error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      });
      if (source === undefined) continue;
      if (!source.isDirectory()) throw new Error('the source area is not a directory');
      const snapshot: ApiViewSnapshot | undefined = await readApiView(projectRoot, entry, area);
      if (!snapshot) throw new Error('materialization reported success but the existing source area has no generated API metadata');
      if (snapshot.revision !== current.revision) {
        throw new Error(`the generated API revision ${snapshot.revision} differs from the architect revision ${current.revision}`);
      }
      views.push({ area: snapshot.area, path: snapshot.path, revision: snapshot.revision, coverage: snapshot.coverage });
    } catch (error) {
      unavailable.push(`${[entry.dir, area, '.ramify'].filter(Boolean).join('/')}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (views.length === 0) return { evidence: null, unavailable: unavailable.join('; ') || `"${module}" has no existing source area with an API view` };
  return { evidence: { module, views }, unavailable: unavailable.length === 0 ? null : unavailable.join('; ') };
}

/**
 * The API views of the modules one implementation session writes, for its
 * briefing: each module's views, or why it has none.
 */
export async function iterationApiViews(
  ramify: RamifyCli,
  projectRoot: string,
  index: ArchitectIndex | null,
  base: WriteScope['base'],
): Promise<IterationApiViews[]> {
  const modules = 'module' in base
    ? [base.module, ...[...index?.modules.values() ?? []].filter(module => base.included.some(entry => module.dir === entry.directory || module.dir.startsWith(`${entry.directory}/`))).map(module => module.module)]
    : base.modules;
  const entries: IterationApiViews[] = [];
  for (const module of new Set(modules)) {
    const result = await apiViewsOf(ramify, projectRoot, index, module)
      .catch(error => ({ evidence: null, unavailable: `the API view could not be read: ${error instanceof Error ? error.message : String(error)}` }));
    entries.push({
      module,
      views: result.evidence === null ? [] : result.evidence.views.map(view => ({ area: view.area, path: view.path, revision: view.revision, coverage: view.coverage })),
      unavailable: result.unavailable,
    });
  }
  return entries;
}

export interface WorkItemBriefing {
  readonly item: WorkItem;
  /**
   * The work item's package once it is selected: its hash and its element
   * IDs. Its text is appended to the session once and never repeated here.
   */
  readonly package?: { readonly hash: string; readonly elements: readonly string[] } | undefined;
  /** Runtime location for resolving paths in this reader's briefing. Durable paths stay project-relative. */
  readonly projectRoot?: string | undefined;
  readonly workingDirectory?: string | undefined;
  readonly moduleDirectory?: string | undefined;
  readonly testAreas?: readonly TestArea[] | undefined;
  readonly setup?: string | undefined;
  readonly onboarding: Onboarding;
  readonly views: ApiViewResult;
  /** What an assignment based on this work item's module gives its engineer, where the provider or the view knows the module. */
  readonly defaultWriteScope?: readonly DefaultWriteScope[] | undefined;
  readonly hypotheses: readonly Hypothesis[];
  readonly registry: readonly RegistryEntry[];
  /** The placement decisions delivered to this work item, its own local ones included. */
  readonly decisions: readonly PlacementDecision[];
  /** A request of this work item that came back without a decision. */
  readonly unresolvedRequest?: {
    readonly id: string;
    readonly findings: readonly string[];
    readonly gaps: readonly string[];
  } | undefined;
  /**
   * The plan deviations recorded after the work-item package, rendered by the
   * package creator; the package holds the ones recorded before it. Each
   * amends the elements it names for the rest of the run.
   */
  readonly deviations?: string | undefined;
  /** The deviation that just answered this architect's unresolved request. */
  readonly deviationRecorded?: string | undefined;
  /**
   * The environment problem that just answered this architect's unresolved
   * request, after which the operator resumed the run, with their note.
   */
  readonly environmentResumed?: { readonly problem: EnvironmentProblem; readonly note: string } | undefined;
  /** The outline revisions already committed for this item, oldest first. */
  readonly outlines: readonly WorkItemOutline[];
  /** What this work item owes and is owed across a delegation. */
  readonly delegation?: DelegationBriefing | undefined;
  /**
   * A gate that failed and returned to the architect, with what it found:
   * its cause and the lines the harness prepared, one per failing command
   * with what that command reported.
   */
  readonly failedGate?: { readonly id: string; readonly cause: string | null; readonly summary: readonly string[] } | undefined;
  /** For an integration work item: its scenario, the sub-scenarios, their owners' step files and the engineer's scope. */
  readonly integration?: IntegrationBriefing | undefined;
  /** For an entry's work item: every scenario of its entry, with its state. */
  readonly scenarios?: readonly BriefedScenario[] | undefined;
  /** The iteration this architect last assigned, as the harness closed it. */
  readonly lastIteration?: {
    readonly id: string;
    readonly outcome: string;
    readonly findings: readonly string[];
    readonly recommendation?: string | undefined;
    readonly commit: string | null;
    /** The gate that returned it, where one did, with what each failing command reported. */
    readonly gate?: { readonly id: string; readonly cause: string | null; readonly summary: readonly string[] } | undefined;
    /** The scenarios its passing gate ran, each with the step definitions that bound it. */
    readonly scenarios?: readonly string[] | undefined;
    /** The bounds its engineers ran under. */
    readonly bounds?: EngineerBounds | undefined;
    /** Where its engineer ended without a result: the harness's digest and the failure analysis. */
    readonly failure?: IterationResult['failure'] | undefined;
  } | undefined;
  /** The bounds an engineer runs under unless an assignment raises them, and the ceilings it may raise them to. */
  readonly bounds?: { readonly defaults: EngineerBounds; readonly ceilings: EngineerBounds } | undefined;
  /** The run's directory, which the paths of a failure digest are relative to. */
  readonly runDirectory?: string | undefined;
  /**
   * The reconciliation of this work item's completion request that returns
   * it to this architect: the correction it chose, with the CheckFindings
   * planned for repair, and its brief where the brief could not be appended
   * to this session, from the run log.
   */
  readonly reconciliation?: ReconciliationBriefing | undefined;
}

/** A reconciliation, as the local architect it returns to receives it. */
export interface ReconciliationBriefing {
  readonly id: string;
  readonly next: 'complete' | 'correct' | 'await-user' | 'unresolved';
  /** The goal of the correction, where it chose one. */
  readonly goal?: string | undefined;
  readonly repairs: ReadonlyArray<{ readonly checkFinding: string; readonly title: string }>;
  /** The brief, where it is not in this session: its append failed, or the session is a new one. */
  readonly brief?: string | undefined;
  /** Why the append failed, where it did. */
  readonly appendFailure?: string | undefined;
}

/** What a work item owes and is owed across a delegation, at its coordination point. */
export interface DelegationBriefing {
  /** The requirements of this work item that no verification has closed. */
  readonly open: ReadonlyArray<{
    readonly requirement: string;
    readonly capability: string;
    readonly provider: string;
    readonly conformed: boolean;
    readonly fakeInjections: readonly string[];
    readonly suite: readonly string[];
  }>;
  /** The requirements a resumption just released, where this turn is one. */
  readonly released: readonly string[];
  /** The obligation this work item exists to satisfy, where it is a provider item. */
  readonly obligation?: {
    readonly id: string;
    readonly capability: string;
    readonly behavior: string;
    readonly suite: readonly string[];
  } | undefined;
  /** A cycle a registration of this work item closed. */
  readonly cycle?: { readonly members: readonly string[]; readonly workItems: readonly string[] } | undefined;
  /** Why completion was refused. */
  readonly blocked?: readonly string[] | undefined;
  /** Providers that reported they cannot conform to the agreement as it stands. */
  readonly revisionsNeeded?: ReadonlyArray<{
    readonly obligation: string;
    readonly revision: number;
    readonly contract: string;
    readonly iteration: string;
    readonly detail: string;
  }> | undefined;
}

/**
 * The "Default write scope" block of an architect's briefing: for each owner,
 * the directory its base gives an engineer, the only directories `included`
 * may name, and the guarded files beneath it. Empty where no owner is known.
 */
export function defaultWriteScopeSection(scopes: readonly DefaultWriteScope[]): string[] {
  if (scopes.length === 0) return [];
  const code = (paths: readonly string[]) => paths.length === 0 ? 'none' : paths.map(path => `\`${path}\``).join(', ');
  const lines = ['## Default write scope', ''];
  for (const scope of scopes) {
    lines.push(`- \`${scope.module}\`: the base gives its engineer \`${scope.directory === '' ? '.' : scope.directory}/\` whole — \`module.ramify\`, \`README.md\`, all of \`src/\` with \`src/tests/\` and \`src/interfaces/\`, other documentation and auxiliary source — except the directories below.`);
    lines.push(`  - Immediate child modules: ${scope.children.length === 0 ? 'none' : scope.children.map(child => `\`${child.directory}\` (\`${child.module}\`)`).join(', ')}.`);
    lines.push(`  - Owned nested-project roots: ${scope.nestedProjects === null ? 'unavailable, because the ownership query gave no answer' : code(scope.nestedProjects)}.`);
    lines.push(`  - Guarded files, writable only with an authorization: ${code(scope.guarded)}.`);
  }
  lines.push('', 'Those child and nested-project directories are the only valid `included` values, and `included` is `[]` unless the iteration needs one of them whole. An included child brings its whole subtree, every module beneath it included.', '');
  return lines;
}

/** The first user message of one local architect invocation. */
export function workItemMessage(briefing: WorkItemBriefing): string {
  const { item } = briefing;
  const rooted = (path: string): string => briefing.projectRoot === undefined ? path : join(briefing.projectRoot, path);
  const lines: string[] = [
    `# Work item ${item.id} — ${item.module}`,
    '',
    '## Goal',
    '',
    item.goal,
    '',
    '## What the plan asks',
    '',
    `- Requirement: ${ids(item.requirementRefs)}`,
    `- Acceptance: ${ids(item.acceptanceRefs)}`,
    `- Context: ${ids(item.contextRefs)}`,
    '',
    briefing.package === undefined
      ? 'Their text arrives in your work-item package once you have oriented.'
      : `Your work-item package \`${briefing.package.hash}\`, already in your session, holds these elements whole with the non-functional, fixed and recommendation elements selected for this work item: ${ids(briefing.package.elements)}. An assignment names, in \`citedElements\`, the elements of this package its iteration must honor; its engineer and reviewers receive exactly those.`,
    '',
    'Tests that state the acceptance are part of the work.',
    '',
    ...deviationSection(briefing.deviations, briefing.deviationRecorded),
    ...(briefing.integration === undefined ? [] : integrationSection(briefing.integration)),
    ...architectScenarioSection(briefing.scenarios ?? []),
    '## Your module',
    '',
    `- Declared name: \`${item.module}\`.`,
    ...(briefing.workingDirectory === undefined ? [] : [
      `- Working directory: \`${briefing.workingDirectory}\`.`,
      briefing.workingDirectory === briefing.projectRoot
        ? '- The assigned module source directory was absent when this session began. This session remains at the project root even if an engineer creates the module. Do not create it from this reader session.'
        : '- This is the assigned module\'s source directory.',
      '- Any project-relative path in this briefing resolves from the project root; structured submissions keep their project-relative paths.',
    ]),
    ...(briefing.moduleDirectory === undefined ? [] : [
      `- Assigned module declaration: \`${rooted(join(briefing.moduleDirectory, 'module.ramify'))}\` (read it if present).`,
      `- Assigned module source: \`${rooted(join(briefing.moduleDirectory, 'src'))}/\` (read it if present).`,
    ]),
    ...(briefing.testAreas ?? []).map(area => `- Test area (${area.module}): \`${rooted(area.area)}/\`.`),
    briefing.onboarding.path === '(module directory unavailable)'
      ? `- Onboarding unavailable: ${briefing.onboarding.missing}. No other module's prose stands in for it.`
      : briefing.onboarding.purpose === null
        ? `- Onboarding: \`${rooted(briefing.onboarding.path)}\` gives none: ${briefing.onboarding.missing}. No other module's prose stands in for it.`
        : `- Onboarding (\`${rooted(briefing.onboarding.path)}\`): ${briefing.onboarding.purpose}`,
  ];

  if (briefing.views.evidence === null) {
    lines.push(`- API view: none was materialized, because ${briefing.views.unavailable}. Absence of a view is not a refusal; say so in your outline if it matters.`);
  } else {
    if (briefing.views.unavailable !== null) lines.push(`- API view limitations: ${briefing.views.unavailable}. Missing evidence is not proof of API absence.`);
    for (const view of briefing.views.evidence.views) {
      lines.push(`- API view (${view.area}): \`${rooted(view.path)}/\`, revision \`${view.revision}\`; ${view.coverage === null
        ? 'coverage complete, so absence means unavailable'
        : `coverage limits: ${view.coverage}, so absence is not proof of unavailability`}.`);
    }
  }
  lines.push(`- The architect view is at \`${rooted(architectViewDirectory)}/\`.`, '');
  if (briefing.setup) lines.push(briefing.setup, '');
  lines.push(...defaultWriteScopeSection(briefing.defaultWriteScope ?? []));

  lines.push('## Hypotheses you received', '');
  if (briefing.hypotheses.length === 0) {
    lines.push('None. The initial analysis forecast nothing that involves your module.');
  } else {
    for (const hypothesis of briefing.hypotheses) {
      lines.push(`### ${hypothesis.id} (revision ${hypothesis.revision}, ${hypothesis.standing})`);
      lines.push(`- Capability \`${hypothesis.capability}\`, change \`${hypothesis.change}\`, confidence ${hypothesis.confidence}.${hypothesis.changesExistingSymbols ? ' It is forecast to change symbols that already have consumers.' : ''}`);
      lines.push(`- Suggested owner: \`${hypothesis.suggestedOwner}\`. Involves: ${list(hypothesis.involvedModules)}. Anticipated consumers: ${list(hypothesis.anticipatedConsumers)}.`);
      lines.push(`- Rationale: ${hypothesis.rationale}`);
      if (hypothesis.assumptions.length > 0) lines.push(`- Assumptions: ${hypothesis.assumptions.join('; ')}`);
      if (hypothesis.uncertainties.length > 0) lines.push(`- Uncertainties: ${hypothesis.uncertainties.join('; ')}`);
      lines.push('');
    }
    lines.push('A hypothesis is a forecast made before any work started. It is not a decision and not an instruction.');
    if (briefing.hypotheses.some(hypothesis => hypothesis.standing === 'superseded')) {
      lines.push('A superseded one no longer forecasts anything: a decision withdrew it, and its own rationale says why.');
    }
  }
  lines.push('');

  lines.push('## The capability registry', '');
  if (briefing.registry.length === 0) lines.push('It is empty.');
  else for (const entry of briefing.registry) lines.push(`- \`${entry.capability}\` → \`${entry.owner}\` (${entry.origin}${entry.proposed === undefined ? '' : ', proposed'}): ${entry.behavior}`);
  lines.push('');

  lines.push('## Placement decided for this work item', '');
  if (briefing.decisions.length === 0) {
    lines.push('None yet. Placement that is yours to decide is recorded with your assignment; placement that is not is asked for.');
  } else {
    for (const decision of briefing.decisions) {
      lines.push(`- \`${decision.id}\` (${decision.authority}${decision.request === null ? '' : `, request ${decision.request}`}): \`${decision.capability}\` ${decision.outcome} → ${decision.owner === null ? 'outside this project' : `\`${decision.owner}\``}${decision.proposed === undefined ? '' : `, to be created at \`${decision.proposed.directory}\``}.${decision.changesExistingSymbols ? ' It changes symbols that already have consumers, so existing consumers may need to adapt.' : ''} ${decision.rationale}`);
      for (const constraint of decision.constraints) lines.push(`  - Constraint: ${constraint}`);
      for (const uncertainty of decision.uncertainties) lines.push(`  - Uncertain: ${uncertainty}`);
      if (decision.revises !== undefined) {
        lines.push(`  - It replaces \`${decision.revises.decision}\`.`);
        for (const affected of decision.revises.affected) {
          if (affected.workItem !== item.id && affected.workItem !== undefined) continue;
          lines.push(`  - What that means here: ${affected.consequence}`);
        }
      }
    }
    lines.push('', 'A decision is accepted placement. It does not claim the owner is implemented, and it does not widen what an engineer may write.');
  }
  lines.push('');

  const delegation = briefing.delegation;
  if (delegation !== undefined && delegation.obligation !== undefined) {
    lines.push('## The obligation this work item exists for', '');
    lines.push(`\`${delegation.obligation.id}\` is the provider obligation of \`${delegation.obligation.capability}\`.`);
    lines.push(`- Behavior agreed: ${delegation.obligation.behavior}`);
    lines.push(`- The conformance suite that judges it, run against the real provider: ${list(delegation.obligation.suite)}.`);
    lines.push('', 'The suite passes unchanged against the real implementation. It is the agreement, not a starting point: changing it is a contract revision, not this work.', '');
  }

  if (delegation !== undefined && delegation.released.length > 0) {
    lines.push('## Your providers have conformed', '');
    lines.push(`Every provider you waited for has conformed: ${list(delegation.released)}.`);
    lines.push('', 'Assign a `verification` iteration: replace the fake with the real provider and rerun the tests that state the behavior. The requirement stays open until that iteration passes.', '');
  }

  if (delegation !== undefined && delegation.open.length > 0) {
    lines.push('## Requirements this work item holds open', '');
    for (const requirement of delegation.open) {
      lines.push(`- \`${requirement.requirement}\`: \`${requirement.capability}\` from \`${requirement.provider}\`; the provider has ${requirement.conformed ? 'conformed' : 'not conformed yet'}.`);
      lines.push(`  - The fake is held at ${list(requirement.fakeInjections)}.`);
      lines.push(`  - The conformance suite is ${list(requirement.suite)}.`);
    }
    lines.push('', 'Passing against a fake is never completion. A requirement closes when a `verification` iteration has replaced the fake and its gate has passed.', '');
  }

  if (delegation?.revisionsNeeded !== undefined && delegation.revisionsNeeded.length > 0) {
    lines.push('## A provider reports it cannot conform', '');
    for (const report of delegation.revisionsNeeded) {
      lines.push(`- \`${report.obligation}\` at revision ${report.revision}, from iteration \`${report.iteration}\`: ${report.detail}`);
      lines.push(`  - The agreement is \`${report.contract}\`, and it stays exactly as it is until a revision is registered.`);
    }
    lines.push(
      '',
      'Assign a `contract` iteration with `revisesContract` naming that agreement and your rationale in `approach`.',
      'The harness supplies the revision number, the scope and the gate. Every consumer attached to the agreement is',
      'reopened at the new revision and verifies again. If no revision would meet the request, answer `unresolved`.',
      '',
    );
  }

  if (delegation?.cycle !== undefined) {
    lines.push('## A capability depends on itself', '');
    lines.push(`The requirement your work item just registered closed this cycle: ${delegation.cycle.members.map(member => `\`${member}\``).join(' → ')} → \`${delegation.cycle.members[0]!}\`.`);
    lines.push(`It runs through the work items ${list(delegation.cycle.workItems)}.`);
    lines.push('', 'Re-plan with the submissions you have: ask the global architect to place the capability elsewhere, assign work so that one side completes without the other, or answer `unresolved`. The same cycle detected again fails the run.', '');
  }

  if (delegation?.blocked !== undefined && delegation.blocked.length > 0) {
    lines.push('## Completion was refused', '');
    for (const reason of delegation.blocked) lines.push(`- ${reason}`);
    lines.push('', 'Assign the work that discharges each of these, then request completion again. A requirement closes when a `verification` iteration has replaced its fake and passed; an obligation is discharged when the agreed suite has passed against the real provider; a capability request closes with an accepted current handback of its task, or an accepted consumer verification where it used an existing interface.', '');
  }

  if (briefing.unresolvedRequest !== undefined) {
    const request = briefing.unresolvedRequest;
    lines.push('## Your placement request was not resolved', '');
    lines.push(`\`${request.id}\` came back without a decision. What the global architect established:`);
    for (const finding of request.findings) lines.push(`- Finding: ${finding}`);
    for (const gap of request.gaps) lines.push(`- Gap: ${gap}`);
    lines.push('', 'Nothing was placed and nothing was registered. Decide what to do with the work item on the evidence you have, or answer `unresolved`.', '');
  }

  if (briefing.environmentResumed !== undefined) lines.push(...environmentSection(briefing.environmentResumed));

  if (briefing.bounds !== undefined) {
    const { defaults, ceilings } = briefing.bounds;
    lines.push('## The bounds of an engineer', '');
    lines.push(`Unless an assignment raises them, one shell command may run ${defaults.commandTimeoutMs} ms, a session may go ${defaults.idleMs} ms without a sign of activity, and one invocation may run ${defaults.absoluteMs} ms.`);
    lines.push(`\`assignment.bounds\` raises them for one iteration, each with its reason, up to ${ceilings.commandTimeoutMs}, ${ceilings.idleMs} and ${ceilings.absoluteMs} ms.`, '');
  }

  if (briefing.lastIteration !== undefined) {
    const last = briefing.lastIteration;
    lines.push('## The iteration you last assigned', '');
    lines.push(`\`${last.id}\` ended \`${last.outcome}\`${last.commit === null ? ', with nothing committed' : `, committed as ${last.commit}`}.`);
    if (last.bounds !== undefined && last.failure === undefined) {
      lines.push(`Its engineers ran under a command maximum of ${last.bounds.commandTimeoutMs} ms, an idle bound of ${last.bounds.idleMs} ms and an absolute bound of ${last.bounds.absoluteMs} ms.`);
    }
    for (const finding of last.findings) lines.push(`- Finding: ${finding}`);
    if (last.recommendation !== undefined) {
      lines.push(`- Recommendation: ${last.recommendation}`);
      lines.push('  A recommendation is advice. It never widens a scope and never discharges an obligation; you decide.');
    }
    if (last.gate !== undefined) {
      lines.push('', `Its gate \`${last.gate.id}\` did not pass${last.gate.cause === null ? '' : ` (${last.gate.cause})`}. What ran, and what it reported:`, '');
      lines.push(...last.gate.summary);
    }
    if (last.scenarios !== undefined && last.scenarios.length > 0) {
      lines.push('', 'The scenarios its gate passed, and the step definition that bound each step:', '');
      lines.push(...last.scenarios);
      lines.push('', 'A definition outside the owner\'s own step files reached the run through an import, which Ramify verified.');
    }
    if (last.failure === undefined) {
      lines.push('', 'Assign the next iteration, or request completion and let the work item\'s gate answer.', '');
    } else {
      lines.push(...failureSection(last.failure, briefing.bounds?.ceilings, briefing.runDirectory));
    }
  }

  if (briefing.reconciliation !== undefined) lines.push(...reconciliationSection(briefing.reconciliation));

  if (briefing.failedGate !== undefined) {
    lines.push('## The gate did not pass', '');
    lines.push(`Attempt \`${briefing.failedGate.id}\`${briefing.failedGate.cause === null ? '' : ` (${briefing.failedGate.cause})`}:`, '');
    lines.push(...briefing.failedGate.summary);
    lines.push('', 'Revise your outline and say in `revisionReason` what you changed and why, or answer `unresolved`.', '');
  } else if (briefing.outlines.length > 0) {
    lines.push(`## Earlier outlines`, '', `This work item already has ${briefing.outlines.length} outline revision(s).`, '');
  }

  lines.push('Read your module, decide, and submit.');
  return lines.join('\n');
}

/** What each bound is called, and the field of `assignment.bounds` that raises it. */
const boundFields = { idleMs: 'the idle bound', absoluteMs: 'the absolute bound of an invocation' } as const;

/**
 * An engineer that ended without a result, as its architect decides on it:
 * the harness's digest, the failure analysis, and the options it has.
 */
function failureSection(failure: NonNullable<IterationResult['failure']>, ceilings: EngineerBounds | undefined, runDirectory: string | undefined): string[] {
  const { digest, analysis } = failure;
  const lines: string[] = [
    '',
    `### Its ${digest.role === 'contract-engineer' ? 'contract engineer' : 'engineer'} ended without a result`,
    '',
    'What the harness derived from what it holds:',
    '',
    ...digestLines(digest, runDirectory),
    '',
    '### The failure analysis',
    '',
    ...analysisLines(analysis),
    '',
    'Your options: assign a fresh iteration, which starts from the tree with the uncommitted work in it; request completion and let the work item\'s gate answer; or answer `unresolved`.',
  ];
  const bound = boundOf(digest);
  if (bound !== null) {
    lines.push(`${boundFields[bound][0]!.toUpperCase()}${boundFields[bound].slice(1)} ended it, at ${digest.bounds[bound]} ms. If the work needs more, raise \`assignment.bounds.${bound}\` in the next assignment${ceilings === undefined ? '' : `, up to ${ceilings[bound]} ms`}, and \`commandTimeoutMs\` with it where a command needs longer${ceilings === undefined ? '' : `, up to ${ceilings.commandTimeoutMs} ms`}.`);
  }
  lines.push('');
  return lines;
}

/**
 * The plan deviations recorded after the work-item package, and the one
 * that answered this architect's unresolved request.
 */
function deviationSection(deviations: string | undefined, recorded: string | undefined): string[] {
  const lines: string[] = [];
  if (recorded !== undefined) {
    lines.push('## Your unresolved request was answered with a plan deviation', '');
    lines.push(`The global architect answered with plan deviation \`${recorded}\`, below. Go on with the work item under it: meet the rest of the plan as written and the elements it amends as the deviation states them. Do not answer \`unresolved\` again for the same conflict; the person reviews the deviation.`, '');
  }
  if (deviations === undefined) return lines;
  lines.push('## Plan deviations recorded after your package', '');
  lines.push('The plan file and the catalog are unchanged. Each deviation amends the elements it names for the rest of this run, and your work and its reviews are judged against them as amended.', '');
  lines.push(deviations.trimEnd(), '');
  return lines;
}

/**
 * The environment problem that answered this architect's unresolved
 * request: it was reported to the operator, who resumed the run. The work
 * item retries from its last outline.
 */
function environmentSection({ problem, note }: { readonly problem: EnvironmentProblem; readonly note: string }): string[] {
  return [
    '## The environment problem was reported, and the run resumed',
    '',
    `The global architect answered \`${problem.request}\` with environment problem \`${problem.id}\`: the conflict lies in how the gate or the harness runs, not in the plan or the architecture. Its diagnosis:`,
    '',
    ...problem.diagnosis.split('\n').map(line => `> ${line}`),
    '',
    `What it suggested to the operator: ${problem.suggestion}`,
    '',
    note.trim() === '' ? 'The operator resumed the run and left no note.' : `The operator resumed the run, with this note: ${note}`,
    '',
    'Nothing was placed, no deviation was recorded and the plan is unchanged. Retry from your last outline: assign the iteration again, or request completion again for a fresh gate attempt. If the same failure returns, answer `unresolved` again with the new evidence.',
    '',
  ];
}

/** What a reconciliation returns to the local architect: its correction, and its brief where the session lacks it. */
function reconciliationSection(reconciliation: ReconciliationBriefing): string[] {
  const lines: string[] = [`## Reconciliation ${reconciliation.id}`, ''];
  if (reconciliation.brief !== undefined) {
    lines.push(reconciliation.appendFailure === undefined
      ? 'Its brief, from the run log:'
      : `Its brief could not be appended to your session (${reconciliation.appendFailure}); here it is, from the run log:`);
    lines.push('', ...reconciliation.brief.split('\n').map(line => `> ${line}`), '');
  } else {
    lines.push('Its brief was appended to your session.', '');
  }
  if (reconciliation.next === 'correct') {
    lines.push('It chose a correction. The CheckFindings planned for repair:', '');
    for (const repair of reconciliation.repairs) lines.push(`- \`${repair.checkFinding}\`: ${repair.title}`);
    lines.push('', `The correction's goal: ${reconciliation.goal ?? 'as the brief states it'}`, '');
    lines.push('Assign one iteration that makes this correction. It goes through the ordinary gate and reviews; request completion again when it is done.', '');
  }
  return lines;
}

/** The section of an integration work item's briefing: what it binds, from what, and how. */
function integrationSection(integration: IntegrationBriefing): string[] {
  const { scenario, scope } = integration;
  const lines: string[] = [
    `## The integration scenario ${scenario.id}: ${scenario.name}`,
    '',
    `This work item exists to bind one scenario of the plan, which combines several entries. Its owner is \`${scenario.owner}\`,`,
    'the lowest common ancestor of its sub-scenarios\' owners, and every sub-scenario is reported done already.',
    `The harness wrote it into \`${scenario.file}\`; no agent edits a feature file.`,
    '',
    '```gherkin',
    ...scenario.source,
    '```',
    '',
    '### Its sub-scenarios',
    '',
  ];
  for (const sub of integration.subScenarios) {
    lines.push(`- \`${sub.id}\` (${sub.name}), owned by \`${sub.owner}\`, in \`${sub.file}\`.`);
  }
  lines.push('', '### The step files of their owners', '');
  for (const owner of integration.owners) {
    lines.push(`- \`${owner.module}\`, in \`${owner.directory}/\`: ${owner.files.length === 0 ? 'none yet' : owner.files.map(file => `\`${file}\``).join(', ')}.`);
  }
  lines.push(
    '',
    '### How it is bound',
    '',
    `Assign an iteration whose scope base is \`${scope.module}\`${scope.includedChildren.length === 0
      ? ''
      : ` with the children ${scope.includedChildren.map(child => `\`${child}\``).join(', ')} included`}; the harness refuses any other base.`,
    `Its engineer writes a step file in \`${scenario.steps}/\` that imports, by name, the step files above, adds the`,
    '`expose-test` declarations along each path so this module receives them, and defines no step of its own. Name',
    `\`${scenario.id}\` in \`assignment.obligations\`; the engineer's proposal binds it. Its gate runs this module's feature`,
    'files; a failure arrives with the runner\'s own diagnostics, which you and the engineer investigate. The harness',
    'draws no conclusion about its cause. When, in your judgment, it is correctly implemented and passing, report it',
    '`done`; this work item completes at its own work-item gate.',
    '',
  );
  return lines;
}

function ids(values: readonly string[]): string {
  return values.length === 0 ? 'none' : values.join(', ');
}

function list(values: readonly string[]): string {
  return values.length === 0 ? 'none' : values.map(value => `\`${value}\``).join(', ');
}

/** Prepare only an explicit literal Cucumber declaration. Unsupported wrappers/dynamic
 * source choices stay unavailable; configured full-audit authority is unchanged. */
export async function prepareAssignedCucumber(input: { readonly projectRoot: string; readonly scratchDirectory: string;
  readonly featurePaths: readonly string[]; readonly checks: readonly unknown[]; readonly runner: CommandRunner }): Promise<{
    readonly command: FocusedScenarioCommand; readonly sourceFiles: Readonly<Record<string, string>>;
  }> {
  const unavailable = (reason: string) => ({ command: { kind: 'unavailable' as const, reason }, sourceFiles: {} });
  if (input.featurePaths.length === 0) return unavailable('No exact assigned feature files were selected');
  type Declaration = { cmd?: string; args?: readonly string[]; cwd?: string; env?: Record<string, string>; parser?: string };
  const declarations = input.checks.flatMap(check => {
    const executor = (check as { executor?: { kind?: string; commands?: readonly Declaration[] } }).executor;
    return executor?.kind === 'command' ? executor.commands ?? [] : [];
  }).filter(command => command.parser === 'cucumber');
  if (declarations.length !== 1) return unavailable('Exactly one declared Cucumber executor is required');
  let command = declarations[0]!;
  const root = await realpath(input.projectRoot).catch(() => null);
  const cwd = await realpath(resolve(input.projectRoot, command.cwd ?? '.')).catch(() => null);
  if (root === null || cwd === null) return unavailable('Declared Cucumber cwd cannot be observed');
  const inside = relative(root, cwd);
  if (inside === '..' || inside.startsWith(`..${sep}`)) return unavailable('Declared Cucumber cwd is outside the project');
  const extraSources: Record<string, string> = {};
  if (basename(command.cmd ?? '') === 'npm' && command.args?.[0] === 'run' && command.args.length === 2) {
    const packagePath = await realpath(resolve(cwd, 'package.json')).catch(() => null);
    if (packagePath === null || relative(root, packagePath).startsWith(`..${sep}`)) return unavailable('Declared package source is outside the project or unavailable');
    let bytes: Buffer; let script: unknown;
    try { bytes = await readFile(packagePath); script = (JSON.parse(bytes.toString('utf8')) as { scripts?: Record<string, unknown> }).scripts?.[command.args[1]!]; }
    catch { return unavailable('Declared package script cannot be read'); }
    if (typeof script !== 'string') return unavailable('Declared Cucumber script does not exist');
    const tokens = literalCommandTokens(script);
    if (tokens === null) return unavailable('Declared Cucumber script contains dynamic shell syntax');
    const env = { ...command.env };
    while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(tokens[0] ?? '')) {
      const assignment = tokens.shift()!; const equal = assignment.indexOf('='); env[assignment.slice(0, equal)] = assignment.slice(equal + 1);
    }
    const executable = tokens.shift();
    if (!executable || basename(executable) !== 'cucumber-js') return unavailable('Declared script is not a literal Cucumber command');
    extraSources[packagePath] = createHash('sha256').update(bytes).digest('hex');
    command = { ...command, cmd: executable, args: tokens, env };
  }
  if (basename(command.cmd ?? '') !== 'cucumber-js') return unavailable('Unsupported Cucumber executable wrapper');
  const args = command.args ?? []; const profiles: string[] = []; const provided: Record<string, unknown> = {};
  let file: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === '--config' || arg === '-c') file = args[++index];
    else if (arg === '--profile' || arg === '-p') { const profile = args[++index]; if (!profile) return unavailable('Missing declared profile'); profiles.push(profile); }
    else if (arg === '--tags') provided.tags = args[++index];
    else if (arg === '--name') provided.name = [...provided.name as string[] ?? [], args[++index]];
    else if (arg === '--dry-run') provided.dryRun = true;
    else return unavailable(`Unsupported declared Cucumber option ${arg}`);
  }
  if (!file) {
    // Installed 13.2.1 locateFile order. Retain the actual selected source bytes.
    for (const name of ['cucumber.js', 'cucumber.cjs', 'cucumber.mjs', 'cucumber.json', 'cucumber.yaml', 'cucumber.yml']) {
      try { await stat(resolve(cwd, name)); file = name; break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return unavailable('Cucumber default configuration cannot be observed'); }
    }
  }
  if (!file) return unavailable('The declared command selects no authored Cucumber configuration');
  const sourcePath = await realpath(resolve(cwd, file)).catch(() => null);
  if (sourcePath === null) return unavailable('Authored Cucumber configuration cannot be observed');
  const sourceRelative = relative(root, sourcePath);
  if (sourceRelative === '..' || sourceRelative.startsWith(`..${sep}`)) return unavailable('Authored Cucumber configuration is outside the project');
  const source = await readFile(sourcePath).catch(() => null);
  if (source === null) return unavailable('Authored Cucumber configuration cannot be read');
  const sourceIdentity = createHash('sha256').update(source).digest('hex');
  const effective = await loadCucumberConfiguration({ cwd, file, profiles, provided,
    environment: childEnvironment(command.env ?? {}), configurationIdentity: sourceIdentity, nodeExecutable: process.execPath }, input.runner);
  const prepared = buildFocusedScenarioCommand({ effective, featurePaths: input.featurePaths.map(path => resolve(input.projectRoot, path)),
    scratchDirectory: input.scratchDirectory, cucumberExecutable: command.cmd!.includes('/') ? resolve(cwd, command.cmd!) : resolve(cwd, 'node_modules/.bin/cucumber-js') });
  if (prepared.kind === 'available') {
    await mkdir(input.scratchDirectory, { recursive: true });
    await writeFile(prepared.configPath, prepared.configText, { flag: 'wx' }).catch(async error => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await readFile(prepared.configPath, 'utf8') !== prepared.configText) throw error;
    });
  }
  return { command: prepared, sourceFiles: { ...extraSources, [sourcePath]: sourceIdentity } };
}

/** A bounded literal shell parser: quote grouping is accepted; expansions/operators are refused. */
function literalCommandTokens(text: string): string[] | null {
  const words: string[] = []; let word = ''; let quote: string | undefined;
  for (const character of text) {
    if (quote) { if (character === quote) quote = undefined; else if (quote === '"' && /[$`\\]/u.test(character)) return null; else word += character; }
    else if (character === "'" || character === '"') quote = character;
    else if (/\s/u.test(character)) { if (word) { words.push(word); word = ''; } }
    else if (/[;&|<>($`\\]/u.test(character)) return null;
    else word += character;
  }
  if (quote) return null;
  if (word) words.push(word);
  return words;
}

/** Credential-free current selection descriptor carried in the task packet/manifest. */
export function focusedScenarioFacts(prepared: Awaited<ReturnType<typeof prepareAssignedCucumber>>): string {
  const command = prepared.command;
  return JSON.stringify(command.kind === 'unavailable' ? { kind: 'unavailable', reason: command.reason } : {
    kind: 'available', cwd: command.cwd, configPath: command.configPath, sourceIdentity: command.sourceIdentity,
    sourceFiles: prepared.sourceFiles, configurationIdentity: command.configurationIdentity,
    argv: command.argv, selection: command.selection, support: command.support,
    environmentNames: Object.keys(command.environment).sort(),
  });
}
