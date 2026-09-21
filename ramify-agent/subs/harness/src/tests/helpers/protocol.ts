import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { checkCommand } from '../../checks/records.js';
import type { RunPolicy } from '../../run/records.js';
import { copyFixture } from './fixture.js';
import { analysis, entry, hypothesis, requestCompletion } from './analysis.js';
import {
  addModule, assign, byWork, completionProposed, edit, installMiniRunner, outline, read, shell, submit, write,
} from './iterations.js';
import { initRepository, testPolicy } from './runs.js';

/*
 * One run with something in every area of the Run page: an entry whose
 * owner exists, an entry that proposes a module the engineer creates, a
 * hypothesis, a read outside the scope, a guarded edit, an unguarded shell
 * write outside the scope, iteration and work-item gates, and a final gate
 * whose output is longer than the tail a client receives.
 *
 * Nothing in it is simulated: every submission goes through the judge, every
 * command is spawned, and the module is created by the engineer's writes and
 * read from the accepted commit.
 */

export const notes = 'collection-review/workspace/reviews/notes';
export const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
export const drafts = `${notes}/drafts`;
export const draftsDirectory = `${notesDirectory}/subs/drafts`;
export const outsidePath = 'subs/workspace/subs/reviews/src/outside-the-scope.ts';

/** How long the final gate's test command prints, in bytes: longer than the 8 KiB tail. */
export const longOutputBytes = 20_000;

/** A fixture copy with the notes module, the runner that really runs test files, and one commit. */
export async function protocolTarget(): Promise<{ root: string; remove: () => Promise<void> }> {
  const fixture = await copyFixture();
  await addModule(fixture.root, notesDirectory, 'notes', {
    'src/notes.ts': 'export const noteLimit = 400;\n',
    'src/tests/notes.test.ts': [
      'import { test, expect } from \'vitest\';',
      'import { noteLimit } from \'../notes.ts\';',
      '',
      'test(\'the note limit is what the plan asks for\', () => { expect(noteLimit).toBe(500); });',
      '',
    ].join('\n'),
  });
  await installMiniRunner(fixture.root);
  await initRepository(fixture.root);
  return fixture;
}

/** The policy of the run: cheap real commands, and a project test command whose output exceeds the tail. */
export function protocolPolicy(projectRoot: string): RunPolicy {
  const base = testPolicy(projectRoot);
  return {
    ...base,
    commands: {
      ...base.commands,
      allTests: checkCommand({
        argv: [process.execPath, '-e', `process.stdout.write('x'.repeat(${longOutputBytes - 12}) + '\\nall passed\\n')`],
        cwd: projectRoot,
        timeoutMs: 30_000,
      }),
    },
  };
}

/** The script: two work items, one of which creates a module. */
export function protocolScript() {
  return byWork({
    'initial-architect': [submit(analysis(
      [
        entry('review-note', notes, 'The notes module holds a reviewer\'s note and its limit.'),
        entry('note-drafts', drafts, 'A module keeps a reviewer\'s unsent drafts.', {
          parent: notes, directory: draftsDirectory, purpose: 'Keeps a reviewer\'s unsent drafts.', tags: [],
        }),
      ],
      [hypothesis('note-search', { change: 'create', suggestedOwner: notes, rationale: 'Notes may need to be searched later.' })],
    ))],
    'local-architect:wi-001': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
    'local-architect:wi-002': [submit(assign(drafts, {}, outline())), submit(requestCompletion())],
    'engineer:wi-001': [submit(
      completionProposed('Raised the note limit where the test asks for it.'),
      read('subs/workspace/subs/reviews/src/router.ts'),
      edit(`${notesDirectory}/src/notes.ts`, 'noteLimit = 400', 'noteLimit = 500'),
      shell(`printf 'export const outside = true;\\n' > ${outsidePath}`),
    )],
    'engineer:wi-002': [submit(
      completionProposed('Created the drafts module with its first behavior and the test that states it.'),
      write(`${draftsDirectory}/module.ramify`, 'ramify 1\nmodule drafts\n'),
      write(`${draftsDirectory}/README.md`, '# drafts\n\nKeeps a reviewer\'s unsent drafts.\n'),
      write(`${draftsDirectory}/src/drafts.ts`, 'export const draftLimit = 20;\n'),
      write(`${draftsDirectory}/src/tests/drafts.test.ts`, [
        'import { test, expect } from \'vitest\';',
        'import { draftLimit } from \'../drafts.ts\';',
        '',
        'test(\'a reviewer keeps at most twenty drafts\', () => { expect(draftLimit).toBe(20); });',
        '',
      ].join('\n')),
    )],
  });
}

/** Every file beneath a directory with the SHA-256 of its bytes, by relative path. */
export async function fileHashes(directory: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  const walk = async (current: string): Promise<void> => {
    for (const item of await readdir(current, { withFileTypes: true })) {
      const path = join(current, item.name);
      if (item.isDirectory()) await walk(path);
      else if (item.isFile()) hashes.set(relative(directory, path), createHash('sha256').update(await readFile(path)).digest('hex'));
    }
  };
  await walk(directory);
  return hashes;
}
