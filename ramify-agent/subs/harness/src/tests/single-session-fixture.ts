import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, vi } from 'vitest';
import { createScriptedAgent, type ScriptStep } from '../../subs/agent/src/scripted.js';
import type { RamifyCheckResult } from '../../subs/evidence/src/ramify-cli.js';
import type { CommandRunner } from '../../subs/evidence/src/run-command.js';
import { observationSchema, type Observation } from '../run/observations.js';
import { sessionOutcomeSchema, type SessionOutcomeRecord } from '../sessions/records.js';
import { runSingleSession, type SessionProgress, type SingleSessionOptions, type SingleSessionResult } from '../sessions/single.js';
import { completionCheckDeadlineMs } from '../hooks/post-write.js';
import { copyFixture } from './helpers/fixture.js';
import { addModule, installMiniRunner } from './helpers/iterations.js';
import { testPolicy } from './helpers/runs.js';
import { literalOwnershipRamify, externalResponseRecorder, strictSessionCommand, sessionHookPaths } from './helpers/settlement-boundaries.js';
import { fixtureScratchGit, mockGit } from './helpers/mock-git.js';
import { createDirectCheckExecution, type DirectCheckStep } from './helpers/direct-check-execution.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';

/*
 * One engineer session on one module, from a prompt, on the scripted fake.
 *
 * The session is given the equipment of an implementation run: the guard,
 * the hook check, the shell and the validated submission. What these tests hold it to is what the command promises: it
 * refuses before any agent starts when it cannot run, it never commits, its
 * records are plain files git ignores, and nothing follows a submission.
 */

export const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  const failures: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) { try { await cleanup(); } catch (error) { failures.push(error); } }
  try { expectNoProcesses(); } catch (error) { failures.push(error); } finally { forgetExternalTools(); }
  if (failures.length) throw new AggregateError(failures, 'session cleanup failed');
});

export const notes = 'collection-review/workspace/reviews/notes';
export const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
export const notesSource = `${notesDirectory}/src/notes.ts`;

/** A fixture copy with a module whose test asks for a limit its source does not have yet. */
export async function project(): Promise<string> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  const root = fixture.root;
  await addModule(root, notesDirectory, 'notes', {
    'src/notes.ts': 'export const noteLimit = 400;\n',
    'src/tests/notes.test.ts': [
      'import { test, expect } from \'vitest\';',
      'import { noteLimit } from \'../notes.ts\';',
      '',
      'test(\'the limit is what the prompt asks for\', () => { expect(noteLimit).toBe(500); });',
      '',
    ].join('\n'),
  });
  await installMiniRunner(root);
  return root;
}

interface Session {
  readonly result: SingleSessionResult;
  readonly agent: ReturnType<typeof createScriptedAgent>;
  readonly events: SessionProgress[];
  readonly git: ReturnType<typeof mockGit>;
}

interface SessionBoundaries {
  readonly changed?: readonly string[] | undefined;
  readonly ramify?: readonly { form: 'changed' | 'complete'; outcome: 'checked' | 'findings' | 'not-checked' }[] | undefined;
  readonly gate?: readonly DirectCheckStep[] | undefined;
  readonly commandExecution?: CommandRunner | undefined;
  readonly command?: string | undefined;
  readonly starts?: boolean | undefined;
  readonly preparationChangedPaths?: number | undefined;
}

