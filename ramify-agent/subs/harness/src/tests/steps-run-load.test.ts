import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { runStepCommandWith } from '../steps/command.js';
import { runStep } from '../steps/run.js';
import { passingAudit } from './helpers/direct-check-execution.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { assign, outline, readDeclaredTree, treeInputs, unsuitableScope } from './helpers/iterations.js';
import { fixtureScratchGit, mockGit } from './helpers/mock-git.js';
import { repairContinuationRun } from './helpers/repair-run.js';
import { openRuns, runPath } from './helpers/runs.js';

/*
 * S10: a manual run beside an implementation run. Loading the project skips
 * the manual run and reports it, leaves its records as they are, and still
 * loads the implementation run, which the manual run did not change.
 */

const notes = 'collection-review/workspace/reviews/notes';
const cleanups: Array<() => Promise<void>> = [];
afterAll(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

/** Every file beneath a directory with its size and modification time. */
async function tree(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return Promise.all(entries.filter(entry => entry.isFile()).map(async entry => {
    const path = join(entry.parentPath, entry.name);
    const info = await stat(path);
    return `${path} ${info.size} ${info.mtimeMs}`;
  })).then(items => items.sort());
}

test('S10: load skips a manual run and reports it; the implementation run beside it loads unchanged', async () => {
  const implementation = await repairContinuationRun(cleanups);
  // The run's service holds the project lock; it is closed before the step takes it.
  await cleanups.pop()!();
  const { root, planId } = implementation;
  const implementationDirectory = runPath(root, planId, implementation.runId);
  const before = await tree(implementationDirectory);

  const scratch = await mkdtemp(join(tmpdir(), 'ramify-agent-step-load-'));
  cleanups.push(() => rm(scratch, { recursive: true, force: true }));
  const workItem = join(scratch, 'work-item.json');
  const assignment = join(scratch, 'assignment.json');
  await writeFile(workItem, JSON.stringify({ schema: 'ramify-agent.work-item/1', id: 'manual-item', module: notes, origin: { entry: 'review-note' },
    goal: 'Restate the note limit.', requirementRefs: [], acceptanceRefs: [], contextRefs: [], startedFor: null }));
  await writeFile(assignment, JSON.stringify(assign(notes, {}, outline())));
  const inputs = join(scratch, 'inputs.json');
  const authored = await runStepCommandWith({ command: 'inputs', role: 'engineer', fromRun: undefined, invocation: undefined, projectRoot: root, out: inputs,
    authored: { workItem, assignment } }, { ramify: new FakeRamifyCli(), git: { currentHead: async () => 'repaired-source' }, configuredAudit: passingAudit(), index: readDeclaredTree });
  if (authored.exitStatus !== 0) throw new Error(authored.stderr);

  const git = mockGit({
    currentHead: async () => 'repaired-source',
    changedPaths: async () => [],
    createRunBranch: async (_root, runId) => ({ branch: `ramify-agent-run/${runId}`, created: true }),
  });
  const manual = runPath(root, planId, 'm-001');
  const result = await runStep({ inputs, run: manual, agent: createScriptedAgent([{ kind: 'submit', input: unsuitableScope() }]),
    ramify: new FakeRamifyCli(), git: fixtureScratchGit(git), refresh: readDeclaredTree });
  expect(result).toMatchObject({ status: 'finished', exitStatus: 0 });
  expect(git.unexpected).toEqual([]);
  expect(await tree(implementationDirectory)).toEqual(before);

  const manualBefore = await tree(manual);
  const opened = await openRuns(root, { inputs: treeInputs(), git: mockGit({ currentHead: async () => 'repaired-source', isCleanRepository: async () => true }) });
  try {
    expect(opened.recovery.manual).toEqual([`${planId}/m-001`]);
    expect(opened.service.listRuns(planId).map(run => [run.jobId, run.state])).toEqual([[implementation.runId, 'completed']]);
  } finally {
    await opened.service.close();
  }
  expect(await tree(manual)).toEqual(manualBefore);
  expect(await tree(implementationDirectory)).toEqual(before);
}, 300_000);
