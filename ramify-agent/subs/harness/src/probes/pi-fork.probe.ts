/*
 * Development probe, never a test (Plan 12 iteration 4): a real pi fork from
 * a pinned point, confined to an audited candidate snapshot. It calls a
 * model twice, one short turn each, and costs tokens, so it is run by hand
 * and never by Vitest (its name does not match the suite's pattern).
 *
 *   npx tsx subs/harness/src/probes/pi-fork.probe.ts [--model openai-codex/gpt-5.6-luna]
 *
 * What it does, in a disposable Git repository:
 *
 * 1. commits a base and an audited candidate (`store.ts` at "v1"), then
 *    changes the live tree to "v3" without committing, as a later writer
 *    would;
 * 2. runs a parent session, standing for the local architect, in the
 *    project directory with pi's read tools, told a codeword; its end ref is
 *    the pinned point;
 * 3. appends a later "turn" to the parent without a model call, naming
 *    another codeword, so the parent's history moves past the point;
 * 4. forks the pinned point as a reviewer: a directory of its own, no
 *    built-in tool, the harness's four snapshot tools over the candidate,
 *    and a submission; the model is asked for the codeword it holds, the
 *    first line of `store.ts` through the snapshot, and to try pi's `read`
 *    on the live file;
 * 5. starts a fork from a point that does not exist and stops it before any
 *    model call, to record the degraded start.
 *
 * It prints one JSON report: the actual start modes, what the snapshot tools
 * answered and refused, what the model submitted, and evidence read from
 * the fork's own session file, which does not depend on the model's answer.
 * Exit status 0 when the probe ran, 2 when it could not (no pi login).
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { AgentEvent, ContextPolicy, SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { createPiAgent, piReadiness } from '../../subs/agent/subs/pi/src/pi-agent.js';
import { gitCandidateSource } from '../../subs/evidence/src/git.js';
import { openCandidateSnapshot, snapshotTools } from '../reviews/snapshot.js';

const run = promisify(execFile);

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const context: ContextPolicy = { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 };
const boundMs = 180_000;

async function git(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd: root, env: { ...process.env, GIT_AUTHOR_NAME: 'probe', GIT_AUTHOR_EMAIL: 'probe@example.com', GIT_COMMITTER_NAME: 'probe', GIT_COMMITTER_EMAIL: 'probe@example.com' } });
  return stdout.trim();
}

/** A session's outcome, or `timed-out` after the bound, when the session is stopped. */
async function bounded<T>(outcome: Promise<T>, stop: () => Promise<void>): Promise<T | 'timed-out'> {
  let timer: NodeJS.Timeout | undefined;
  const result = await Promise.race([outcome, new Promise<'timed-out'>(resolve => { timer = setTimeout(() => resolve('timed-out'), boundMs); })]);
  clearTimeout(timer);
  if (result === 'timed-out') await stop();
  return result;
}

/** The usage each assistant message reported, and its model. */
const usageOf = (events: readonly AgentEvent[]) => events.flatMap(event => (
  event.type === 'message' && event.role === 'assistant' ? [{ usage: event.usage, model: event.detail.model }] : []));

