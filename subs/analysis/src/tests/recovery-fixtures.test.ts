import { describe, expect, it } from 'vitest';
import { acquireInventory } from '../inventory.js';
import { analyzeProject } from '../analyze-project.js';
import { recoverySmallFiles, recoverySmallPaths, withRecoverySmall } from './recovery-fixtures.js';

describe('iteration 1 recovery-small builder qualification', () => {
  it('provides isolated valid, removed-export and repaired states for iteration 2', async () => withRecoverySmall(async fixture => {
    const valid = await analyzeProject(fixture.analysisInputs);
    expect(valid.status).toBe('reported');
    if (valid.status !== 'reported') throw new Error('Valid fixture was cancelled');
    expect(valid.report.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'complete' });
    expect(valid.report.diagnostics).toEqual([]);
    const before = await acquireInventory(fixture.inventoryInputs);
    expect(before.status).toBe('completed');
    await fixture.removeExports();
    const inventory = await acquireInventory(fixture.inventoryInputs);
    expect(inventory.status).toBe('completed');
    if (before.status !== 'completed' || inventory.status !== 'completed') throw new Error('Fixture acquisition failed');
    expect(inventory.snapshot.inventory.scope.ownership).toEqual(before.snapshot.inventory.scope.ownership);
    expect(inventory.snapshot.inputId).not.toBe(before.snapshot.inputId);
    const invalid = await analyzeProject(fixture.analysisInputs);
    expect(invalid.status).toBe('reported');
    if (invalid.status !== 'reported') throw new Error('Invalid fixture was cancelled');
    expect(invalid.report.outcome.execution).toBe('invalid');
    const missing = invalid.report.diagnostics.filter(value => value.code === 'missing-export');
    expect(missing).toHaveLength(2);
    expect(missing.every(value => value.location?.file === recoverySmallPaths.providerDescription)).toBe(true);
    expect(missing.some(value => value.message.includes('first'))).toBe(true);
    expect(missing.some(value => value.message.includes('second'))).toBe(true);
    await fixture.repair();
    const repaired = await analyzeProject(fixture.analysisInputs);
    expect(repaired.status === 'reported' && repaired.report.outcome.execution).toBe('completed');
  }), 30_000);
  it('returns a fresh file map for every isolated fixture', () => {
    const copy = recoverySmallFiles(); copy[recoverySmallPaths.provider] = 'export {};';
    expect(recoverySmallFiles()[recoverySmallPaths.provider]).toBe('export const first: number = 1;\nexport const second: number = 2;\n');
  });
});
