import type { Envelope, Pickle, PickleStep, StepDefinition, TestCase, TestStepResult } from '@cucumber/messages';
import { z } from 'zod';
import { scenarioIdOfTag } from './rendering.js';

/*
 * The reducer of one run's message stream: Cucumber's NDJSON, read line by
 * line, into the per-scenario part of the scenario check's summary. A
 * tracked scenario is recognized by its identity tag in the file its record
 * names; every other scenario the run executed is the project's own and is
 * counted. The status of a scenario is the worst of its pickles, each at its
 * last attempt, and the binding is read from the definitions the run matched.
 * Whether the check passes is the caller's: it also weighs exit codes and
 * what the selection asked for.
 */

export const scenarioRunStatusSchema = z.enum(['passed', 'failed', 'undefined', 'pending', 'ambiguous', 'skipped']);
export type ScenarioRunStatus = z.infer<typeof scenarioRunStatusSchema>;

/** One tracked scenario's result in one run. */
export const scenarioRunResultSchema = z.object({
  id: z.string().regex(/^sc-\d{3,}$/),
  status: scenarioRunStatusSchema,
  /** The feature file, as the run named it. */
  file: z.string(),
  /** The line of its `Scenario` keyword. */
  line: z.int().positive(),
  /** Each step with the definition that bound it, `uri:line`; an ambiguous step has one entry per definition. */
  binding: z.array(z.object({ step: z.string(), definition: z.string() }).strict()),
  /** The first step with the scenario's status, for every status but `passed` and `skipped`. */
  failure: z.object({ step: z.string(), message: z.string() }).strict().optional(),
  /** Step texts no definition matched. */
  undefined: z.array(z.string()),
}).strict();
export type ScenarioRunResult = z.infer<typeof scenarioRunResultSchema>;

export const untrackedScenarioCountsSchema = z.object({
  passed: z.int().nonnegative(),
  /**
   * Executed untracked scenarios whose worst step is `skipped`, as every
   * defined scenario of a dry run is. Whether that passes is the caller's:
   * a dry run expects it, an executing run does not.
   */
  skipped: z.int().nonnegative(),
  /** Every other executed untracked scenario: failed, undefined, pending or ambiguous. */
  failed: z.int().nonnegative(),
}).strict();

/** What one run's stream says. */
export const scenarioRunSummarySchema = z.object({
  /** Tracked scenarios the run executed, by ID. */
  scenarios: z.array(scenarioRunResultSchema),
  /** Tracked scenarios the stream holds but the run did not execute, by ID: the tag expression kept them out. */
  excluded: z.array(z.string()),
  untracked: untrackedScenarioCountsSchema,
  /** Whether the stream ends with the run's end, and the success it reported; `null` for a stream cut short. */
  finished: z.object({ success: z.boolean() }).strict().nullable(),
  /** 1-based numbers of lines that are not JSON. A torn last line is one. */
  malformedLines: z.array(z.int().positive()),
}).strict();
export type ScenarioRunSummary = z.infer<typeof scenarioRunSummarySchema>;

/** A tracked scenario as the reducer recognizes it: its ID and the file its record names. */
export interface TrackedScenario {
  readonly id: string;
  readonly file: string;
}

const severity: readonly ScenarioRunStatus[] = ['passed', 'skipped', 'pending', 'undefined', 'ambiguous', 'failed'];

function statusOf(result: TestStepResult): ScenarioRunStatus {
  switch (result.status) {
    case 'PASSED': return 'passed';
    case 'SKIPPED': return 'skipped';
    case 'PENDING': return 'pending';
    case 'UNDEFINED': return 'undefined';
    case 'AMBIGUOUS': return 'ambiguous';
    default: return 'failed';
  }
}

function worse(a: ScenarioRunStatus, b: ScenarioRunStatus): ScenarioRunStatus {
  return severity.indexOf(a) >= severity.indexOf(b) ? a : b;
}

/** One executed pickle at its last attempt. */
interface Execution {
  readonly testCase: TestCase;
  readonly results: Map<string, TestStepResult>;
}

