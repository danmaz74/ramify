import { localArchitectToolName } from '../work/submission.js';
import { finalCandidate } from './helpers/final-candidate.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { runLayout } from '../run/records.js';
import type { MaterializeResult } from '../../subs/evidence/src/ramify-cli.js';
import type { Script } from '../../subs/agent/src/scripted.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { addModule, assign, byRole, completionProposed, outline, read, submit, treeInputs, write } from './helpers/iterations.js';
import { gateGit, scenariosCommit, type GateCommit } from './helpers/gate-git.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { installTestRunner, onlyRun, openRuns, runPath, startRun } from './helpers/runs.js';

/*
 * The API view a local architect's turns carry. The view is materialized for
 * the work item's first turn; one that could not be materialized is
 * materialized again for a later turn, so a continued session never receives
 * a failure the project has outgrown. Ramify is a fake whose answers the test
 * states; the agent is the scripted fake and Git is answered, not run.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const base = 'revision-00';
const scenarios = scenariosCommit('review-notes', 'scenarios-00', base);
const unchanged: GateCommit = { commit: null };
const failure = 'Not materialized (analysis-failed): the daemon could not refresh its capture';

/** A Ramify whose first API view materialization fails and whose later ones write the module's view. */
class RecoveringRamify extends FakeRamifyCli {
  readonly apiFrom: string[] = [];

  override async materialize(projectRoot: string, apiFrom?: string, signal?: AbortSignal): Promise<MaterializeResult> {
    if (apiFrom === undefined) return super.materialize(projectRoot, apiFrom, signal);
    this.apiFrom.push(apiFrom);
    if (this.apiFrom.length === 1) return { ok: false, message: failure };
    const directory = join(projectRoot, apiFrom, 'src', '.ramify');
    await mkdir(directory, { recursive: true });
    const revision = 'rev/1:x:2';
    const architectDirectory = join(projectRoot, '.ramify-architect');
    await mkdir(architectDirectory, { recursive: true });
    await writeFile(join(architectDirectory, '_meta.json'), JSON.stringify({
      schema: 'ramify.architect-view/3', revision, input: 'input/1:test', modules: 1,
      dependencies: 'measured', dependencyScope: 'production',
    }));
    await writeFile(join(directory, '_meta.json'), JSON.stringify({ schema: 'ramify.api-view/1', module: notes, area: 'ordinary', revision }));
    return { ok: true, output: '' };
  }
}

/** Records the first message of every session a role starts or continues. */
function recording(script: Script, prompts: Map<string, string[]>, directories: string[] = []): Script {
  return spec => {
    if (spec.role !== 'local-architect' || spec.submission.name === localArchitectToolName) prompts.set(spec.role, [...(prompts.get(spec.role) ?? []), spec.prompt]);
    if (spec.submission.name === localArchitectToolName) directories.push(spec.scope.workingDirectory);
    return typeof script === 'function' ? script(spec) : script;
  };
}

describe('the API view of a local architect\'s continued turns', () => {
  test('a view that could not be materialized is materialized again for the next turn', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await addModule(fixture.root, notesDirectory, 'notes', { 'src/notes.ts': 'export const noteLimit = 500;\n' });
    await installTestRunner(fixture.root);

    const ramify = new RecoveringRamify();
    const prompts = new Map<string, string[]>();
    const directories: string[] = [];
    const scripted = gateGit(fixture.root, { previews: finalCandidate(fixture.root, 'revision-01').previews, head: base, commits: [scenarios,
      { commit: 'revision-01', changes: [{ status: 'A', path: `${notesDirectory}/src/store.ts` }] }, unchanged] });
    const opened = await openRuns(fixture.root, {
      script: recording(byRole({
        'initial-architect': [submit(analysis([entry('review-note', notes)]))],
        'local-architect': [
          [read('notes.ts'), ...submit(assign(notes, {}, outline({ changes: 'The note needs a store.', revisionReason: '' })))],
          [read('store.ts'), ...submit(requestCompletion({ changes: 'The store is in place.', revisionReason: 'The iteration added it.' }))],
        ],
        engineer: [submit(completionProposed('Added the note store.'), write(`${notesDirectory}/src/store.ts`, 'export const store = new Map();\n'))],
      }), prompts, directories),
      inputs: treeInputs(),
      ramify,
      git: scripted.git, candidates: finalCandidate(fixture.root, 'revision-01').candidates,

    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);
    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');

    const [first, second] = prompts.get('local-architect') ?? [];
    expect(first).toContain(`- API view: none was materialized, because the API view could not be materialized: ${failure}.`);
    expect(second).toBeDefined();
    expect(second).not.toContain(failure);
    const moduleSource = join(fixture.root, notesDirectory, 'src');
    expect(directories).toEqual([moduleSource, moduleSource]);
    const architectMeta = JSON.parse(await readFile(join(fixture.root, '.ramify-architect', '_meta.json'), 'utf8')) as { revision: string };
    expect(second).toContain(`- API view (src): \`${moduleSource}/.ramify/\`, revision \`${architectMeta.revision}\``);
    expect(first).toContain(`- Onboarding (\`${join(fixture.root, notesDirectory, 'README.md')}\`)`);
    expect(first).toContain(`- The architect view is at \`${fixture.root}/.ramify-architect/\``);
    expect(first).toContain(`- Working directory: \`${moduleSource}\``);
    const activity = (await readFile(runPath(fixture.root, 'review-notes', receipt.jobId, runLayout.observations('inv-0006')), 'utf8'))
      .trim().split('\n').map(line => JSON.parse(line) as { type: string; data: { activity?: { kind: string; path?: string } } });
    expect(activity).toContainEqual(expect.objectContaining({ type: 'activity', data: { activity: expect.objectContaining({ kind: 'read', path: `${notesDirectory}/src/notes.ts` }) } }));
    // The architect's first turn, the engineer's briefing and the architect's second turn each materialized it.
    expect(ramify.apiFrom).toEqual([notesDirectory, notesDirectory, notesDirectory]);
    scripted.assertComplete();
  }, 120_000);
});
