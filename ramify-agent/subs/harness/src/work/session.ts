import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { architectViewDirectory, findModule, readApiView, type ApiViewSnapshot, type ArchitectIndex, type SourceArea } from '../../subs/evidence/src/views.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import type { ApiViewEvidence } from '../interfaces/protocol/jobs.js';
import type { RegistryEntry, Hypothesis } from '../analysis/records.js';
import type { PlacementDecision } from '../architecture/records.js';
import type { IterationApiViews } from './engineer.js';
import type { IntegrationBriefing } from './integration.js';
import { architectScenarioSection, type BriefedScenario } from './scenario-briefing.js';
import type { WorkItem, WorkItemOutline } from './records.js';

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
  const views: ApiViewEvidence['views'][number][] = [];
  for (const area of ['src', 'src/tests'] as const satisfies readonly SourceArea[]) {
    const snapshot: ApiViewSnapshot | undefined = await readApiView(projectRoot, entry, area).catch(() => undefined);
    if (!snapshot) continue;
    views.push({ area: snapshot.area, path: snapshot.path, revision: snapshot.revision, coverage: snapshot.coverage });
  }
  if (views.length === 0) return { evidence: null, unavailable: `"${module}" has no source area with an API view` };
  return { evidence: { module, views }, unavailable: null };
}

/**
 * The API views of the modules one implementation session writes, for its
 * briefing: each module's views, or why it has none.
 */
export async function iterationApiViews(
  ramify: RamifyCli,
  projectRoot: string,
  index: ArchitectIndex | null,
  modules: readonly string[],
): Promise<IterationApiViews[]> {
  const entries: IterationApiViews[] = [];
  for (const module of modules) {
    const result = await apiViewsOf(ramify, projectRoot, index, module)
      .catch(error => ({ evidence: null, unavailable: `the API view could not be read: ${error instanceof Error ? error.message : String(error)}` }));
    entries.push({
      module,
      views: result.evidence === null ? [] : result.evidence.views.map(view => ({ area: view.area, path: view.path, coverage: view.coverage })),
      unavailable: result.unavailable,
    });
  }
  return entries;
}

export interface WorkItemBriefing {
  readonly item: WorkItem;
  readonly plan: string;
  readonly onboarding: Onboarding;
  readonly views: ApiViewResult;
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
  } | undefined;
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

/** The first user message of one local architect invocation. */
export function workItemMessage(briefing: WorkItemBriefing): string {
  const { item } = briefing;
  const lines: string[] = [
    `# Work item ${item.id} — ${item.module}`,
    '',
    '## Goal',
    '',
    item.goal,
    '',
    '## What the plan asks',
    '',
    `- Requirement: ${refs(briefing.plan, item.requirementRefs)}`,
    `- Acceptance: ${refs(briefing.plan, item.acceptanceRefs)}`,
    '',
    'Tests that state the acceptance are part of the work.',
    '',
    ...(briefing.integration === undefined ? [] : integrationSection(briefing.integration)),
    ...architectScenarioSection(briefing.scenarios ?? []),
    '## Your module',
    '',
    `- Declared name: \`${item.module}\`.`,
    briefing.onboarding.purpose === null
      ? `- Onboarding: \`${briefing.onboarding.path}\` gives none: ${briefing.onboarding.missing}. No other module's prose stands in for it.`
      : `- Onboarding (\`${briefing.onboarding.path}\`): ${briefing.onboarding.purpose}`,
  ];

  if (briefing.views.evidence === null) {
    lines.push(`- API view: none was materialized, because ${briefing.views.unavailable}. Absence of a view is not a refusal; say so in your outline if it matters.`);
  } else {
    for (const view of briefing.views.evidence.views) {
      lines.push(`- API view (${view.area}): \`${view.path}/\`, revision \`${view.revision}\`; ${view.coverage === null
        ? 'coverage complete, so absence means unavailable'
        : `coverage limits: ${view.coverage}, so absence is not proof of unavailability`}.`);
    }
  }
  lines.push(`- The architect view is at \`${architectViewDirectory}/\`.`, '');

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
    lines.push('', 'Assign the work that discharges each of these, then request completion again. A requirement closes when a `verification` iteration has replaced its fake and passed; an obligation is discharged when the agreed suite has passed against the real provider; a scenario is implemented when a gate passes it after its declaration, so declare with the request the ones existing step definitions bind, and assign an iteration that writes the step definitions for the others.', '');
  }

  if (briefing.unresolvedRequest !== undefined) {
    const request = briefing.unresolvedRequest;
    lines.push('## Your placement request was not resolved', '');
    lines.push(`\`${request.id}\` came back without a decision. What the global architect established:`);
    for (const finding of request.findings) lines.push(`- Finding: ${finding}`);
    for (const gap of request.gaps) lines.push(`- Gap: ${gap}`);
    lines.push('', 'Nothing was placed and nothing was registered. Decide what to do with the work item on the evidence you have, or answer `unresolved`.', '');
  }

  if (briefing.lastIteration !== undefined) {
    const last = briefing.lastIteration;
    lines.push('## The iteration you last assigned', '');
    lines.push(`\`${last.id}\` ended \`${last.outcome}\`${last.commit === null ? ', with nothing committed' : `, committed as ${last.commit}`}.`);
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
    lines.push('', 'Assign the next iteration, or request completion and let the work item\'s gate answer.', '');
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
    'the lowest common ancestor of its sub-scenarios\' owners, and every sub-scenario is implemented already.',
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
    lines.push(`- \`${sub.id}\` (${sub.name}), owned by \`${sub.owner}\`, in \`${sub.file}\`.${sub.bridging.length === 0
      ? ''
      : ` Its bridging Given${sub.bridging.length === 1 ? '' : 's'}, stating what another entry leaves instead of taking its action: ${sub.bridging.map(step => `"${step}"`).join(', ')}.`}`);
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
    '`expose-test` declarations along each path so this module receives them, defines no step of its own, and declares',
    `\`${scenario.id}\` in its completion proposal. Its gate runs this module's feature files with the scenario selected by`,
    'identity; a pass implements it, and this work item completes at its own work-item gate.',
    '',
    'When the scenario fails while its sub-scenarios pass, it is a composition failure: a bridging Given assumed what',
    'the real behavior does not do. It is this work item\'s to resolve, through repair, placement and delegation, or `unresolved`.',
    '',
  );
  return lines;
}

function refs(plan: string, list: ReadonlyArray<{ anchor?: string | undefined; lines?: readonly [number, number] | undefined }>): string {
  if (list.length === 0) return 'the plan names none.';
  const planLines = plan.split('\n');
  return list.map(ref => {
    if (ref.anchor !== undefined) return `“${ref.anchor}”`;
    const [from, to] = ref.lines!;
    const excerpt = planLines.slice(from - 1, to).join(' ').replace(/\s+/g, ' ').trim();
    return `lines ${from}–${to} (${excerpt.slice(0, 160)}${excerpt.length > 160 ? '…' : ''})`;
  }).join(', ');
}

function list(values: readonly string[]): string {
  return values.length === 0 ? 'none' : values.map(value => `\`${value}\``).join(', ');
}