/** Reads one run's stream. Never throws: a line that is not JSON is reported, and the rest is read. */
export function summarizeScenarioRun(stream: string, tracked: readonly TrackedScenario[]): ScenarioRunSummary {
  const envelopes: Envelope[] = [];
  const malformedLines: number[] = [];
  stream.split('\n').forEach((line, index) => {
    if (line.trim() === '') return;
    try {
      envelopes.push(JSON.parse(line) as Envelope);
    } catch {
      malformedLines.push(index + 1);
    }
  });

  const pickles: Pickle[] = [];
  const keywords = new Map<string, { keyword: string; line: number }>();
  const definitions = new Map<string, StepDefinition>();
  const testCases = new Map<string, TestCase>();
  /** Test case started ID to its test case and attempt. */
  const started = new Map<string, { testCase: string; attempt: number }>();
  /** Pickle ID to its last attempt. */
  const executions = new Map<string, Execution & { attempt: number }>();
  let finished: { success: boolean } | null = null;

  for (const envelope of envelopes) {
    if (envelope.gherkinDocument) collectKeywords(envelope.gherkinDocument, keywords);
    if (envelope.pickle) pickles.push(envelope.pickle);
    if (envelope.stepDefinition) definitions.set(envelope.stepDefinition.id, envelope.stepDefinition);
    if (envelope.testCase) testCases.set(envelope.testCase.id, envelope.testCase);
    if (envelope.testCaseStarted) {
      const { id, testCaseId, attempt } = envelope.testCaseStarted;
      started.set(id, { testCase: testCaseId, attempt });
      const testCase = testCases.get(testCaseId);
      const current = testCase ? executions.get(testCase.pickleId) : undefined;
      if (testCase && (!current || current.attempt <= attempt)) {
        executions.set(testCase.pickleId, { testCase, results: new Map(), attempt });
      }
    }
    if (envelope.testStepFinished) {
      const { testCaseStartedId, testStepId, testStepResult } = envelope.testStepFinished;
      const start = started.get(testCaseStartedId);
      const testCase = start ? testCases.get(start.testCase) : undefined;
      const execution = testCase ? executions.get(testCase.pickleId) : undefined;
      if (execution && start && execution.attempt === start.attempt) execution.results.set(testStepId, testStepResult);
    }
    if (envelope.testRunFinished) finished = { success: envelope.testRunFinished.success };
  }

  const trackedFiles = new Map(tracked.map((scenario) => [scenario.id, normalizePath(scenario.file)]));
  const byScenario = new Map<string, { pickles: Pickle[]; executed: Pickle[] }>();
  const untracked = { passed: 0, skipped: 0, failed: 0 };
  for (const pickle of pickles) {
    const id = pickle.tags.map((tag) => scenarioIdOfTag(tag.name)).find((candidate) => candidate !== null) ?? null;
    const isTracked = id !== null && trackedFiles.get(id) === normalizePath(pickle.uri);
    const execution = executions.get(pickle.id);
    if (!isTracked) {
      if (execution) {
        const status = executionStatus(execution);
        if (status === 'passed' || status === 'skipped') untracked[status] += 1;
        else untracked.failed += 1;
      }
      continue;
    }
    const entry = byScenario.get(id) ?? { pickles: [], executed: [] };
    entry.pickles.push(pickle);
    if (execution) entry.executed.push(pickle);
    byScenario.set(id, entry);
  }

  const scenarios: ScenarioRunResult[] = [];
  const excluded: string[] = [];
  for (const [id, entry] of byScenario) {
    if (entry.executed.length === 0) {
      excluded.push(id);
      continue;
    }
    scenarios.push(resultOf(id, entry.executed, executions, definitions, keywords));
  }
  const order = (a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true });
  scenarios.sort((a, b) => order(a.id, b.id));
  excluded.sort(order);
  return { scenarios, excluded, untracked, finished, malformedLines };
}

function executionStatus(execution: Execution): ScenarioRunStatus {
  let status: ScenarioRunStatus = 'passed';
  for (const step of execution.testCase.testSteps) {
    const result = execution.results.get(step.id);
    // A step the stream never finished did not pass.
    status = worse(status, result ? statusOf(result) : 'failed');
  }
  return status;
}