export async function session(
  root: string,
  steps: readonly ScriptStep[],
  extra: Partial<SingleSessionOptions> = {},
  boundaries: SessionBoundaries = {},
): Promise<Session> {
  const agent = createScriptedAgent(steps);
  const events: SessionProgress[] = [];
  const changed = [...(boundaries.changed ?? [])];
  let changedCalls = 0;
  const recorder = externalResponseRecorder();
  cleanups.push(async () => recorder.assertComplete());
  const retain = recorder.answer;
  const git = mockGit({
    currentHead: async projectRoot => { expect(projectRoot).toBe(root); return 'single-session-base'; },
    changedPaths: async projectRoot => {
      expect(projectRoot).toBe(root);
      expect(changedCalls, 'exhausted changed paths').toBeLessThan(4);
      changedCalls += 1;
      return changedCalls === 1 ? [] : changed;
    },
  });
  const answers = boundaries.ramify ?? [];
  let answerIndex = 0;
  const ownership = literalOwnershipRamify(root, true, (boundaries.starts ?? true) ? { materializeFrom: extra.module === 'collection-review' ? '' : notesDirectory } : {});
  const ramify = ownership.ramify;
  cleanups.push(async () => ownership.assertComplete());
  cleanups.push(async () => checkCompletion());
  // A scripted verdict checked every named path; a scripted not-checked is
  // an unavailable answer that printed no check document.
  const answer = async (form: 'changed' | 'complete', paths: readonly string[]): Promise<RamifyCheckResult> => retain(async () => {
    const scripted = answers[answerIndex];
    expect(scripted, `no Ramify ${form} answer was scripted at index ${answerIndex}`).toBeDefined();
    expect(scripted!.form).toBe(form);
    answerIndex += 1;
    const report = scripted!.outcome === 'findings' ? { findings: [finding()] } : { findings: [] };
    const verdict = scripted!.outcome !== 'not-checked';
    return {
      form, exitCode: scripted!.outcome === 'checked' ? 0 : scripted!.outcome === 'findings' ? 1 : 2,
      outcome: scripted!.outcome, reason: verdict ? null : 'scripted unavailable',
      report, stdout: JSON.stringify(report), stderr: '',
      provider: verdict ? { schema: form === 'changed' ? 'ramify.check/3' : 'ramify.analysis/3', revision: 'scripted' } : null,
      execution: verdict ? 'completed' : null,
      paths: verdict ? paths.map(path => ({ path, disposition: 'checked' as const, module: 'scripted', exclusion: null, reason: 'content' as const, sha256: '0'.repeat(64) })) : [],
      removed: [], unsupported: null,
    };
  });
  vi.spyOn(ramify, 'checkChanged').mockImplementation(async (paths, project, deadline) => retain(async () => {
    expect(project).toBe(root); expect([testPolicy(root).commands.hookTimeoutMs, completionCheckDeadlineMs]).toContain(deadline);
    expect(paths.every(path => [...changed, ...sessionHookPaths, extra.module === 'collection-review' ? '.' : notesDirectory, ...(extra.write ?? [])].includes(path)), `unstated hook paths: ${JSON.stringify(paths)}`).toBe(true); return answer('changed', paths);
  }));
  vi.spyOn(ramify, 'checkComplete').mockImplementation(async project => retain(async () => {
    expect(project).toBe(root); return answer('complete', []);
  }));
  const checkExecution = createDirectCheckExecution({ script: boundaries.gate ?? [] });
  function checkCompletion() {
    expect(answerIndex, 'required Ramify replies').toBe(answers.length); checkExecution.assertComplete(); expect(git.unexpected, 'caught Git violations').toEqual([]);
    const starts = boundaries.starts ?? true;
    expect(git.currentHead).toHaveBeenCalledTimes(starts ? (extra.gate === true ? 2 : 1) : 0);
    expect(git.changedPaths).toHaveBeenCalledTimes(starts ? 4 : boundaries.preparationChangedPaths ?? 0);
    expect(git.commitAccepted).not.toHaveBeenCalled();
  }
  const command = strictSessionCommand(root, extra.module === 'collection-review' ? join(root, 'src') : join(root, notesDirectory, 'src'), boundaries.command, boundaries.commandExecution);
  cleanups.push(async () => command.assertComplete());
  const result = await runSingleSession({
    projectRoot: root,
    module: notes,
    prompt: 'Raise the note limit to 500.',
    agent,
    ramify,
    git: fixtureScratchGit(git),
    checkExecution,
    commandExecution: command.run,
    refresh: ownership.refresh,
    policy: testPolicy(root),
    onProgress: event => events.push(event),
    ...extra,
  });
  expect(answerIndex, JSON.stringify(result)).toBe(answers.length);
  checkExecution.assertComplete();
  expect(git.unexpected).toEqual([]);
  const starts = boundaries.starts ?? true;
  expect(git.currentHead).toHaveBeenCalledTimes(starts ? (extra.gate === true ? 2 : 1) : 0);
  expect(git.changedPaths).toHaveBeenCalledTimes(starts ? 4 : boundaries.preparationChangedPaths ?? 0);
  expect(git.commitAccepted).not.toHaveBeenCalled();
  return { result, agent, events, git };
}

function finding() {
  return {
    code: 'not-visible', category: 'import',
    message: 'collection-review:interfaces/protocol.ts#ToolResult: not-visible',
    location: { file: notesSource, line: 1, column: 1 },
    importer: { owner: notes },
    original: { kind: 'code', owner: 'collection-review', file: 'interfaces/protocol.ts', binding: 'ToolResult' },
  };
}

export const checked = (form: 'changed' | 'complete') => ({ form, outcome: 'checked' as const });
/** The in-place diagnosis's type check and Ramify check, both passing. */
export const passingGate = [{}, {}] as const;

export function finished(result: SingleSessionResult) {
  if (result.status !== 'finished') throw new Error(`the session did not start: ${result.reason}`);
  return result.summary;
}

export async function outcomeOf(records: string): Promise<SessionOutcomeRecord> {
  return sessionOutcomeSchema.parse(JSON.parse(await readFile(join(records, 'outcome.json'), 'utf8')));
}

export async function observationsOf(records: string): Promise<Observation[]> {
  return (await readFile(join(records, 'observations.jsonl'), 'utf8'))
    .split('\n').filter(Boolean).map(line => observationSchema.parse(JSON.parse(line)));
}

export async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}
