import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { observationSchema } from '../run/observations.js';
import { runSingleSession, type SessionProgress } from '../sessions/single.js';
import { copyFixture } from './helpers/fixture.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { addModule, completionProposed, installMiniRunner, readDeclaredTree, shell } from './helpers/iterations.js';
import { initRepository, testPolicy } from './helpers/runs.js';

/*
 * Process witness for a standalone session's shell. The shell commands must
 * really mutate the working tree so the fresh Ramify check, rather than a
 * scripted response selected from the intended edit, discovers the change.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const notesSource = `${notesDirectory}/src/notes.ts`;

async function project(): Promise<string> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await addModule(fixture.root, notesDirectory, 'notes', {
    'src/notes.ts': 'export const noteLimit = 400;\n',
    'src/tests/notes.test.ts': [
      'import { test, expect } from \'vitest\';',
      'import { noteLimit } from \'../notes.ts\';',
      '',
      'test(\'the limit is what the prompt asks for\', () => { expect(noteLimit).toBe(500); });',
      '',
    ].join('\n'),
  });
  await installMiniRunner(fixture.root);
  await initRepository(fixture.root);
  return fixture.root;
}

/** A real executable whose answer depends on the file the shell actually changed. */
async function stubRamify(): Promise<RamifyCli> {
  const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-session-process-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const executable = join(directory, 'ramify');
  const finding = '{"schemaVersion":"ramify.check/1","outcome":"findings","findings":[{"code":"not-visible","category":"import",'
    + '"message":"collection-review:interfaces/protocol.ts#ToolResult: not-visible","location":{"file":"%s","line":1,"column":1},'
    + '"importer":{"owner":"collection-review/workspace/reviews/notes"},'
    + '"original":{"kind":"code","owner":"collection-review","file":"interfaces/protocol.ts","binding":"ToolResult"}}]}';
  await writeFile(executable, [
    '#!/bin/sh',
    'if [ "$1" = "--version" ]; then echo "ramify 0.0.0 (the session integration stub)"; exit 0; fi',
    'if [ "$1" = "materialize" ]; then exit 0; fi',
    'if [ "$1" = "check" ] && [ "$2" = "--changed" ]; then',
    `  if grep -q FORBIDDEN "$3" 2>/dev/null; then printf '${finding}\\n' "$3"; exit 1; fi`,
    '  echo \'{"schemaVersion":"ramify.check/1","outcome":"checked","findings":[]}\'',
    '  exit 0',
    'fi',
    'echo \'{"schemaVersion":"ramify.cli/1","status":"unavailable","reason":"stub","exitCode":2}\'',
    'exit 2',
    '',
  ].join('\n'));
  await chmod(executable, 0o755);
  class ProcessCheckWithScriptedOwnership extends RamifyCli {
    override queryOwnership = new FakeRamifyCli().queryOwnership;
  }
  return new ProcessCheckWithScriptedOwnership({ executable, timeoutMs: 30_000 });
}

describe('a standalone session process boundary', () => {
  test('a violation written through the shell, which no hook check saw, is caught when completion is proposed', async () => {
    const root = await project();
    const agent = createScriptedAgent([
      // The shell names no changed set, so the hook runs a complete check,
      // which this stub does not answer: nothing saw the violation.
      shell(`printf '// FORBIDDEN\\n' >> notes.ts`),
      { kind: 'submit', input: completionProposed('The limit is 500.') },
      shell(`sed -i '/FORBIDDEN/d' notes.ts`),
      { kind: 'submit', input: completionProposed('The limit is 500, and the import is gone.') },
    ]);
    const events: SessionProgress[] = [];
    const result = await runSingleSession({
      projectRoot: root,
      module: notes,
      prompt: 'Raise the note limit to 500.',
      agent,
      ramify: await stubRamify(),
      refresh: readDeclaredTree,
      policy: testPolicy(root),
      onProgress: event => events.push(event),
    });
    if (result.status !== 'finished') throw new Error(result.reason);

    const summary = result.summary;
    const record = agent.sessions[0]!;
    // The hook after the shell call saw nothing: the complete check it ran
    // could not run, which is stated and is not a pass.
    const appended = events.filter(event => event.type === 'harness-text' && event.kind === 'appended');
    expect((appended[0] as Extract<SessionProgress, { type: 'harness-text' }>).text).toContain('Nothing was verified by this check');
    expect((appended[0] as Extract<SessionProgress, { type: 'harness-text' }>).text).not.toContain('RAMIFY MODULE VIOLATION');

    // The fresh check at `completion-proposed` found it all the same.
    expect(record.verdicts[0]).toMatchObject({ accepted: false });
    expect(JSON.stringify(record.verdicts[0])).toContain('RAMIFY MODULE VIOLATION');
    expect(JSON.stringify(record.verdicts[0])).toContain(notesSource);
    expect(record.verdicts[1]).toMatchObject({ accepted: true });
    expect(summary.standingViolations).toEqual([]);
    expect(summary.ended).toBe('submitted');

    // Both checks at completion name themselves in the observations.
    const observations = (await readFile(join(summary.records, 'observations.jsonl'), 'utf8'))
      .split('\n').filter(Boolean).map(line => observationSchema.parse(JSON.parse(line)));
    const atCompletion = observations.filter(line => line.type === 'hook-check' && line.data.atCompletion === true);
    expect(atCompletion.map(line => (line.type === 'hook-check' ? line.data.outcome : null))).toEqual(['findings', 'passed']);
  }, 120_000);
});
