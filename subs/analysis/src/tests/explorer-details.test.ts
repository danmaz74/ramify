import { describe, expect, it } from 'vitest';
import type { SymbolDetailRequest } from '../../subs/typescript/src/interfaces/source.js';
import { fixture, opened, paths, put, timeout } from './session-test-fixture.js';

const code = (binding: string) => ({ kind: 'code' as const, owner: 'fixture/branch', file: 'provider.ts', binding });

describe('RetainedSession.explorerDetails', () => {
  it('delegates described, truncated and per-symbol unavailable results to the retained provider with fixed bounds', async () => {
    const properties = Array.from({ length: 400 }, (_, index) => `readonly property${String(index).padStart(3, '0')}: string;`).join('\n');
    await fixture(async (_root, inputs) => {
      const { handle, revision } = await opened(inputs);
      try {
        const requests: readonly SymbolDetailRequest[] = [
          { original: code('value'), exportName: 'value' },
          { original: code('Huge'), exportName: 'Huge' },
          { original: code('missing'), exportName: 'missing' },
          { original: code('value'), exportName: 'value' },
        ];
        const outcome = await handle.explorerDetails(revision.sequence, requests);
        expect(outcome.status).toBe('ready');
        if (outcome.status !== 'ready') throw new Error(JSON.stringify(outcome));
        expect(outcome.sequence).toBe(revision.sequence);
        expect(outcome.details).toHaveLength(3);
        expect(outcome.details[0]).toMatchObject({ state: 'described', original: code('value'), exportName: 'value', signature: 'const value: 1' });
        expect(outcome.details[1]).toMatchObject({ state: 'truncated', original: code('Huge'), exportName: 'Huge', truncated: expect.arrayContaining(['signature']) });
        expect(Buffer.byteLength('signature' in outcome.details[1]! ? outcome.details[1]!.signature : '', 'utf8')).toBeLessThanOrEqual(2048);
        expect(outcome.details[2]).toEqual({ state: 'unavailable', original: code('missing'), exportName: 'missing', reason: 'missing-export' });

        const tooMany = Array.from({ length: 51 }, (_, index) => ({ original: code('value'), exportName: `value${index}` }));
        expect(await handle.explorerDetails(revision.sequence, tooMany)).toMatchObject({ status: 'unavailable', reason: 'resource-limit' });
        expect(await handle.explorerDetails(revision.sequence + 1, requests)).toEqual({ status: 'superseded', sequence: revision.sequence });

        await handle.releaseCompiler();
        expect(await handle.explorerDetails(revision.sequence, requests)).toMatchObject({ status: 'unavailable', reason: 'compiler-released' });
      } finally { await handle.dispose(); }
    }, { [paths.provider]: `export const value = 1;\nexport interface Huge {\n${properties}\n}\n` });
  }, timeout);

  it('serializes the sequence check behind an in-flight mutation and never substitutes newer details', async () => {
    await fixture(async (root, inputs) => {
      const { handle, revision } = await opened(inputs);
      try {
        await put(root, paths.provider, 'export const value = 2;\n');
        const update = handle.update([{ path: paths.provider, kind: 'changed' }]);
        const details = handle.explorerDetails(revision.sequence, [{ original: code('value'), exportName: 'value' }]);
        const [updated, outcome] = await Promise.all([update, details]);
        expect(updated.status).toBe('revised');
        expect(outcome).toEqual({ status: 'superseded', sequence: revision.sequence + 1 });
      } finally { await handle.dispose(); }
    });
  }, timeout);
});
