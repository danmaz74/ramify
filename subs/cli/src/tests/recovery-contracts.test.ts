import { ownershipDocumentSchema } from '../ownership-schema.js';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { FrozenCheckDocument } from './recovery-contract-fixtures.js';
import { answeredOwnership, contextualFailure, invocationFailure, locatedDiagnostics, noBaseline, overflow,
  ownershipFailures, producedStages, rejectedOwnershipExamples } from './recovery-contract-fixtures.js';
import type { ProposedCheckDocument } from './recovery-contract-fixtures.js';
import { checkDocumentSchema, cliFailureDocumentSchema } from './response-schema.js';

const readFixture = async (name: string): Promise<unknown> => JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const fields = (value: object): string[] => Object.keys(value).sort();

describe('FR01 production ownership decoder', () => {
  it('has all four independent status/exit variants with answer-only fields omitted on failures', () => {
    expect([answeredOwnership, ...ownershipFailures].map(value => [value.status, value.exitCode])).toEqual([
      ['answered', 0], ['invalid', 1], ['incomplete', 2], ['unavailable', 2],
    ]);
    expect(fields(answeredOwnership)).toEqual(['exitCode', 'inputId', 'paths', 'ramifyVersion', 'root', 'schemaVersion', 'scope', 'status', 'warnings']);
    expect(fields(answeredOwnership.scope)).toEqual(['configuration', 'ownership']);
    for (const value of ownershipFailures) {
      for (const key of ['scope', 'inputId', 'paths', 'warnings', 'recovery']) expect(value).not.toHaveProperty(key);
      expect(value).toHaveProperty('diagnostics');
    }
    for (const value of [answeredOwnership, ...ownershipFailures]) expect(ownershipDocumentSchema.parse(value)).toEqual(value);
    expect(ownershipFailures[2]!.root).toBeNull();
    expect(answeredOwnership.paths.map(value => value.ownership.status)).toEqual(['owned', 'outside-project', 'excluded']);
  });

  it('rejects each invalid exit/omission example through the production decoder', () => {
    expect(rejectedOwnershipExamples.map(value => value.variant)).toEqual([
      'answered-wrong-exit', 'invalid-wrong-exit', 'incomplete-wrong-exit', 'unavailable-wrong-exit',
      'failure-plus-scope', 'failure-plus-inputId', 'failure-plus-paths', 'ownership-plus-recovery', 'failure-plus-recovery', 'ownership-plus-selection',
    ]);
    for (const example of rejectedOwnershipExamples) expect(ownershipDocumentSchema.safeParse(example.value).success, example.variant).toBe(false);
  });
});

describe('FR01 nested record strictness', () => {
  it.each([
    ['warning-code', { ...answeredOwnership, warnings: [{ code: 'unknown', path: '.', message: 'bad' }] }],
    ['module-field', { ...answeredOwnership, scope: { ...answeredOwnership.scope,
      ownership: { ...answeredOwnership.scope.ownership, modules: [{ id: 'root', parent: null, directory: '.', extra: true }] } } }],
    ['unowned-owner', { ...answeredOwnership, paths: [{ path: 'dist/x', ownership: { status: 'excluded', module: null,
      exclusion: { kind: 'output', directory: 'dist', owner: 'root' } } }] }],
    ['diagnostic-code', { ...ownershipFailures[0], diagnostics: [{ ...locatedDiagnostics[0], code: 'unknown' }] }],
    ['diagnostic-related', { ...ownershipFailures[0], diagnostics: [{ ...locatedDiagnostics[0], related: [{ file: 'x' }] }] }],
    ['diagnostic-field', { ...ownershipFailures[0], diagnostics: [{ ...locatedDiagnostics[0], extra: true }] }],
    ['stage-id', { ...ownershipFailures[0], stages: [{ stage: 'unknown', status: 'completed', blockedBy: [], diagnosticIds: [] }] }],
  ])('rejects %s', (_variant, value) => {
    expect(ownershipDocumentSchema.safeParse(value).success).toBe(false);
  });
});