async function main(): Promise<number> {
  const model = option('--model') ?? 'openai-codex/gpt-5.6-luna';
  const readiness = await piReadiness({ model });
  if (!readiness.ready) {
    console.log(JSON.stringify({ probe: 'pi-fork', ran: false, gap: `pi cannot run ${model}: ${readiness.reason}` }, null, 2));
    return 2;
  }
  const scratch = await mkdtemp(join(tmpdir(), 'ramify-agent-pi-fork-probe-'));
  try {
    // The project: a base, an audited candidate, and a live tree that moved on.
    const root = join(scratch, 'project');
    await mkdir(root);
    await git(root, 'init', '-q', '-b', 'main');
    await writeFile(join(root, 'README.md'), 'A probe project.\n');
    await git(root, 'add', '.');
    await git(root, 'commit', '-q', '-m', 'base');
    const base = await git(root, 'rev-parse', 'HEAD');
    await writeFile(join(root, 'store.ts'), 'export const store = new Map(); // v1 audited\n');
    await git(root, 'add', '.');
    await git(root, 'commit', '-q', '-m', 'candidate');
    const candidate = await git(root, 'rev-parse', 'HEAD');
    await writeFile(join(root, 'store.ts'), 'export const store = new Map(); // v3 live\n');

    const agent = createPiAgent({ model });
    const parentEvents: AgentEvent[] = [];
    const parentSpec: SessionSpec = {
      role: 'local-architect',
      scope: { workingDirectory: root },
      systemPrompt: 'You are a planning assistant in a probe. Answer in one short sentence.',
      prompt: 'Remember this codeword for later: ALPHA-7. Reply with the single word "noted".',
      session: { mode: 'fresh' },
      context,
      builtinTools: ['read', 'ls'],
      tools: [],
      submission: {
        name: 'submit_note',
        description: 'Not needed in this turn.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: true },
        accept: async () => ({ accepted: true }),
      },
      sessionDirectory: join(scratch, 'parent-session'),
      onEvent: event => parentEvents.push(event),
    };
    await mkdir(parentSpec.sessionDirectory, { recursive: true });
    const parent = agent.startSession(parentSpec);
    const parentOutcome = await bounded(parent.outcome, () => parent.stop());
    const pinned = parent.ref;

    // The parent's history moves past the point, without a model call.
    const appended = await agent.appendContext(pinned, 'probe-later-turn', 'Correction from a later turn: the codeword is now OMEGA-9.');

    // The reviewer's fork of the pinned point, confined to the candidate.
    const snapshot = await openCandidateSnapshot(gitCandidateSource, root, { commit: candidate, base });
    const tools = snapshotTools(snapshot, gitCandidateSource, root);
    const forkEvents: AgentEvent[] = [];
    let submitted: unknown;
    const reviewerDirectory = join(scratch, 'reviewer', 'workspace');
    const forkSpec: SessionSpec = {
      role: 'reviewer',
      scope: { workingDirectory: reviewerDirectory },
      systemPrompt: 'You are a reviewer in a probe. Use only the tools you are given and follow the steps exactly.',
      prompt: [
        'Do exactly this, then stop:',
        '1. Call snapshot_read with {"path": "store.ts"}.',
        `2. Call read with {"path": "${join(root, 'store.ts')}"}; it may not exist for you.`,
        '3. Call submit_probe with: codeword = the codeword you were told earlier in this conversation (or "none");',
        '   storeLine = line 1 of store.ts exactly as snapshot_read returned it, without the line number;',
        '   liveReadWorked = whether step 2 returned the file.',
      ].join('\n'),
      session: { mode: 'fork', from: pinned },
      context,
      builtinTools: [],
      tools: [...tools.definitions],
      submission: {
        name: 'submit_probe',
        description: 'The probe\'s answer.',
        inputSchema: {
          type: 'object',
          properties: { codeword: { type: 'string' }, storeLine: { type: 'string' }, liveReadWorked: { type: 'boolean' } },
          required: ['codeword', 'storeLine', 'liveReadWorked'],
          additionalProperties: false,
        },
        accept: async input => { submitted = input; return { accepted: true }; },
      },
      sessionDirectory: join(scratch, 'reviewer', 'session'),
      onEvent: event => forkEvents.push(event),
    };
    await mkdir(forkSpec.scope.workingDirectory, { recursive: true });
    await mkdir(forkSpec.sessionDirectory, { recursive: true });
    const fork = agent.startSession(forkSpec);
    const forkStart = fork.start;
    const forkOutcome = await bounded(fork.outcome, () => fork.stop());

    // Evidence from the fork's own session file.
    const forkFile = fork.ref.slice(0, fork.ref.lastIndexOf('#'));
    const forkLines = (await readFile(forkFile, 'utf8')).split('\n').filter(line => line !== '');
    const header = JSON.parse(forkLines[0]!) as { cwd?: string; parentSession?: string };
    const forkText = forkLines.join('\n');

    // A fork from a point that does not exist, stopped before any model call.
    const missing = agent.startSession({ ...forkSpec, session: { mode: 'fork', from: join(scratch, 'missing.jsonl#nowhere') }, sessionDirectory: join(scratch, 'missing-session'), onEvent: () => undefined });
    const missingStart = missing.start;
    await missing.stop();
    await missing.outcome;

    const report = {
      probe: 'pi-fork',
      ran: true,
      model: readiness.model,
      parent: {
        outcome: parentOutcome === 'timed-out' ? 'timed-out' : parentOutcome.kind,
        start: parent.start,
        usage: usageOf(parentEvents),
      },
      laterTurnAppend: appended.outcome,
      fork: {
        requested: 'fork',
        actualStart: forkStart,
        outcome: forkOutcome === 'timed-out' ? 'timed-out' : forkOutcome.kind,
        submitted,
        toolCalls: forkEvents.flatMap(event => (event.type === 'tool-finished' ? [{ tool: event.tool, isError: event.isError, errorText: event.errorText ?? null }] : [])),
        snapshot: { inspected: [...tools.inspected()], denials: tools.denials() },
        usage: usageOf(forkEvents),
        sessionFile: {
          headerCwd: header.cwd ?? null,
          headerCwdIsReviewerDirectory: header.cwd === reviewerDirectory,
          headerCwdIsProject: header.cwd === root,
          parentSessionNamed: header.parentSession ?? null,
          holdsPinnedCodeword: forkText.includes('ALPHA-7'),
          holdsLaterTurn: forkText.includes('OMEGA-9'),
          holdsLiveContent: forkText.includes('v3 live'),
          holdsAuditedContent: forkText.includes('v1 audited'),
        },
      },
      liveTreeAfter: (await readFile(join(root, 'store.ts'), 'utf8')).trim(),
      degradedFork: { actualStart: missingStart },
    };
    console.log(JSON.stringify(report, null, 2));
    return 0;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

process.exitCode = await main();
