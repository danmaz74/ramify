import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { capabilityDescriptions, capabilityOrder, referenceCases } from './cases.js';
import type { CaseAuthority, CaseMode, ImplementationStatus, WitnessKind } from './cases.js';

/**
 * The inventory against the catalogue it inventories.
 *
 * Nothing here checks Ramify: it checks that the harness data still describes
 * every case family the plan defines, that each record is filled in, and that
 * every pointer it makes at the baseline resolves to a file that exists. A
 * family added to the catalogue fails this suite until it has a record, which
 * is what keeps a case from disappearing into an exclusion.
 */

/** The Ramify repository root, which every recorded path is relative to. */
const repositoryRoot = new URL('../../', import.meta.url);

function readRepositoryFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, repositoryRoot), 'utf8');
}

/** Every case-family id in the catalogue, in the order its tables list them. */
function catalogueFamilyIds(): string[] {
  const catalogue = readRepositoryFile('docs/plans/reference-project/cases.md');
  const ids: string[] = [];

  for (const line of catalogue.split('\n')) {
    const match = /^\|\s*([A-Z]\d{2})\s*\|/.exec(line);

    if (match) {
      ids.push(match[1]);
    }
  }

  return ids;
}

/** Every statement id the contract map defines. */
function mapStatementIds(): Set<string> {
  const map = readRepositoryFile('docs/plans/reference-project/contract-map.md');
  const ids = new Set<string>();

  for (const line of map.split('\n')) {
    const match = /^\|\s*([A-Z]+\d+)\s*\|/.exec(line);

    if (match) {
      ids.add(match[1]);
    }
  }

  return ids;
}

const modes: readonly CaseMode[] = ['B', 'M', 'C', 'H', 'P', 'E'];
const authorities: readonly CaseAuthority[] = ['A', 'D', 'P', 'E'];
const implementations: readonly ImplementationStatus[] = [
  'available',
  'absent',
  'deliberately-unsupported',
];
const witnessKinds: readonly WitnessKind[] = [
  'baseline-source',
  'baseline-declaration',
  'document',
];

describe('the inventory covers the catalogue', () => {
  const catalogueIds = catalogueFamilyIds();

  it('reads a plausible set of families out of the catalogue', () => {
    // A broken parse would otherwise make the comparison below pass trivially.
    expect(catalogueIds.length).toBeGreaterThanOrEqual(60);
    expect(new Set(catalogueIds).size).toBe(catalogueIds.length);
  });

  it('holds exactly one record per family, in the catalogue’s order', () => {
    expect(referenceCases.map((record) => record.id)).toEqual(catalogueIds);
  });

  it('names every family exactly once', () => {
    const ids = referenceCases.map((record) => record.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('every record is well formed', () => {
  it.each(referenceCases.map((record) => [record.id, record] as const))(
    '%s',
    (_id, record) => {
      expect(record.id).toMatch(/^[A-Z]\d{2}$/);

      expect(record.intent.trim()).toBe(record.intent);
      expect(record.intent.length).toBeGreaterThan(15);
      expect(record.intent.length).toBeLessThanOrEqual(90);
      expect(record.intent).not.toContain('\n');

      expect(record.mode.length).toBeGreaterThan(0);
      expect(new Set(record.mode).size).toBe(record.mode.length);
      for (const mode of record.mode) {
        expect(modes).toContain(mode);
      }

      expect(record.authority.length).toBeGreaterThan(0);
      expect(new Set(record.authority).size).toBe(record.authority.length);
      for (const authority of record.authority) {
        expect(authorities).toContain(authority);
      }

      expect(record.entry.length).toBeGreaterThan(30);
      expect(record.expected.length).toBeGreaterThan(30);
      expect(record.coverageNotes.length).toBeGreaterThan(20);

      expect(capabilityOrder).toContain(record.capability);
      expect(capabilityDescriptions[record.capability].length).toBeGreaterThan(10);
      expect(implementations).toContain(record.implementation);
    },
  );
});

describe('every baseline witness resolves', () => {
  const statements = mapStatementIds();

  it.each(referenceCases.map((record) => [record.id, record] as const))(
    '%s',
    (_id, record) => {
      const witness = record.baselineWitness;

      expect(witnessKinds).toContain(witness.kind);
      expect(witness.note.length).toBeGreaterThan(20);
      expect(witness.paths.length).toBeGreaterThan(0);

      for (const path of witness.paths) {
        expect(path.startsWith('/')).toBe(false);
        expect(existsSync(new URL(path, repositoryRoot))).toBe(true);
      }

      if (witness.statements) {
        expect(witness.statements.length).toBeGreaterThan(0);
        expect(new Set(witness.statements).size).toBe(witness.statements.length);

        for (const statement of witness.statements) {
          expect(statements).toContain(statement);
        }
      }
    },
  );
});

describe('the inventory stays honest about implementation status', () => {
  it('claims availability only for the two executed tiers', () => {
    const available = referenceCases.filter((record) => record.implementation === 'available');

    expect(available.length).toBeGreaterThan(0);
    for (const record of available) {
      expect(['application', 'protocol']).toContain(record.capability);
    }
  });

  it('reports every unimplemented capability as absent', () => {
    const unimplemented = referenceCases.filter((record) =>
      (
        [
          'model',
          'source-areas',
          'custom-registry',
          'loader',
          'resolver',
          'source-form',
          'browser',
          'host-adapter',
          'probe',
        ] as const
      ).some((capability) => capability === record.capability),
    );

    for (const record of unimplemented) {
      expect(record.implementation).toBe('absent');
    }
  });

  it('records separate responsibilities as deliberately unsupported', () => {
    for (const record of referenceCases) {
      if (record.capability === 'separate-responsibility') {
        expect(record.implementation).toBe('deliberately-unsupported');
        expect(record.authority).toContain('E');
      }
    }
  });

  it('leaves every probe undecided', () => {
    const probes = referenceCases.filter((record) => record.capability === 'probe');

    expect(probes.map((record) => record.id)).toEqual(['P01', 'P02', 'P03', 'P04', 'P05', 'P06']);
    for (const record of probes) {
      expect(record.authority).toEqual(['P']);
      expect(record.implementation).not.toBe('available');
    }
  });
});
