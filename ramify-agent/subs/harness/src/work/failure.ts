import { z } from 'zod';
import type { JsonSchema } from '../../subs/agent/src/interfaces/port.js';
import { failureCauseSchema, type FailureAnalysis, type Role } from '../interfaces/protocol/runs.js';
import type { TranscriptBody, TranscriptEntry } from '../interfaces/protocol/transcripts.js';
import type { EngineerBounds } from '../run/policy.js';
import type { CallInFlight } from '../run/port-events.js';
import type { InvocationOutcome, LineEventSummary } from '../run/records.js';
import { validateAgainst, type SubmissionValidation } from '../run/submissions.js';
import type { FailureDigest } from './iterations.js';

/*
 * An engineer that ended without a result, as its local architect learns of
 * it: in two layers, both ready before the architect is briefed.
 *
 * The digest is the harness's own, derived from what it already holds: why
 * the session ended, the call in flight and the end of its output, what the
 * session changed, what it said last and where its transcript is. It is
 * bounded as a gate summary is.
 *
 * The analysis is a model's, in a session of its own that reads and writes
 * nothing else: what the engineer was attempting, what it finished, what it
 * was doing when it ended, the cause as one of five judgments and a
 * recommendation. An analysis that fails is unavailable, and the architect
 * is briefed with the digest alone.
 */

/** The analyst's submission tool. */
export const failureAnalysisToolName = 'submit_failure_analysis';

/** What the analyst submits: short, and resting on evidence it names. */
export const failureAnalysisSubmissionSchema = z.object({
  attempting: z.string().min(1).max(800),
  finished: z.string().min(1).max(800),
  whenEnded: z.string().min(1).max(800),
  cause: failureCauseSchema,
  recommendation: z.string().min(1).max(800),
  /** What the account rests on, each a pointer and what it shows: a transcript entry, an output line, a hunk. */
  evidence: z.array(z.string().min(1).max(400)).min(1).max(8),
}).strict();
export type FailureAnalysisSubmission = z.infer<typeof failureAnalysisSubmissionSchema>;

export const failureAnalysisJsonSchema = z.toJSONSchema(failureAnalysisSubmissionSchema) as JsonSchema;

export const failureAnalysisSubmissionDescription = 'End the analysis with your account of the failed session. The harness validates it; an invalid submission is returned with every error and its path, and a valid one ends this invocation.';

export function validateFailureAnalysis(input: unknown): SubmissionValidation<FailureAnalysisSubmission> {
  return validateAgainst(failureAnalysisSubmissionSchema, input);
}

/** How many lines of a command's output the digest keeps, from its end. */
export const digestTailLines = 30;
/** How many changed paths the digest names before it counts the rest. */
const digestPaths = 20;
/** How much of the last message, and of one line of a tail, the digest keeps. */
const lastMessageCharacters = 1_200;
const tailLineCharacters = 300;
/** How many shell outputs the digest names. */
const digestOutputs = 20;

/** One shell call of the failed invocation, as the equipment recorded it. */
export interface DigestShellCall {
  readonly callId: string;
  readonly command: string;
  readonly timeoutMs: number;
  /** The complete output, relative to the run's directory. */
  readonly output: string;
}

/** What the digest is derived from; every part is what the harness already holds. */
export interface DigestInputs {
  readonly invocation: string;
  readonly role: Role;
  readonly ended: InvocationOutcome['ended'];
  readonly interruption: InvocationOutcome['interruption'] | undefined;
  readonly error: string | undefined;
  readonly elapsedMs: number;
  readonly bounds: EngineerBounds;
  /** Every rejection the invocation's observation log holds, in order. */
  readonly rejections: ReadonlyArray<{ readonly target: string; readonly errors: ReadonlyArray<{ readonly path: string; readonly message: string }> }>;
  /** The calls in flight when it ended: when a bound fired, or when the session's outcome arrived. */
  readonly inFlight: readonly CallInFlight[];
  readonly shellCalls: readonly DigestShellCall[];
  /** The complete output of each in-flight shell call, by call, where it could be read. */
  readonly outputs: ReadonlyMap<string, string>;
  /** The invocation's line events; null where none were recorded. */
  readonly lines: LineEventSummary | null;
  /** Paths the tree changes beyond the last accepted commit; null where unknown. */
  readonly uncommitted: number | null;
  readonly lastMessage: string | null;
  /** The session's transcript, relative to the run's directory. */
  readonly transcript: string;
}