describe('FR02 reviewed carriers and frozen old examples', () => {
  it('preserves every Check/3 field while separately creating Check/4 invalid/not-checked examples', async () => {
    const old = await readFixture('check-v3-frozen.json') as FrozenCheckDocument;
    expect(old.schemaVersion).toBe('ramify.check/3');
    expect(old).not.toHaveProperty('recovery'); expect(old).not.toHaveProperty('stages');
    const invalid: ProposedCheckDocument = { ...old, schemaVersion: 'ramify.check/4', execution: 'invalid', reason: null,
      outcome: 'checked', exitCode: 1, findings: locatedDiagnostics.map(value => ({ ...value, new: false })), stages: producedStages, recovery: overflow };
    const notChecked: ProposedCheckDocument = { ...old, schemaVersion: 'ramify.check/4', recovery: noBaseline };
    for (const value of [invalid, notChecked]) for (const key of fields(old).filter(key => key !== 'schemaVersion')) expect(value).toHaveProperty(key);
    expect(invalid.findings.map(({ new: _new, ...value }) => value)).toEqual(locatedDiagnostics);
    expect(notChecked.exitCode).toBe(2);
    expect(checkDocumentSchema.parse(invalid)).toEqual(invalid);
    expect(checkDocumentSchema.parse(notChecked)).toEqual(notChecked);
    expect(checkDocumentSchema.safeParse(old).success).toBe(false);
    // The frozen strict key sets are historical schema witnesses, not a new runtime decoder.
    expect(fields(invalid).filter(key => !fields(old).includes(key))).toEqual(['recovery', 'stages']);
  });

  it('keeps CLI/1 frozen and CLI/2 operation reasons alongside complete diagnostics', async () => {
    const old = await readFixture('cli-v1-frozen.json');
    expect(old).toEqual({ schemaVersion: 'ramify.cli/1', status: 'unavailable',
      diagnostics: [{ category: 'invocation', code: 'invalid-invocation', message: 'Unsupported argument: --bad' }], exitCode: 2 });
    expect(invocationFailure).not.toHaveProperty('recovery'); expect(invocationFailure).not.toHaveProperty('stages');
    expect(contextualFailure.diagnostics.slice(1)).toEqual(locatedDiagnostics);
    expect(contextualFailure.stages).toEqual(producedStages);
    expect(contextualFailure.recovery).toEqual(overflow);
    expect(cliFailureDocumentSchema.parse(contextualFailure)).toEqual(contextualFailure);
    expect(cliFailureDocumentSchema.parse(invocationFailure)).toEqual(invocationFailure);
    expect(cliFailureDocumentSchema.safeParse(old).success).toBe(false);
    expect(fields(contextualFailure).filter(key => !fields(old as object).includes(key))).toEqual(['recovery', 'stages']);
  });

  it('distinguishes unavailable baseline from observed overflow and retains byte-ordered paths', () => {
    expect(noBaseline).toEqual({ schemaVersion: 'ramify.recovery/1', lastCompleted: null,
      changes: { paths: [], coverage: 'unavailable', reason: 'no-completed-baseline' } });
    expect(overflow.lastCompleted).not.toBeNull();
    expect(overflow.changes.coverage).toBe('observed');
    expect(overflow.changes.reason).toBe('watcher-loss; path-overflow');
    expect(overflow.changes.paths).toEqual([...new Set(overflow.changes.paths)].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
  });

  it.each([
    ['identity', { ...overflow, lastCompleted: { ...overflow.lastCompleted, context: 'wrong' } }],
    ['generation-revision', { ...overflow, lastCompleted: { ...overflow.lastCompleted, revision: 'rev/1:22222222-2222-4222-8222-222222222222:1' } }],
    ['uncanonical-path', { ...overflow, changes: { ...overflow.changes, paths: ['src/../api.ts'] } }],
    ['duplicate-path', { ...overflow, changes: { ...overflow.changes, paths: ['src/a.ts', 'src/a.ts'] } }],
    ['missing-baseline-reason', { ...noBaseline, changes: { ...noBaseline.changes, reason: null } }],
    ['empty-gap-reason', { ...overflow, changes: { ...overflow.changes, reason: '' } }],
  ])('FR02 rejects %s recovery', (_variant, recovery) => {
    expect(cliFailureDocumentSchema.safeParse({ ...contextualFailure, recovery }).success).toBe(false);
  });

  it('FR02 rejects recovery on completed Check/4 and extra fields on either document', async () => {
    const old = await readFixture('check-v3-frozen.json') as FrozenCheckDocument;
    const completed = { ...old, schemaVersion: 'ramify.check/4', execution: 'completed', outcome: 'checked',
      reason: null, exitCode: 0, recovery: overflow };
    expect(checkDocumentSchema.safeParse(completed).success).toBe(false);
    const { recovery: _recovery, ...withoutRecovery } = completed;
    expect(checkDocumentSchema.safeParse(withoutRecovery).success).toBe(true);
    expect(checkDocumentSchema.safeParse({ ...withoutRecovery, extra: true }).success).toBe(false);
    expect(cliFailureDocumentSchema.safeParse({ ...contextualFailure, extra: true }).success).toBe(false);
    expect(cliFailureDocumentSchema.safeParse({ ...contextualFailure,
      diagnostics: [{ ...locatedDiagnostics[0], importer: { owner: 'recovery', kind: 'ordinary', root: '.', profile: [], extra: true } }] }).success).toBe(false);
  });

  it('FR20 permits recovery after a completed revision when later cleanup leaves the check not checked', async () => {
    const old = await readFixture('check-v3-frozen.json') as FrozenCheckDocument;
    const interrupted = { ...old, schemaVersion: 'ramify.check/4', execution: 'completed', outcome: 'not-checked',
      reason: 'unavailable', exitCode: 2, recovery: overflow };
    expect(checkDocumentSchema.parse(interrupted)).toEqual(interrupted);
  });
});
