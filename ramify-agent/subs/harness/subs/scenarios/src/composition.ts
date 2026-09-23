import { stepKey, stepsOfSource } from './gherkin.js';
import type { ScenarioRunStatus } from './messages.js';
import type { ScenarioId, ScenarioRecord } from './records.js';

/*
 * Composition failures, architecture §10. An integration scenario is bound
 * by the step definitions its sub-scenarios' owners wrote, so when it fails
 * while every sub-scenario passes, the definitions work one by one and not
 * together: a bridging Given, which states the state another entry's action
 * leaves instead of taking the action, assumed what the real behavior does
 * not do. The suspects are the sub-scenarios with such a Given.
 */

/** A sub-scenario whose bridging Given is suspect, with the Givens that appear in no step of its integration scenario. */
export interface CompositionSuspect {
  readonly scenario: ScenarioId;
  /** Each bridging Given as written, keyword included. */
  readonly givens: readonly string[];
}

/** One integration scenario that failed while its sub-scenarios passed. */
export interface CompositionFailure {
  readonly scenario: ScenarioId;
  /** Its sub-scenarios, every one of which passed in the same check. */
  readonly passed: readonly ScenarioId[];
  /** Sub-scenarios with a bridging Given; empty where none has one. */
  readonly suspects: readonly CompositionSuspect[];
}

/**
 * The bridging Givens of one sub-scenario: its context steps that appear in
 * no step of the integration scenario, compared by kind and text as the
 * verbatim rule compares them.
 */
export function bridgingGivens(integration: ScenarioRecord, sub: ScenarioRecord): string[] {
  const own = new Set(stepsOfSource(integration.source).map(stepKey));
  return stepsOfSource(sub.source)
    .filter((step) => step.kind === 'Context' && !own.has(stepKey(step)))
    .map((step) => `${step.keyword.trim()} ${step.text}`);
}

/**
 * Every composition failure one scenario check shows: an integration
 * scenario whose result is `failed` while each of its sub-scenarios has a
 * `passed` result in the same check. A sub-scenario the check did not run,
 * or one that did not pass, makes it an ordinary failure instead, and so
 * does an integration scenario that is undefined rather than failed.
 */
export function compositionFailures(
  records: readonly ScenarioRecord[],
  results: ReadonlyArray<{ readonly id: string; readonly status: ScenarioRunStatus }>,
): CompositionFailure[] {
  const statuses = new Map(results.map((result) => [result.id, result.status]));
  const byId = new Map(records.map((record) => [record.id, record]));
  const failures: CompositionFailure[] = [];
  for (const integration of records) {
    if (integration.kind !== 'integration' || statuses.get(integration.id) !== 'failed') continue;
    if (integration.subScenarios.length === 0 || !integration.subScenarios.every((id) => statuses.get(id) === 'passed')) continue;
    const suspects = integration.subScenarios.flatMap((id): CompositionSuspect[] => {
      const sub = byId.get(id);
      if (sub === undefined) return [];
      const givens = bridgingGivens(integration, sub);
      return givens.length === 0 ? [] : [{ scenario: id, givens }];
    });
    failures.push({ scenario: integration.id, passed: [...integration.subScenarios], suspects });
  }
  return failures;
}