/** The digest of one failed engineer invocation. */
export function failureDigest(inputs: DigestInputs): FailureDigest {
  const byCall = new Map(inputs.shellCalls.map(call => [call.callId, call]));
  const rejected = rejectionSummary(inputs.rejections);
  const gaps: string[] = [];
  if (inputs.lines === null) gaps.push('no line events were recorded for the invocation');
  else gaps.push(...inputs.lines.gaps);
  const paths = inputs.lines?.paths ?? [];
  return {
    invocation: inputs.invocation,
    role: inputs.role,
    ended: inputs.ended,
    interruption: inputs.interruption ?? null,
    cause: causeOf(inputs, rejected),
    rejected,
    elapsedMs: inputs.elapsedMs,
    bounds: { ...inputs.bounds },
    inFlight: inputs.inFlight.map(call => {
      const shell = byCall.get(call.callId);
      return {
        tool: call.tool,
        callId: call.callId,
        runningMs: call.runningMs,
        command: shell === undefined ? null : {
          text: shorten(shell.command, 2_000),
          timeoutMs: shell.timeoutMs,
          output: inputs.outputs.has(call.callId) ? shell.output : null,
          tail: tailOf(inputs.outputs.get(call.callId) ?? ''),
        },
      };
    }),
    changes: {
      paths: paths.slice(0, digestPaths).map(path => ({ path: path.path, added: path.added, deleted: path.deleted, binary: path.binary })),
      more: Math.max(0, paths.length - digestPaths),
      uncommitted: inputs.uncommitted,
      gaps,
    },
    lastMessage: inputs.lastMessage === null ? null : shorten(inputs.lastMessage, lastMessageCharacters),
    transcript: inputs.transcript,
    outputs: inputs.shellCalls.slice(-digestOutputs).map(call => call.output),
  };
}

/** The rejections of one invocation, with the last one's reasons. */
function rejectionSummary(rejections: DigestInputs['rejections']): FailureDigest['rejected'] {
  const last = rejections.at(-1);
  if (last === undefined) return null;
  return {
    count: rejections.length,
    target: last.target,
    reasons: last.errors.slice(0, 5).map(error => shorten(`${error.path}: ${error.message}`, 300)),
  };
}

/** Why the invocation ended, in one line. */
function causeOf(inputs: DigestInputs, rejected: FailureDigest['rejected']): string {
  switch (inputs.interruption) {
    case 'idle-timeout': return `The idle bound fired: no port event for ${inputs.bounds.idleMs} ms.`;
    case 'absolute-timeout': return `The absolute bound fired: the invocation ran for ${inputs.bounds.absoluteMs} ms.`;
    case 'provider-error':
    case 'adapter-fault':
    case 'session-lost':
      return `The session failed (${inputs.interruption}): ${shorten(inputs.error ?? 'no error was reported', 600)}`;
    default: break;
  }
  switch (inputs.ended) {
    case 'failed': return `The session failed: ${shorten(inputs.error ?? 'no error was reported', 600)}`;
    case 'invalid-submission':
      return rejected === null
        ? 'Its inputs were rejected until the bound on rejected inputs ended it.'
        : `${rejected.count} of its inputs were rejected, the last to \`${rejected.target}\`, and the bound on rejected inputs ended it.`;
    case 'ended': return 'The session stopped on its own without an accepted submission.';
    case 'stopped': return 'The session was stopped before it submitted.';
    default: return `The invocation ended \`${inputs.ended}\` without a result.`;
  }
}

/** The last lines of a command's output, each shortened. */
function tailOf(output: string): string[] {
  const lines = output.replace(/\n$/u, '').split('\n');
  if (lines.length === 1 && lines[0] === '') return [];
  return lines.slice(-digestTailLines).map(line => shorten(line, tailLineCharacters));
}

function shorten(text: string, characters: number): string {
  return text.length <= characters ? text : `${text.slice(0, characters - 1)}…`;
}

/** A duration as a person reads it: seconds, or minutes and seconds. */
export function duration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}

/** The engineer's role as the briefing names it. */
function roleName(role: Role): string {
  return role === 'contract-engineer' ? 'contract engineer' : role;
}

/**
 * The digest as the lines the local architect reads, and a client shows.
 * Its paths are relative to the run's directory, or beneath `runDirectory`
 * where the reader is given it.
 */
