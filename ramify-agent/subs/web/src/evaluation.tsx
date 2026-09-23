import type { InvocationEvaluation } from '../../harness/src/interfaces/protocol/runs.js';

/*
 * One invocation's evaluation, as its chapter of the transcript shows it:
 * guarding, hook checks, reads outside the scope, lines and tokens.
 * Unavailable is said, never shown as zero.
 */

function guardingText(evaluation: InvocationEvaluation): string {
  return evaluation.guarding.complete ? 'complete' : 'partial';
}

function hookChecksText(evaluation: InvocationEvaluation): string {
  const { passed, findings, notChecked } = evaluation.hookChecks;
  return `${passed} passed, ${findings} with findings, ${notChecked} not checked`;
}

function excursionsText(evaluation: InvocationEvaluation): string {
  return evaluation.excursions.join(', ') || '—';
}

function linesText(evaluation: InvocationEvaluation): string {
  return evaluation.lines === null ? '—' : `+${evaluation.lines.added} −${evaluation.lines.deleted} (${evaluation.lines.coverage})`;
}

function usageText(evaluation: InvocationEvaluation): string {
  const usage = evaluation.usage;
  return 'unavailable' in usage
    ? `unavailable: ${usage.unavailable}`
    : `in ${usage.input} · cache read ${usage.cacheRead} · cache write ${usage.cacheWrite} · out ${usage.output}`;
}

/** An invocation's evaluation as facts, for a chapter of its session's transcript. */
export function EvaluationFacts({ evaluation }: { readonly evaluation: InvocationEvaluation | null }) {
  if (evaluation === null) return <p className="muted">No evaluation: the invocation's record cannot be read.</p>;
  return (
    <dl className="facts evaluation" aria-label={`Evaluation of ${evaluation.invocation}`}>
      <div>
        <dt>Guarding</dt>
        <dd>
          {guardingText(evaluation)}
          {evaluation.outsideScope.length > 0 && <span className="warn"> · changed outside the write scope: {evaluation.outsideScope.join(', ')}</span>}
        </dd>
      </div>
      <div><dt>Hook checks</dt><dd>{hookChecksText(evaluation)}</dd></div>
      <div><dt>Reads outside the scope</dt><dd>{excursionsText(evaluation)}</dd></div>
      <div><dt>Lines</dt><dd>{linesText(evaluation)}</dd></div>
      <div><dt>Tokens</dt><dd>{usageText(evaluation)}</dd></div>
      {evaluation.gaps.length > 0 && (
        <div><dt>Coverage gaps</dt><dd className="warn">{evaluation.gaps.map(gap => `${gap.kind} (${gap.count})`).join(', ')}</dd></div>
      )}
    </dl>
  );
}