function resultOf(
  id: string,
  executed: readonly Pickle[],
  executions: ReadonlyMap<string, Execution>,
  definitions: ReadonlyMap<string, StepDefinition>,
  keywords: ReadonlyMap<string, { keyword: string; line: number }>,
): ScenarioRunResult {
  let status: ScenarioRunStatus = 'passed';
  const binding: { step: string; definition: string }[] = [];
  const seenBindings = new Set<string>();
  const undefinedSteps: string[] = [];
  let failure: { step: string; message: string; status: ScenarioRunStatus } | undefined;

  for (const pickle of executed) {
    const execution = executions.get(pickle.id)!;
    const steps = new Map(pickle.steps.map((step) => [step.id, step]));
    for (const testStep of execution.testCase.testSteps) {
      const result = execution.results.get(testStep.id);
      const stepStatus: ScenarioRunStatus = result ? statusOf(result) : 'failed';
      status = worse(status, stepStatus);
      const pickleStep = testStep.pickleStepId === undefined ? undefined : steps.get(testStep.pickleStepId);
      const said = pickleStep ? spoken(pickleStep, keywords) : 'a hook';
      for (const definitionId of testStep.stepDefinitionIds ?? []) {
        const definition = definitions.get(definitionId);
        const location = definition ? `${normalizePath(definition.sourceReference.uri ?? '')}:${definition.sourceReference.location?.line ?? 0}` : definitionId;
        const key = `${said}\u0000${location}`;
        if (!seenBindings.has(key)) {
          seenBindings.add(key);
          binding.push({ step: said, definition: location });
        }
      }
      if (pickleStep && stepStatus === 'undefined' && !undefinedSteps.includes(pickleStep.text)) undefinedSteps.push(pickleStep.text);
      if (stepStatus !== 'passed' && stepStatus !== 'skipped' && (!failure || worse(failure.status, stepStatus) !== failure.status)) {
        failure = { step: said, message: messageOf(stepStatus, result), status: stepStatus };
      }
    }
  }

  const first = executed[0]!;
  const scenarioNode = keywords.get(first.astNodeIds[0]!);
  const result: ScenarioRunResult = {
    id,
    status,
    file: normalizePath(first.uri),
    line: scenarioNode?.line ?? 1,
    binding,
    undefined: undefinedSteps,
  };
  return failure && failure.status === status ? { ...result, failure: { step: failure.step, message: failure.message } } : result;
}

function messageOf(status: ScenarioRunStatus, result: TestStepResult | undefined): string {
  const reported = result?.message ?? result?.exception?.message;
  if (reported) return reported;
  switch (status) {
    case 'undefined': return 'No step definition matches this step';
    case 'ambiguous': return 'More than one step definition matches this step';
    case 'pending': return 'The step definition is pending';
    default: return result ? 'The step failed without a message' : 'The stream has no result for this step';
  }
}

/** A pickle step as the scenario says it: the keyword of its source step and the pickle's text. */
function spoken(step: PickleStep, keywords: ReadonlyMap<string, { keyword: string }>): string {
  const keyword = keywords.get(step.astNodeIds[0]!)?.keyword.trim();
  return keyword ? `${keyword} ${step.text}` : step.text;
}

/** The keyword and line of every scenario and step of a document, by AST node ID. */
function collectKeywords(document: NonNullable<Envelope['gherkinDocument']>, keywords: Map<string, { keyword: string; line: number }>): void {
  const visitSteps = (steps: readonly { id: string; keyword: string; location: { line: number } }[]): void => {
    for (const step of steps) keywords.set(step.id, { keyword: step.keyword, line: step.location.line });
  };
  for (const child of document.feature?.children ?? []) {
    const nested = child.rule ? child.rule.children : [child];
    for (const inner of nested) {
      if (inner.background) visitSteps(inner.background.steps);
      if (inner.scenario) {
        keywords.set(inner.scenario.id, { keyword: inner.scenario.keyword, line: inner.scenario.location.line });
        visitSteps(inner.scenario.steps);
      }
    }
  }
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}