export function digestLines(digest: FailureDigest, runDirectory?: string): string[] {
  const at = (path: string) => (runDirectory === undefined ? path : `${runDirectory}/${path}`);
  const lines: string[] = [
    `- Why it ended: ${digest.cause}`,
    `- The ${roleName(digest.role)}'s invocation \`${digest.invocation}\` ran for ${duration(digest.elapsedMs)}, under a command maximum of ${digest.bounds.commandTimeoutMs} ms, an idle bound of ${digest.bounds.idleMs} ms and an absolute bound of ${digest.bounds.absoluteMs} ms.`,
  ];
  if (digest.rejected !== null) {
    lines.push(`- Rejected inputs: ${digest.rejected.count}; the last, to \`${digest.rejected.target}\`, for: ${digest.rejected.reasons.join('; ') || 'no reason recorded'}.`);
  }
  if (digest.inFlight.length === 0) {
    lines.push('- In flight when it ended: no tool call.');
  } else {
    for (const call of digest.inFlight) {
      if (call.command === null) {
        lines.push(`- In flight when it ended: \`${call.tool}\`, running for ${duration(call.runningMs)}.`);
        continue;
      }
      lines.push(`- In flight when it ended: \`${call.tool}\` running \`${call.command.text}\` for ${duration(call.runningMs)} of its ${call.command.timeoutMs} ms timeout.`);
      if (call.command.tail.length > 0) {
        lines.push(`  The last ${call.command.tail.length} lines of its output (\`${at(call.command.output ?? '')}\`):`, '', '  ```', ...call.command.tail.map(line => `  ${line}`), '  ```', '');
      } else {
        lines.push(`  Its output was empty${call.command.output === null ? ' or could not be read' : ''}.`);
      }
    }
  }
  const changes = digest.changes;
  if (changes.paths.length === 0) {
    lines.push('- What it changed: no path, by its line events.');
  } else {
    lines.push(`- What it changed: ${changes.paths.map(path => `\`${path.path}\` (${path.binary ? 'binary' : `+${path.added} −${path.deleted}`})`).join(', ')}${changes.more === 0 ? '' : `, and ${changes.more} more`}.`);
  }
  lines.push(changes.uncommitted === null
    ? '- Whether work is uncommitted in the tree: unknown.'
    : changes.uncommitted === 0
      ? '- Nothing is uncommitted in the tree.'
      : `- Uncommitted in the tree: ${changes.uncommitted} changed path${changes.uncommitted === 1 ? '' : 's'} beyond the last accepted commit, this session's and any earlier one's. A fresh iteration starts from that tree.`);
  if (changes.gaps.length > 0) lines.push(`- Gaps in these counts: ${changes.gaps.join('; ')}.`);
  lines.push(digest.lastMessage === null
    ? '- What it said last: nothing; it wrote no text.'
    : `- What it said last: “${digest.lastMessage.replace(/\s+/gu, ' ')}”`);
  lines.push(`- The transcript: \`${at(digest.transcript)}\`${digest.outputs.length === 0 ? '' : `; its shell outputs: ${digest.outputs.map(output => `\`${at(output)}\``).join(', ')}`}.`);
  return lines;
}

/** What each judged cause is called in the briefing. */
const causeNames: Readonly<Record<FailureAnalysisSubmission['cause'], string>> = {
  'bound-too-tight': 'the bound was too tight for the work',
  'environment-problem': 'a problem in the environment',
  'work-problem': 'a problem in the work itself',
  'agent-behavior': 'the agent\'s own behavior',
  unknown: 'unknown',
};

