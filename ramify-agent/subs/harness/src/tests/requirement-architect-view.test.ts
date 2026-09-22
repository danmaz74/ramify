import { mkdir, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { copyFixture } from './helpers/fixture.js';
import { addModule, installMiniRunner } from './helpers/iterations.js';
import { realRamify } from './helpers/runs.js';
import { loadArchitectIndex } from '../../subs/evidence/src/views.js';

/*
 * A retained real boundary: the installed Ramify command line, materializing
 * the architect view of an accepted delegation.
 *
 * This is the witness that the generated architectural evidence names a fake
 * as a fake. It runs the real command line over a real project directory and
 * reads what it wrote, so it is deliberately not one of the scripted
 * lifecycle scenarios; no run, no Git and no gate takes part in it.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const consumer = 'collection-review/workspace/reviews/notes';
const consumerDirectory = 'subs/workspace/subs/reviews/subs/notes';
const provider = 'collection-review/workspace/reviews/limits';
const providerDirectory = 'subs/workspace/subs/reviews/subs/limits';

const stub = 'export function addNote(note) {\n  throw new Error(\'not available yet\');\n}\n';
const consumerTest = [
  "import { test, expect } from 'vitest';",
  "import { addNote } from '../notes.ts';",
  '',
  "test('a note over the limit is refused', () => {",
  "  expect(addNote('x'.repeat(501))).toBe('');",
  '});',
  '',
].join('\n');

const contractFile = "export const noteLimitCases = [{ note: 'a short note', within: true }, { note: 'x'.repeat(501), within: false }];\n";
const fakeFile = [
  '/** The fake the consumer implements against. */',
  'export function createNoteLimitFake() {',
  '  return { withinLimit: (note) => note.length <= 500 };',
  '}',
  '',
].join('\n');
const realProvider = 'export function createNoteLimit() {\n  return { withinLimit: (note) => note.length <= 500 };\n}\n';
const replaced = [
  "import { createNoteLimit } from '../../limits/src/note-limit.ts';",
  '',
  'const limit = createNoteLimit();',
  '',
  'export function addNote(note) {',
  "  return limit.withinLimit(note) ? note : '';",
  '}',
  '',
].join('\n');

async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await addModule(fixture.root, consumerDirectory, 'notes', {
    'src/notes.ts': stub,
    'src/tests/notes.test.ts': consumerTest,
  });
  await addModule(fixture.root, providerDirectory, 'limits', {});
  await installMiniRunner(fixture.root);
  return fixture.root;
}

describe('P2: architectural evidence does not present a fake as production behavior', () => {
  test('the architect view of the accepted state shows the fake under its fake name', async () => {
    const daemon = await realRamify();
    cleanups.push(() => daemon.dispose());
    const root = await target();

    // The state an accepted delegation leaves: the contract, the fake beside
    // it, the real provider, and a consumer that uses the real provider.
    const put = async (path: string, content: string) => {
      await mkdir(`${root}/${path}`.replace(/\/[^/]+$/, ''), { recursive: true });
      await writeFile(`${root}/${path}`, content);
    };
    await put(`${providerDirectory}/src/interfaces/note-limit.ts`, contractFile);
    await put(`${providerDirectory}/src/fakes/note-limit.fake.ts`, fakeFile);
    await put(`${providerDirectory}/src/note-limit.ts`, realProvider);
    await put(`${consumerDirectory}/src/notes.ts`, replaced);

    const materialized = await daemon.ramify.materialize(root);
    expect(materialized.ok).toBe(true);
    const index = await loadArchitectIndex(root);
    const records = index.symbols.get(provider) ?? [];
    expect(records.length).toBeGreaterThan(0);

    // Every name the view records for the fake's file carries `Fake`, so a
    // reader of the generated evidence cannot mistake it for the provider.
    const fromTheFake = records.filter(record => record.file.includes('note-limit.fake'));
    expect(fromTheFake.map(record => record.name)).toContain('createNoteLimitFake');
    for (const record of fromTheFake) expect(record.name).toContain('Fake');

    // The real provider is there too, under its own behavior-oriented name,
    // and it is not the fake's file.
    const real = records.find(record => record.name === 'createNoteLimit');
    expect(real).toBeDefined();
    expect(real!.file).not.toContain('.fake');
    expect(index.modules.has(provider)).toBe(true);
  }, 600_000);
});
