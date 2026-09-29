import { aggregateCommandResults, parseCucumberReportedCommand } from 'ramify-audit';
import type { ScenarioCheckResult, ScenarioCheckSummary } from '../../../src/checks/records.js';

/** One host-run profile. The producer alone decodes and judges its Cucumber messages. */
export interface ReportedScenarioCommand {
  readonly name: string;
  readonly rawMessages: string | null;
  readonly exitCode: number | null;
  readonly output: string;
  readonly durationSeconds: number;
  readonly outputIncomplete: boolean;
}

/** Harness association of producer final identities with frozen scenario records. */
export async function scenarioReport(input: {
  readonly commands: readonly ReportedScenarioCommand[];
  readonly projectRoot: string;
  readonly tracked: readonly { readonly id: string; readonly file: string }[];
  readonly scenarioIdOfTag: (tag: string) => string | null;
  readonly selection: ScenarioCheckSummary['selection'];
  readonly dryRun: boolean;
  readonly restore: (text: string) => string;
}): Promise<{ readonly scenarios: ScenarioCheckResult[]; readonly untracked: ScenarioCheckSummary['untracked']; readonly failures: string[]; readonly excluded: number; readonly provider: unknown }> {
  const parsed = await Promise.all(input.commands.map(async command => ({
    name: command.name,
    result: await parseCucumberReportedCommand({
      rawMessages: command.rawMessages ?? undefined,
      workingDirectory: input.projectRoot,
      exitCode: command.exitCode,
      output: command.output,
      durationSeconds: command.durationSeconds,
      outputIncomplete: command.outputIncomplete,
    }),
  })));
  const provider = aggregateCommandResults(parsed);
  const tracked = new Map(input.tracked.map(scenario => [scenario.id, normalize(scenario.file)]));
  const scenarios: ScenarioCheckResult[] = [];
  const untracked = { passed: 0, skipped: 0, failed: 0 };
  const failures: string[] = [];
  const seen = new Set<string>();
  for (const { name, result } of parsed) {
    const before = failures.length;
    const evidence = result.cucumberMessages;
    if (evidence?.status !== 'read' || evidence.run === undefined) {
      if (!result.passed && input.commands.find(command => command.name === name)?.exitCode === 0) {
        failures.push(`${name}: ${result.runnerError?.message ?? result.summary ?? 'Cucumber did not pass'}`);
      }
      continue;
    }
    for (const scenario of evidence.run.scenarios) {
      const id = scenario.tags.map(input.scenarioIdOfTag).find(candidate => candidate !== null);
      if (id === undefined || id === null || tracked.get(id) !== normalize(scenario.uri)) {
        untracked[scenario.outcome] += 1;
        continue;
      }
      seen.add(id);
      const failedStep = scenario.steps.find(step => step.status !== 'PASSED' && step.status !== 'SKIPPED');
      const binding = scenario.steps.flatMap(step => step.definitionLocations.map(location => ({
        step: step.text,
        definition: `${location.uri}${location.line === undefined ? '' : `:${location.line}`}`,
      })));
      const undefinedSteps = scenario.steps.filter(step => step.status === 'UNDEFINED').map(step => step.text);
      const exceptional = scenario.steps.find(step => ['UNDEFINED', 'PENDING', 'AMBIGUOUS'].includes(step.status));
      const status = exceptional === undefined ? scenario.outcome : exceptional.status.toLowerCase() as ScenarioCheckResult['status'];
      scenarios.push({
        id,
        status,
        file: scenario.uri,
        line: scenario.line,
        run: name,
        binding,
        undefined: undefinedSteps,
        ...(failedStep === undefined ? {} : { failure: { step: failedStep.text, message: input.restore(failedStep.errorMessage ?? scenario.message ?? failedStep.status) } }),
      });
      if (status !== 'passed' && (status !== 'skipped' || !input.dryRun)) {
        const detail = status === 'undefined' && undefinedSteps.length > 0
          ? `no step definition matches ${undefinedSteps.map(text => `"${text}"`).join(', ')}`
          : `${failedStep?.text ?? scenario.name}: ${firstLine(failedStep?.errorMessage ?? scenario.message ?? status)}`;
        failures.push(`${id} ${status}: ${detail}`);
      }
    }
    if (!result.passed && failures.length === before && input.commands.find(command => command.name === name)?.exitCode === 0) {
      failures.push(`${name}: ${result.summary ?? 'Cucumber did not pass'}`);
    }
  }
  if (input.selection.kind === 'identity') {
    for (const id of input.selection.scenarios) if (!seen.has(id)) failures.push(`${id} was selected but no final scenario result was reported`);
  }
  if (untracked.failed > 0 || (!input.dryRun && untracked.skipped > 0)) {
    failures.push(`The project's own scenarios: ${untracked.passed} passed, ${untracked.skipped} skipped, ${untracked.failed} failed`);
  }
  const selectedIds = input.selection.kind === 'identity' ? input.selection.scenarios : null;
  const excluded = selectedIds !== null
    ? input.tracked.filter(scenario => !selectedIds.includes(scenario.id)).length
    : input.selection.kind === 'all-untagged' ? input.tracked.filter(scenario => !seen.has(scenario.id)).length : 0;
  return { scenarios, untracked, failures, excluded, provider };
}

function normalize(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function firstLine(text: string): string {
  return text.split('\n', 1)[0] ?? '';
}
