import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { guardedFilesHash } from '../../subs/evidence/src/guarded-files.js';
import { runGate } from '../checks/gate.js';
import type { GateRequest } from '../checks/gate.js';
import { checkCommand } from '../checks/records.js';
import type { CheckCommand, GateAttempt } from '../checks/records.js';
import type { PlannedCheck } from '../checks/verify.js';
import { temporaryDirectory } from './helpers/fixture.js';

/**
 * The evidence a gate records is bound to the content of the guarded files, not
 * to a commit and not to an identity of the working tree. A change to a file
 * nobody guards is content for the next commit and blocks nothing; a change to
 * a guarded file is named, whether it was an edit or a deletion.
 */
describe('the evidence a gate is bound to', () => {
  let directory: { path: string; remove: () => Promise<void> };
  const write = (path: string, content: string) => writeFile(join(directory.path, path), content);

  beforeEach(async () => {
    directory = await temporaryDirectory();
    await write('package.json', '{"name":"project"}\n');
    await write('tsconfig.json', '{"files":[]}\n');
    await write('vitest.config.ts', 'export default {};\n');
    await write('source.ts', 'export const one = 1;\n');
  });
  afterEach(async () => {
    await directory.remove();
  });

  const command = (script: string): CheckCommand =>
    checkCommand({ argv: ['bash', '-c', script], cwd: directory.path, timeoutMs: 30_000 });
  const passing = (): PlannedCheck[] => [
    { kind: 'ramify-check', command: command('echo "0 findings"') },
    { kind: 'type-check', command: command('true') },
  ];

  const gate = (overrides: Partial<GateRequest> = {}): Promise<GateAttempt> => runGate('iteration', {
    id: 'ga-0007',
    projectRoot: directory.path,
    directory: join(directory.path, 'gates', 'ga-0007'),
    head: 'a'.repeat(40),
    checks: passing(),
    ...overrides,
  });

  const captured = () => guardedFilesHash(directory.path, ['package.json', 'tsconfig.json', 'vitest.config.ts'])
    .then(files => files.map(file => ({ path: file.path, hash: file.hash ?? '' })));

  it('names a guarded file that changed and one that was deleted, the deletion as after: null', async () => {
    const guarded = await captured();
    await write('vitest.config.ts', 'export default { test: { include: [] } };\n');
    await rm(join(directory.path, 'tsconfig.json'));

    const attempt = await gate({ guarded });

    expect(attempt.guardedChanges.map(change => change.path)).toEqual(['tsconfig.json', 'vitest.config.ts']);
    expect(attempt.guardedChanges[0]?.after).toBeNull();
    expect(attempt.guardedChanges[0]?.before).toMatch(/^[0-9a-f]{64}$/);
    expect(attempt.guardedChanges[1]?.after).toMatch(/^[0-9a-f]{64}$/);
    expect(attempt.guardedChanges[1]?.before).not.toBe(attempt.guardedChanges[1]?.after);
    expect(attempt.guardedChanges.every(change => change.authorizedBy === null)).toBe(true);
  });

  it('never passes an unauthorized guarded change, whatever the commands said', async () => {
    const guarded = await captured();
    await write('vitest.config.ts', 'export default { test: { include: [] } };\n');

    const attempt = await gate({ guarded });

    expect(attempt.commands.every(entry => entry.outcome === 'passed')).toBe(true);
    expect(attempt.verdict).toBe('failed');
    expect(attempt.cause).toBe('guarded-change');
    expect(attempt.next).toBe('return-to-local-architect');
  });

  it('names the record that authorized a guarded change, and passes with it', async () => {
    const guarded = await captured();
    await write('vitest.config.ts', 'export default { test: { include: [] } };\n');

    const attempt = await gate({
      guarded,
      authorizations: [{ path: 'vitest.config.ts', by: { id: 'ob-send-email', revision: 2, hash: 'b'.repeat(64) } }],
    });

    expect(attempt.guardedChanges[0]?.authorizedBy).toEqual({ id: 'ob-send-email', revision: 2, hash: 'b'.repeat(64) });
    expect(attempt.verdict).toBe('passed');
    expect(attempt.cause).toBeNull();
    expect(attempt.next).toBe('accept');
  });

  it('lets a change no one guards through: the working directory blocks nothing', async () => {
    const guarded = await captured();
    await write('source.ts', 'export const one = 1;\nexport const two = 2;\n');
    await write('added.ts', 'export const three = 3;\n');

    const attempt = await gate({ guarded });

    expect(attempt.guardedChanges).toEqual([]);
    expect(attempt.verdict).toBe('passed');
  });

  /**
   * The attempt carries the head its caller gave it and no identity of the
   * tree. Nothing is compared with the head, so work that arrived after it
   * neither invalidates the attempt nor is asked about.
   */
  it('takes no identity of the working tree and compares none', async () => {
    const guarded = await captured();
    await write('source.ts', 'export const changed = true;\n');

    const attempt = await gate({ guarded, head: 'c'.repeat(40) });

    expect(attempt.head).toBe('c'.repeat(40));
    expect(attempt.commit).toBeNull();
    expect(attempt.verdict).toBe('passed');
    const fields = new Set(Object.keys(attempt));
    expect([...fields].filter(field => /tree|snapshot|inputIdentity/i.test(field))).toEqual([]);
  });

  it('compares nothing when the checkpoint captured no guarded file', async () => {
    const attempt = await gate({});

    expect(attempt.guardedChanges).toEqual([]);
    expect(attempt.verdict).toBe('passed');
  });
});
