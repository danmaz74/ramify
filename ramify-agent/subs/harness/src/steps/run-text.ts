import type { StepRunProgress, StepRunSummary } from './run.js';

/*
 * The condensed live text of one `step run`: the start with its base and
 * starting tree, each tool call truncated, tool errors, the harness's own
 * text (a guard's refusal, hook findings and other appended text), each
 * submission with its verdict, and a summary naming the records.
 */

const clip = (text: string, limit: number) => (text.length <= limit ? text : `${text.slice(0, limit)}… [${text.length - limit} more characters]`);
const indent = (text: string) => text.split('\n').map(line => `  ${line}`).join('\n');

/**
 * A printer of one step's progress. A refusal is printed once, as the
 * harness's text, and not again as the tool's error; an event with nothing
 * to print gives null.
 */
export function createStepProgressText(): (event: StepRunProgress) => string | null {
  const refused = new Set<string>();
  return event => {
    if (event.type === 'harness-text' && event.kind === 'refusal') refused.add(event.callId);
    if (event.type === 'tool-error' && refused.has(event.callId)) return null;
    return describe(event);
  };
}

function describe(event: StepRunProgress): string {
  switch (event.type) {
    case 'step-started': {
      const start = event.start;
      return [
        `Step: ${event.role}${event.variant === null ? '' : ` ${event.variant}`}, invocation ${event.invocation}, session ${event.session}`,
        `Run: ${event.run}${event.created ? ' (created)' : ''}`,
        `Base: ${event.base === '' ? 'none' : event.base}; ${event.dirty ? `the tree differed from it at start in ${event.startingChanged.length} path(s): ${clip(event.startingChanged.join(', '), 400)}` : 'the tree matched it at start'}.`,
        `Start: ${start.actual}${start.actual === start.requested ? '' : ` (the inputs asked for ${start.requested})`}${start.reason === null ? '' : `, because ${start.reason}`}.`,
        ...(start.provenance === null ? [] : [`Inputs from: ${start.provenance}.`]),
        '──── task message ────',
        clip(event.message, 4000),
        '──────────────────────',
      ].join('\n');
    }
    case 'tool-call':
      return `→ ${event.tool} ${clip(JSON.stringify(event.input), 400)}`;
    case 'tool-error':
      return `✗ ${event.tool}: ${clip(event.text, 600)}`;
    case 'message':
      return `… ${clip(event.text.trim(), 800)}`;
    case 'harness-text':
      return event.kind === 'refusal'
        ? `◆ ${event.tool} refused; the session is told:\n${indent(event.text)}`
        : `◆ Appended to the ${event.tool} result:\n${indent(event.text)}`;
    case 'submission':
      return [
        `◆ Submission:\n${indent(clip(JSON.stringify(event.input, null, 2), 4000))}`,
        event.accepted ? `◆ Accepted; the session is told:\n${indent(event.answer)}` : `◆ Rejected; the session is told:\n${indent(event.answer)}`,
      ].join('\n');
    case 'step-summary':
      return summaryText(event.summary);
  }
}

/** The step's summary as the person reads it. */
export function summaryText(summary: StepRunSummary): string {
  const seconds = Math.round(summary.elapsedMs / 1000);
  const usage = summary.usage;
  const lines = [
    '',
    `Step ended: ${summary.ended} after ${seconds}s${summary.error === undefined ? '' : ` (${summary.error})`}.`,
    summary.submission === null
      ? `Submission: none accepted. Rejected submissions: ${summary.rejectedSubmissions}.`
      : `Submission: ${summary.submissionKind ?? 'accepted'}. Rejected submissions: ${summary.rejectedSubmissions}.`,
    ...(summary.role === 'engineer' ? [
      `Violations still standing: ${summary.standingViolations.length}.`,
      ...summary.standingViolations.map(finding => `  ${finding.file ?? '(no file)'}${finding.line === null ? '' : `:${finding.line}`} ${finding.code}: ${finding.message}`),
    ] : []),
    `Changed paths:${summary.changed.length === 0 ? ' none' : ''}`,
    ...summary.changed.map(path => `  ${path}`),
    ...(summary.outsideScope.length === 0 ? [] : ['Changed outside the write scope:', ...summary.outsideScope.map(path => `  ${path}`)]),
    'unavailable' in usage
      ? `Tokens: unavailable (${usage.unavailable}).`
      : `Tokens: ${usage.input} input, ${usage.output} output, ${usage.cacheRead} cache read, ${usage.cacheWrite} cache write, ${usage.total} total.`,
    `Base: ${summary.base === '' ? 'none' : summary.base}; dirty at start: ${summary.dirty ? 'yes' : 'no'}.`,
    `Session settled: ${summary.settled ? 'yes' : 'no; the project lock is kept'}.`,
    'Records:',
    `  run: ${summary.records.run}`,
    `  inputs: ${summary.records.inputs}`,
    `  invocation: ${summary.records.invocation}`,
    `  outcome: ${summary.records.outcome}`,
    ...(summary.records.submission === null ? [] : [`  submission: ${summary.records.submission}`]),
    `  observations: ${summary.records.observations}`,
    `  transcript: ${summary.records.transcript}`,
    `  summary: ${summary.records.summary}`,
    'Nothing was committed; the tree stays as the session left it.',
  ];
  return lines.join('\n');
}
