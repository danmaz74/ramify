import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { MaterializeResult } from '../../subs/evidence/src/ramify-cli.js';
import type { Script } from '../../subs/agent/src/scripted.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { addModule, assign, byRole, completionProposed, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { gateGit, scenariosCommit, type GateCommit } from './helpers/gate-git.js';
import { directReadinessExecution, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { installTestRunner, onlyRun, openRuns, startRun } from './helpers/runs.js';

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
    await writeFile(join(directory, '_meta.json'), JSON.stringify({ schema: 'ramify.api-view/1', module: notes, revision: 'rev/1:x:2' }));
    return { ok: true, output: '' };
  }
}

/** Records the first message of every session a role starts or continues. */
function recording(script: Script, prompts: Map<string, string[]>): Script {
  return spec => {
    prompts.set(spec.role, [...(prompts.get(spec.role) ?? []), spec.prompt]);
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
    const scripted = gateGit(fixture.root, { head: base, commits: [scenarios,
      { commit: 'revision-01', changes: [{ status: 'A', path: `${notesDirectory}/src/store.ts` }] }, unchanged] });
    const opened = await openRuns(fixture.root, {
      script: recording(byRole({
        'initial-architect': [submit(analysis([entry('review-note', notes)]))],
        'local-architect': [
          submit(assign(notes, {}, outline({ changes: 'The note needs a store.', revisionReason: '' }))),
          submit(requestCompletion({ changes: 'The store is in place.', revisionReason: 'The iteration added it.' })),
        ],
        engineer: [submit(completionProposed('Added the note store.'), write(`${notesDirectory}/src/store.ts`, 'export const store = new Map();\n'))],
      }), prompts),
      inputs: treeInputs(),
      ramify,
      git: scripted.git,
      readinessExecution: directReadinessExecution(),
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);
    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');

    const [first, second] = prompts.get('local-architect') ?? [];
    expect(first).toContain(`- API view: none was materialized, because the API view could not be materialized: ${failure}.`);
    expect(second).toBeDefined();
    expect(second).not.toContain(failure);
    expect(second).toContain(`- API view (src): \`${notesDirectory}/src/.ramify/\`, revision \`rev/1:x:2\``);
    // The architect's first turn, the engineer's briefing and the architect's second turn each materialized it.
    expect(ramify.apiFrom).toEqual([notesDirectory, notesDirectory, notesDirectory]);
    scripted.assertComplete();
  }, 120_000);
});
