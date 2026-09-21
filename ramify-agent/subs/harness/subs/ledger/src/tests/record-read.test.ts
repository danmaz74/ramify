import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import type { RecordSchema } from '../ledger.js';
import { testLedger, transaction } from './helpers/ledger.js';
import { temporaryDirectory } from './helpers/temporary.js';

let directory: Awaited<ReturnType<typeof temporaryDirectory>>;
beforeEach(async () => { directory = await temporaryDirectory(); });
afterEach(async () => { await directory.remove(); });

const recordsOf = (): string => join(directory.path, 'records');

interface RunRecord { schema: 'ramify-agent.run/1'; id: string; plan: string }

const runSchema: RecordSchema<RunRecord> = {
  schema: 'ramify-agent.run/1',
  body: z.object({ schema: z.literal('ramify-agent.run/1'), id: z.string(), plan: z.string() }),
};

const valid: RunRecord = { schema: 'ramify-agent.run/1', id: 'run-1', plan: 'plan-a' };

/** Writes `body` at `run/01.json` through the log, so the file is materialized. */
async function committed(body: unknown): Promise<Awaited<ReturnType<typeof testLedger>>> {
  const ledger = await testLedger(directory.path);
  await ledger.append(transaction(1, [{ path: 'run/01.json', id: 'run', revision: 1, body }]));
  return ledger;
}

describe('reading a record', () => {
  test('valid: the parsed value', async () => {
    const ledger = await committed(valid);
    const read = await ledger.readRecord('run/01.json', runSchema);
    expect(read).toEqual({ kind: 'valid', value: valid });
  });

  test('unsupported version: the schema the file declares, with its path', async () => {
    const ledger = await committed({ ...valid, schema: 'ramify-agent.run/2' });
    const read = await ledger.readRecord('run/01.json', runSchema);
    expect(read).toEqual({ kind: 'unsupported-version', schema: 'ramify-agent.run/2', path: 'run/01.json' });
  });

  test('invalid: every error with its path', async () => {
    const ledger = await committed({ schema: 'ramify-agent.run/1', id: 7 });
    const read = await ledger.readRecord('run/01.json', runSchema);
    expect(read.kind).toBe('invalid');
    if (read.kind !== 'invalid') throw new Error('expected invalid');
    expect(read.path).toBe('run/01.json');
    expect(read.errors).toHaveLength(2);
    expect(read.errors.join('\n')).toMatch(/^id: /m);
    expect(read.errors.join('\n')).toMatch(/^plan: /m);
  });

  test('a record that declares no schema is invalid, not unsupported', async () => {
    const ledger = await committed({ id: 'run-1', plan: 'plan-a' });
    expect(await ledger.readRecord('run/01.json', runSchema)).toEqual({
      kind: 'invalid',
      errors: ['the record declares no schema'],
      path: 'run/01.json',
    });
  });

  test('a file that is not JSON is invalid, with the reason', async () => {
    const ledger = await testLedger(directory.path);
    await mkdir(join(recordsOf(), 'run'), { recursive: true });
    await writeFile(join(recordsOf(), 'run', '01.json'), 'half a re');
    const read = await ledger.readRecord('run/01.json', runSchema);
    expect(read.kind).toBe('invalid');
    if (read.kind !== 'invalid') throw new Error('expected invalid');
    expect(read.errors[0]).toMatch(/^the record file is not a JSON value: /);
  });

  test('a missing file is a failure with evidence, never an absent record', async () => {
    const ledger = await committed(valid);
    await rm(join(recordsOf(), 'run', '01.json'));
    expect(await ledger.readRecord('run/01.json', runSchema)).toEqual({
      kind: 'invalid',
      errors: ['the record file is missing'],
      path: 'run/01.json',
    });
    // The log is the authority, so materialize restores it and the read succeeds.
    await ledger.materialize();
    expect(await ledger.readRecord('run/01.json', runSchema)).toEqual({ kind: 'valid', value: valid });
  });

  test('a path that escapes the records root is refused', async () => {
    const ledger = await testLedger(directory.path);
    await expect(ledger.readRecord('../outside.json', runSchema)).rejects.toThrow(TypeError);
  });
});
