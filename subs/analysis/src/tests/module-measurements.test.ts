import { describe, expect, it } from 'vitest';
import type { InventoryModule } from '../../subs/project/src/interfaces/project.js';
import {
  measureContextSize,
  resolveDocumentationFiles,
  type ResolvedMeasurementFile,
} from '../module-measurements.js';

const file = (path: string, owner: string, area: 'ordinary' | 'tests', classification: 'production' | 'tests',
  kind: 'source' | 'resource', bytes: number): ResolvedMeasurementFile =>
  ({ path, owner, area, classification, kind, bytes });

const modules = [
  { id: 'app', directory: '.', purpose: { state: 'present', readme: 'README.md', paragraph: 'App.' } },
  { id: 'app/no-readme', directory: 'subs/no-readme', purpose: { state: 'missing-file', readme: 'subs/no-readme/README.md' } },
] as unknown as InventoryModule[];
const inputs = [
  { path: 'module.ramify', role: 'description' as const, sha256: 'a', bytes: 11 },
  { path: 'README.md', role: 'readme' as const, sha256: 'b', bytes: 17 },
  { path: 'subs/no-readme/module.ramify', role: 'description' as const, sha256: 'c', bytes: 13 },
  { path: 'subs/no-readme/README.md', role: 'readme' as const, sha256: 'd', bytes: 0 },
];

describe('module context-size arithmetic', () => {
  it('counts resolved production, testing, resource and documentation records without overlap', () => {
    const documentation = resolveDocumentationFiles(modules, inputs);
    expect(documentation).toEqual({ status: 'resolved', files: [
      { path: 'module.ramify', owner: 'app', area: 'documentation', kind: 'documentation', bytes: 11 },
      { path: 'README.md', owner: 'app', area: 'documentation', kind: 'documentation', bytes: 17 },
      { path: 'subs/no-readme/module.ramify', owner: 'app/no-readme', area: 'documentation', kind: 'documentation', bytes: 13 },
    ] });
    if (documentation.status !== 'resolved') throw new Error(documentation.message);
    const records = [
      file('src/main.ts', 'app', 'ordinary', 'production', 'source', 100),
      file('src/guide.md', 'app', 'ordinary', 'production', 'resource', 7),
      file('src/tests/main.test.ts', 'app', 'tests', 'tests', 'source', 30),
      file('subs/testing/src/probe.ts', 'app/testing', 'ordinary', 'tests', 'source', 40),
      file('subs/testing/src/data.json', 'app/testing', 'ordinary', 'tests', 'resource', 9),
      file('subs/resource/src/data.json', 'app/resource', 'ordinary', 'production', 'resource', 5),
    ];
    expect(measureContextSize(records, documentation.files, new Set(['app']))).toEqual({
      production: { sourceFiles: 1, sourceBytes: 100, resourceFiles: 1, resourceBytes: 7 },
      tests: { sourceFiles: 1, sourceBytes: 30, resourceFiles: 0, resourceBytes: 0 },
      documentation: { files: 2, bytes: 28 },
    });
    expect(measureContextSize(records, documentation.files,
      new Set(['app', 'app/testing', 'app/resource', 'app/empty', 'app/no-readme']))).toEqual({
      production: { sourceFiles: 1, sourceBytes: 100, resourceFiles: 2, resourceBytes: 12 },
      tests: { sourceFiles: 2, sourceBytes: 70, resourceFiles: 1, resourceBytes: 9 },
      documentation: { files: 3, bytes: 41 },
    });

    const owners = ['app', 'app/testing', 'app/resource', 'app/empty'];
    const inferred = Object.fromEntries(owners.map(owner => {
      const own = records.filter(record => record.owner === owner);
      if (!own.some(record => record.area === 'ordinary')) return [owner, undefined];
      const buckets = measureContextSize(records, [], new Set([owner]));
      const productionFiles = buckets.production.sourceFiles + buckets.production.resourceFiles;
      return [owner, productionFiles > 0 ? 'production' : 'tests'];
    }));
    expect(inferred).toEqual({ app: 'production', 'app/testing': 'tests', 'app/resource': 'production', 'app/empty': undefined });
  });

  it('refuses documentation totals without every revision-bound capture', () => {
    expect(resolveDocumentationFiles(modules, inputs.filter(input => input.path !== 'README.md')))
      .toEqual({ status: 'unavailable', message: 'The revision captured no README input for README.md' });
  });

  it('uses the retained missing-file purpose as absence evidence without requiring a zero-byte README capture', () => {
    expect(resolveDocumentationFiles(modules, inputs.filter(input => input.path !== 'subs/no-readme/README.md')))
      .toEqual({ status: 'resolved', files: [
        { path: 'module.ramify', owner: 'app', area: 'documentation', kind: 'documentation', bytes: 11 },
        { path: 'README.md', owner: 'app', area: 'documentation', kind: 'documentation', bytes: 17 },
        { path: 'subs/no-readme/module.ramify', owner: 'app/no-readme', area: 'documentation', kind: 'documentation', bytes: 13 },
      ] });
  });
});
