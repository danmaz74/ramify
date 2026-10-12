import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { decodeMessage, encodeJsonFrame, validateServiceReply } from '../codec.js';
import type { ServiceError } from '../../../../src/interfaces/service.js';
import type { CheckOutcome } from '../context-types.js';

const recovery = { schemaVersion: 'ramify.recovery/1', lastCompleted: null,
  changes: { paths: [], coverage: 'unavailable', reason: 'no-completed-baseline' } } as const;
const noReport: CheckOutcome = { status: 'unavailable', requestId: 'q', reason: 'analysis-failed', message: 'Compiler stopped' };
const serviceError: ServiceError = { code: 'internal-error', message: 'Compiler stopped', details: {} };
const diagnostic = { id: 'producer:missing', category: 'missing-export', code: 'missing-export',
  message: 'Export is missing', location: { file: 'src/index.ts', start: 4, end: 8, line: 1, column: 5 },
  related: [{ file: 'subs/owner/src/api.ts', start: 1, end: 2, line: 1, column: 2 }],
  importer: { owner: 'example', kind: 'ordinary', root: 'src', profile: [] },
  original: { kind: 'code', owner: 'example', file: 'src/index.ts', binding: 'value' }, accessId: 'access:1' };
const stages = [{ stage: 'link', status: 'invalid', blockedBy: [], diagnosticIds: ['producer:missing'] }];

describe('FR02 IPC carrier fixtures and frozen /2 rejection witnesses', () => {
  it('keeps value.recovery and error.recovery distinct, with no evidence in scalar details', () => {
    const reported = { ok: true, value: { ...noReport, diagnostics: [], recovery } };
    const failed = { ok: false, error: { ...serviceError, diagnostics: [], recovery } };
    expect(() => validateServiceReply('check', reported)).not.toThrow();
    expect(decodeMessage(encodeJsonFrame({ type: 'response', id: 'q', result: reported }, 4096)))
      .toEqual({ type: 'response', id: 'q', result: reported });
    expect(decodeMessage(encodeJsonFrame({ type: 'response', id: 'q', result: failed }, 4096)))
      .toEqual({ type: 'response', id: 'q', result: failed });
    expect(reported.value.recovery).toEqual(failed.error.recovery);
    expect(failed.error.details).toEqual({});
    const malformed = { ok: false, error: { ...serviceError, details: { recovery } } };
    expect(() => decodeMessage(encodeJsonFrame({ type: 'response', id: 'q', result: malformed }, 4096))).toThrow('schema');
  });
  it('freezes the old /2 error and check-unavailable documents independently of new examples', async () => {
    const old = JSON.parse(await readFile(new URL('./fixtures/ipc-v2-frozen.json', import.meta.url), 'utf8'));
    expect(old).toEqual({ protocol: 'ramify.ipc/2', check: { ok: true, value: noReport }, error: { ok: false, error: serviceError } });
    expect(() => validateServiceReply('check', old.check)).not.toThrow();
    expect(() => decodeMessage(encodeJsonFrame({ type: 'response', id: 'q', result: old.error }, 4096))).not.toThrow();
    // Optional fields can be absent on /3; the old peer itself is refused at the handshake.
    expect(() => validateServiceReply('check', { ok: true, value: { ...noReport, recovery } })).not.toThrow();
    expect(() => decodeMessage(encodeJsonFrame({ type: 'response', id: 'q', result: { ok: false, error: { ...serviceError, recovery } } }, 4096))).not.toThrow();
  });
  it('FR09/FR18: preserves located producer records through both /3 carriers and rejects malformed evidence', () => {
    const value = { ok: true, value: { ...noReport, diagnostics: [diagnostic], stages, recovery } };
    const error = { ok: false, error: { ...serviceError, diagnostics: [diagnostic], stages, recovery } };
    expect(() => validateServiceReply('check', value)).not.toThrow();
    for (const result of [value, error]) expect(decodeMessage(encodeJsonFrame({ type: 'response', id: 'q', result }, 8192)))
      .toEqual({ type: 'response', id: 'q', result });
    const malformed = [
      { ...recovery, changes: { ...recovery.changes, paths: ['b.ts', 'a.ts'] } },
      { ...recovery, changes: { ...recovery.changes, paths: ['a.ts', 'a.ts'] } },
      { ...recovery, changes: { ...recovery.changes, paths: ['src/../a.ts'] } },
      { ...recovery, changes: { ...recovery.changes, paths: Array.from({ length: 10_001 }, (_, i) => `src/f${String(i).padStart(5, '0')}.ts`) } },
      { ...recovery, changes: { ...recovery.changes, reason: 7 } },
      { ...recovery, lastCompleted: { context: `ctx/1:${'a'.repeat(64)}`,
        generation: 'gen/1:11111111-1111-4111-8111-111111111111',
        revision: 'rev/1:22222222-2222-4222-8222-222222222222:1', inputId: 'producer-input' } },
    ];
    for (const invalid of malformed) {
      expect(() => validateServiceReply('check', { ok: true, value: { ...noReport, recovery: invalid } })).toThrow('schema');
      expect(() => decodeMessage(encodeJsonFrame({ type: 'response', id: 'q', result: {
        ok: false, error: { ...serviceError, recovery: invalid } } }, 1024 * 1024))).toThrow('schema');
    }
    for (const invalid of [
      { ...diagnostic, code: 'invented-code' }, { ...diagnostic, location: { ...diagnostic.location, line: 0 } },
      { ...diagnostic, related: [{ file: 'src/index.ts', start: 2 }] }, { ...diagnostic, importer: { ...diagnostic.importer, kind: 'other' } },
    ]) expect(() => validateServiceReply('check', { ok: true, value: { ...noReport, diagnostics: [invalid] } })).toThrow('schema');
    expect(() => validateServiceReply('check', { ok: true, value: { ...noReport, stages: [{ ...stages[0], stage: 'invented' }] } })).toThrow('schema');
    expect(() => validateServiceReply('check', { ok: true, value: { ...noReport, diagnostics: [], stages } })).toThrow('schema');
  });
  it('accepts a future nonempty recovery reason as text', () => {
    const future = { ...recovery, changes: { ...recovery.changes,
      reason: 'future-observation-gap:detail' } };
    expect(() => validateServiceReply('check', { ok: true, value: { ...noReport, recovery: future } })).not.toThrow();
  });
});
