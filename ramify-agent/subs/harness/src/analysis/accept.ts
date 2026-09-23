import type { RecordRef as CommitRecord } from '../jobs/commit.js';
import { isTestingModule, type ArchitectIndex } from '../../subs/evidence/src/views.js';
import { entryAssignmentsSchema, type EntryAssignments, type RunRecord } from '../run/records.js';
import { runLayout } from '../run/records.js';
import { workItemId, workItemSchema, workLayout, type WorkItem } from '../work/records.js';
import type { PlanScenario } from '../../subs/scenarios/src/extraction.js';
import { assignScenarioIds, scenarioRecordSchema, type ScenarioModule, type ScenarioRecord } from '../../subs/scenarios/src/records.js';
import {
  analysisLayout, hypothesisSchema, registryEntrySchema, scenarioWarningSchema,
  type Hypothesis, type RecordedScenarioWarning, type RegistryEntry,
} from './records.js';
import { scenarioFormOf, type InitialAnalysisSubmission } from './submission.js';

/*
 * What one accepted initial analysis commits, in the single
 * `analysis-accepted` transition: the entry assignments, every hypothesis at
 * revision 1, one registry entry per entry capability, one work item per
 * entry capability, and one scenario record per scenario, entry scenarios
 * first and integration scenarios after them. From here on a scenario's text
 * is frozen.
 *
 * One work item per entry capability, always. Two related capabilities in one
 * module get two work items; there is no grouping field and no judgment.
 *
 * A hypothesis creates nothing. It is committed beside the rest and no work
 * item, registry entry or completion requirement is derived from one.
 */

export interface AcceptedAnalysis {
  readonly entries: EntryAssignments;
  readonly hypotheses: readonly Hypothesis[];
  readonly registry: readonly RegistryEntry[];
  readonly workItems: readonly WorkItem[];
  /** `sc-001`, … every one `pending`. */
  readonly scenarios: readonly ScenarioRecord[];
  /** The form rules' warnings, by scenario ID, which the event records. */
  readonly warnings: readonly RecordedScenarioWarning[];
  /** Every record body the transition carries, with where each is materialized. */
  readonly records: readonly CommitRecord[];
}

/** What acceptance reads beyond the submission. */
export interface AnalysisAcceptanceContext {
  readonly invocation: string;
  readonly view: RunRecord['manifest']['architectView'];
  readonly planId: string;
  /** The plan scenarios captured with the plan. */
  readonly planScenarios: readonly PlanScenario[];
  /** The architect view the submission was validated against, or null where the run has none. */
  readonly index: ArchitectIndex | null;
}

/**
 * Derives every record of the phase from one validated submission. It is a
 * pure function of the submission, the run's view, its captured plan
 * scenarios and the invocation that produced it, so a repeat after a crash
 * derives the same records with the same IDs.
 */
export function acceptAnalysis(submission: InitialAnalysisSubmission, context: AnalysisAcceptanceContext): AcceptedAnalysis {
  const entries = entryAssignmentsSchema.parse({
    schema: 'ramify-agent.entry-assignments/1',
    view: context.view,
    entries: submission.entries,
  } satisfies EntryAssignments);

  const hypotheses = submission.hypotheses.map(hypothesis => hypothesisSchema.parse({
    schema: 'ramify-agent.hypothesis/1',
    revision: 1,
    standing: 'tentative',
    ...hypothesis,
    cause: { initial: context.invocation },
  } satisfies Hypothesis));

  const registry = submission.entries.map(entry => registryEntrySchema.parse({
    schema: 'ramify-agent.capability/1',
    capability: entry.capability,
    revision: 1,
    behavior: entry.description,
    owner: entry.owner,
    ...(entry.proposed === undefined ? {} : { proposed: entry.proposed }),
    origin: 'entry',
    decision: null,
    consumers: [],
  } satisfies RegistryEntry));

  const workItems = submission.entries.map((entry, index) => workItemSchema.parse({
    schema: 'ramify-agent.work-item/1',
    id: workItemId(index + 1),
    module: entry.owner,
    origin: { entry: entry.capability },
    goal: entry.description,
    requirementRefs: entry.requirementRefs,
    acceptanceRefs: entry.acceptanceRefs,
    startedFor: null,
  } satisfies WorkItem));

  // The validation that accepted the submission applied the same rules, so
  // a rejection here is the harness disagreeing with itself.
  const form = scenarioFormOf(submission, { index: context.index, planScenarios: context.planScenarios });
  if (!form.ok) throw new Error(`An accepted analysis breaks a scenario form rule: ${form.message}`);
  const assigned = assignScenarioIds(form.form, {
    planId: context.planId,
    entries: submission.entries.map(entry => ({ capability: entry.capability, owner: entry.owner })),
    modules: scenarioModulesOf(submission, context.index),
  });
  const scenarios = assigned.records.map(record => scenarioRecordSchema.parse(record));
  const warnings = form.warnings.map(warning => scenarioWarningSchema.parse({
    kind: warning.kind,
    scenarios: warning.scenarios.map(key => assigned.idsByKey.get(key)!),
    message: warning.message,
  } satisfies RecordedScenarioWarning));

  const records: CommitRecord[] = [
    { path: runLayout.entries, id: 'entries', revision: 1, body: entries },
    ...hypotheses.map(hypothesis => ({
      path: analysisLayout.hypothesis(hypothesis.id, 1), id: hypothesis.id, revision: 1, body: hypothesis,
    })),
    ...registry.map(entry => ({
      path: analysisLayout.registry(entry.capability, 1), id: entry.capability, revision: 1, body: entry,
    })),
    ...workItems.map(item => ({ path: workLayout.item(item.id), id: item.id, revision: 1, body: item })),
    ...scenarios.map(scenario => ({ path: runLayout.scenario(scenario.id), id: scenario.id, revision: 1, body: scenario })),
  ];

  return { entries, hypotheses, registry, workItems, scenarios, warnings, records };
}

/**
 * Every module a scenario's owner or common ancestor can be: the view's
 * modules, and the modules the entries propose. Where the run has no view,
 * each owner and its ancestors are placed by Ramify's layout, a child of
 * `a` declared `b` in `subs/b`, and none is a testing module.
 */
function scenarioModulesOf(submission: InitialAnalysisSubmission, index: ArchitectIndex | null): ScenarioModule[] {
  const modules = new Map<string, ScenarioModule>();
  for (const entry of index?.modules.values() ?? []) {
    modules.set(entry.module, { module: entry.module, dir: entry.dir, testing: isTestingModule(entry) });
  }
  for (const entry of submission.entries) {
    if (entry.proposed === undefined || modules.has(entry.owner)) continue;
    modules.set(entry.owner, {
      module: entry.owner,
      dir: entry.proposed.directory.replace(/\/+$/, ''),
      testing: entry.proposed.tags.includes('testing'),
    });
  }
  for (const entry of submission.entries) {
    const path = entry.owner.split('/');
    for (let length = 1; length <= path.length; length += 1) {
      const module = path.slice(0, length).join('/');
      if (modules.has(module)) continue;
      modules.set(module, { module, dir: path.slice(1, length).map(name => `subs/${name}`).join('/'), testing: false });
    }
  }
  return [...modules.values()];
}
