import type { GateAttempt } from '../checks/records.js';
import type { CapabilityAssignment, CapabilityPlan, CapabilityRequest, CapabilityTask } from './records.js';

export interface CandidateAcceptance {
  readonly task: CapabilityTask;
  readonly request: CapabilityRequest;
  readonly plan: CapabilityPlan;
  readonly assignments: readonly CapabilityAssignment[];
  /** Directories resolved from the current architect index, never inferred from declared names. */
  readonly ownerDirectories: ReadonlyMap<string, string>;
  readonly outcomes: ReadonlyMap<string, 'accepted' | 'partial' | 'failed' | 'interrupted' | 'active'>;
  readonly gate: GateAttempt;
  readonly tree: string;
  readonly configuration: string;
  readonly review: { readonly tree: string; readonly planRevision: number; readonly outcome: 'passed' | 'failed'; readonly findings: readonly string[] };
}

/** Verify recorded execution and identities; semantic adequacy comes from the
 * independent reviewer. A fake suite cannot stand in for a selected real
 * provider or consumer suite. */
export function candidateAcceptanceFindings(input: CandidateAcceptance): string[] {
  const { task, request, plan, assignments, ownerDirectories, outcomes, gate, tree, configuration, review } = input;
  const findings: string[] = [];
  if (task.request !== request.id || plan.task !== task.id) findings.push('Task, request and plan differ');
  if (gate.verdict !== 'passed' || gate.evidence === null || gate.audited === null) findings.push(`Gate ${gate.id} did not pass with audited evidence`);
  if (review.tree !== tree || review.planRevision !== plan.revision || review.outcome !== 'passed' || review.findings.length > 0) {
    findings.push(`Review of plan ${plan.revision} and tree ${tree} is not clear: ${review.findings.join('; ')}`);
  }
  if (assignments.length === 0) findings.push('No implementation assignment was recorded');
  for (const assignment of assignments) {
    if (assignment.task !== task.id || assignment.plan.revision > plan.revision) findings.push(`Assignment ${assignment.id} names another task or future plan`);
    if (outcomes.get(assignment.id) !== 'partial' && outcomes.get(assignment.id) !== 'accepted') findings.push(`Assignment ${assignment.id} lacks a submitted scoped result`);
  }
  const executed = gate.commands.filter(command => command.kind === 'tests' && command.outcome === 'passed');
  const selected = new Set(executed.flatMap(command => command.selection?.resolved ?? []));
  const testsFor = (owner: string) => {
    const directory = ownerDirectories.get(owner);
    return directory === undefined ? [] : [...selected].filter(path => path.startsWith(`${directory === '' ? '' : `${directory}/`}src/tests/`));
  };
  if (testsFor(task.provider).length === 0) findings.push(`Real provider ${task.provider} has no executed selected test`);
  if (testsFor(task.consumer).length === 0) findings.push(`Real consumer ${task.consumer} has no executed selected test`);
  for (const kind of ['type-check', 'ramify-check'] as const) {
    if (!gate.commands.some(command => command.kind === kind && command.outcome === 'passed')) findings.push(`${kind} did not pass`);
  }
  for (const example of request.original.examples) {
    const useCase = plan.useCases.find(item => item.id === example.id);
    if (useCase === undefined || useCase.coverage.state === 'unresolved') { findings.push(`Example ${example.id} is unresolved`); continue; }
    const coverage = useCase.coverage;
    if (coverage.tests.length === 0) findings.push(`Example ${example.id} has no executed test association`);
    if (coverage.candidate !== tree || coverage.configuration !== configuration) findings.push(`Example ${example.id} cites stale source or configuration`);
    for (const test of coverage.tests) if (!selected.has(test)) findings.push(`Example ${example.id} cites unexecuted test ${test}`);
    if (coverage.state === 'corrected' && (coverage.evidence.length === 0 || coverage.decidedBy.trim() === '')) findings.push(`Example ${example.id} lacks correction authority`);
  }
  return findings;
}