/** The analysis as the lines the local architect reads. */
export function analysisLines(analysis: FailureAnalysis): string[] {
  if (analysis.outcome === 'unavailable') {
    return [`The failure analysis is unavailable${analysis.invocation === null ? '' : ` (\`${analysis.invocation}\`)`}: ${analysis.reason}. Decide on the digest above.`];
  }
  return [
    `- Attempting: ${analysis.attempting}`,
    `- Finished: ${analysis.finished}`,
    `- When it ended: ${analysis.whenEnded}`,
    `- The cause, as the analyst judges it: ${causeNames[analysis.cause]} (\`${analysis.cause}\`).`,
    `- Recommendation: ${analysis.recommendation}`,
    `- Evidence: ${analysis.evidence.join('; ')}`,
  ];
}

/** The bound a digest says ended the session, where one did. */
export function boundOf(digest: FailureDigest): 'idleMs' | 'absoluteMs' | null {
  if (digest.interruption === 'idle-timeout') return 'idleMs';
  if (digest.interruption === 'absolute-timeout') return 'absoluteMs';
  return null;
}

/** What the analyst's working directory holds, as its message lists it. */
export interface AnalysisEvidence {
  /** The working directory, absolute. */
  readonly directory: string;
  /** Files beneath it, relative, each with what it is. */
  readonly files: ReadonlyArray<{ readonly path: string; readonly holds: string }>;
  /** What could not be written into it, and why. */
  readonly missing: readonly string[];
}

/** The analyst's first message: the iteration, the digest, and where the evidence is. */
export function failureAnalysisMessage(request: {
  readonly iteration: string;
  readonly goal: string;
  readonly projectRoot: string;
  /** The run's directory, which the digest's paths are relative to. */
  readonly runDirectory: string;
  readonly digest: FailureDigest;
  readonly evidence: AnalysisEvidence;
}): string {
  const { digest, evidence } = request;
  return [
    `# The ${roleName(digest.role)} of ${request.iteration} ended without a result`,
    '',
    '## Its goal',
    '',
    request.goal,
    '',
    '## What the harness already derived',
    '',
    ...digestLines(digest, request.runDirectory),
    '',
    '## The evidence',
    '',
    `Your working directory is \`${evidence.directory}\`. It holds:`,
    '',
    ...evidence.files.map(file => `- \`${file.path}\`: ${file.holds}`),
    ...(evidence.missing.length === 0 ? [] : ['', 'What it could not be given:', ...evidence.missing.map(entry => `- ${entry}`)]),
    '',
    `The project is at \`${request.projectRoot}\`, with the engineer's uncommitted work in it. Read a file there by its absolute path where the patch does not show it, such as a file the engineer created.`,
    '',
    'Read, then submit your account.',
  ].join('\n');
}

/** How much of the rendered transcript the analyst is given: its start, and its end. */
const transcriptHeadCharacters = 40_000;
const transcriptTailCharacters = 260_000;
/** How much of one body the rendering keeps. */
const bodyCharacters = 6_000;

/**
 * One invocation's transcript entries as text the analyst reads: the prompt,
 * every message, every call with its input and every result, the harness's
 * decisions and the end. Bodies are shortened, and a long rendering keeps its
 * start and its end, where the failure is.
 */
export async function renderTranscript(
  entries: readonly TranscriptEntry[],
  invocation: string,
  body: (body: TranscriptBody) => Promise<string | null>,
): Promise<string> {
  const out: string[] = [];
  const text = async (value: TranscriptBody) => shorten((await body(value)) ?? '(the body can no longer be read)', bodyCharacters);
  for (const entry of entries) {
    if (entry.invocation !== invocation) continue;
    switch (entry.type) {
      case 'started':
        out.push(`## ${entry.n} started (${entry.at}): ${entry.role}, ${entry.start}, requested ${entry.requested}`, '', '### Prompt', '', await text(entry.prompt), '');
        break;
      case 'message':
        if (entry.role === 'user') {
          for (const block of entry.blocks) out.push(`## ${entry.n} user (${entry.at})`, '', block.type === 'text' ? await text(block.body) : `(${block.kind}: ${block.description})`, '');
        } else if (entry.role === 'assistant') {
          out.push(`## ${entry.n} assistant (${entry.at})${entry.detail.stopReason === null ? '' : `, stopped: ${entry.detail.stopReason}`}${entry.detail.error === null ? '' : `, error: ${entry.detail.error}`}`, '');
          for (const block of entry.blocks) {
            if (block.type === 'text') out.push(await text(block.body), '');
            else if (block.type === 'thinking') out.push(`(thinking, ${block.visibility}) ${await text(block.body)}`, '');
            else if (block.type === 'tool-call') out.push(`→ call ${block.callId} \`${block.tool}\`: ${await text(block.input)}`, '');
            else out.push(`(${block.kind}: ${block.description})`, '');
          }
        } else {
          out.push(`## ${entry.n} result of ${entry.callId} \`${entry.tool}\`${entry.isError ? ' (error)' : ''} (${entry.at})`, '');
          for (const block of entry.blocks) out.push(block.type === 'text' ? await text(block.body) : `(${block.kind}: ${block.description})`, '');
          if (entry.output !== null && entry.output.stored === 'file') out.push(`Complete output: \`${entry.output.path}\``, '');
        }
        break;
      case 'harness':
        out.push(`## ${entry.n} harness (${entry.at}): ${entry.decision.kind}`, '');
        break;
      case 'retry':
        out.push(`## ${entry.n} retry ${entry.phase} (${entry.at})${entry.errorText === null ? '' : `: ${entry.errorText}`}`, '');
        break;
      case 'compaction':
        out.push(`## ${entry.n} compaction ${entry.phase} (${entry.at})`, '');
        break;
      case 'ended':
        out.push(`## ${entry.n} ended (${entry.at}): ${entry.ended}${entry.interruption === null ? '' : `, ${entry.interruption}`}${entry.error === null ? '' : `: ${entry.error}`}`, '');
        break;
      default:
        break;
    }
  }
  const rendered = out.join('\n');
  if (rendered.length <= transcriptHeadCharacters + transcriptTailCharacters) return rendered;
  const omitted = rendered.length - transcriptHeadCharacters - transcriptTailCharacters;
  return `${rendered.slice(0, transcriptHeadCharacters)}\n\n… ${omitted} characters of the middle are left out …\n\n${rendered.slice(-transcriptTailCharacters)}`;
}

