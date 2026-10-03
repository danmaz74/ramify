import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { AnalysisReport } from '../../../analysis/src/interfaces/analysis.js';
import type { ContextRevision } from '../../../daemon/subs/contexts/src/interfaces/contexts.js';
import { createProjectExplorerModel, maximumProjectViewBytes } from '../project-view.js';

const location = (file: string, start = 0) => ({ file, start, end: start + 1, line: 1, column: start + 1 });
const area = (owner: string, root: string) => ({ owner, kind: 'ordinary' as const, root, profile: [] });
const providerArea = area('fixture/provider', 'subs/provider/src');
const consumerArea = area('fixture/consumer', 'subs/consumer/src');
const original = { kind: 'code' as const, owner: 'fixture/provider', file: 'api.ts', binding: 'Value' };
const providerOrigin = { file: 'subs/provider/src/api.ts', area: providerArea, auxiliary: false };
const consumerOrigin = { file: 'subs/consumer/src/use.ts', area: consumerArea, auxiliary: false };
const selection = (exportedName: string) => ({ location: location('subs/consumer/src/use.ts'), exportedName,
  localName: exportedName.toLowerCase(), original, request: 'value' as const, explicitType: false,
  forwarding: [{ file: 'src/index.ts', area: area('fixture', 'src'), auxiliary: false }], status: 'resolved' as const });
const access = (id: string, target: unknown, selections: readonly unknown[] = [], coverageIds: readonly string[] = []) => ({
  id, location: location('subs/consumer/src/use.ts'), importer: consumerOrigin, specifier: id,
  form: 'import' as const, selectionForm: selections.length ? 'named' as const : 'none' as const,
  runtimeLoad: true, target, selections, coverageIds,
});
const decision = (status: 'allowed' | 'denied', reason: 'exposed' | 'not-visible') => ({ status, reason });

function fixture(): { readonly report: AnalysisReport; readonly revision: ContextRevision } {
  const accesses = [
    access('application-limited', { kind: 'application', origin: providerOrigin }, [selection('Value'), selection('Alias')], ['coverage-edge']),
    access('application-denied', { kind: 'application', origin: providerOrigin }),
    access('application-same-owner', { kind: 'application', origin: consumerOrigin }),
    access('package', { kind: 'external', resolution: 'package', name: 'react', resolvedFile: '/node_modules/react/index.js' }),
    access('builtin', { kind: 'external', resolution: 'builtin', name: 'node:fs', resolvedFile: null }),
    access('standard', { kind: 'external', resolution: 'standard-library', name: 'lib.es2022', resolvedFile: null }),
    access('outside', { kind: 'outside-project', file: 'scripts/tool.ts' }),
    access('unresolved', { kind: 'unresolved' }, [], ['coverage-target']),
  ];
  const results = accesses.map(item => ({ accessId: item.id,
    decisions: item.id === 'application-denied' || item.id === 'application-same-owner'
      ? [decision('denied', 'not-visible')] : [decision('allowed', 'exposed')],
    outcome: 'checked' as const, diagnostics: [], coverage: item.coverageIds }));
  const limits = [
    { id: 'coverage-edge', code: 'incomplete-exports' as const, location: location('subs/consumer/src/use.ts'), message: 'edge', related: [] },
    { id: 'coverage-target', code: 'unresolved-target' as const, location: location('subs/consumer/src/use.ts', 2), message: 'target', related: [] },
    { id: 'coverage-global', code: 'compiler-blocked' as const, location: location('generated/unknown.ts'), message: 'global', related: [] },
  ];
  const registry = { id: 'registry/1:fixture', definitions: [
    { name: 'dispatch', kind: 'required-importer' as const }, { name: 'browser', kind: 'required-symbol' as const },
  ], isDefault: false };
  const report = {
    schemaVersion: 'ramify.analysis/2', runId: 'run/1:fixture', inputId: 'input/1:fixture',
    request: { project: { cwd: '/fixture', root: '/fixture', scope: 'whole-project', configuration: 'discover' },
      registry, capabilities: [], limits: { acquisition: { attempts: 1, maxFiles: 100, maxApplicationFiles: 100,
        maxFileBytes: 1000, maxInputBytes: 1000, maxApplicationBytes: 1000, maxOwners: 10, maxDepth: 10, deadlineMs: 1000 },
      source: { maxExports: 100, maxAccesses: 100, maxSelections: 100, maxForwardingDepth: 10, deadlineMs: 1000 },
      maxExposurePairs: 100, maxDiagnostics: 100, maxReportBytes: 32 * 1024 ** 2, disposeTimeoutMs: 1000, deadlineMs: 1000 } },
    scope: { root: '/fixture', selection: 'given', invokedFrom: '/fixture', configuration: 'tsconfig.json', walkedAreas: [], independentScopes: [], ownership: { modules: [], exclusions: [] } },
    registry, capabilities: [], stages: [{ stage: 'report', status: 'completed', blockedBy: [], diagnosticIds: [] }],
    outcome: { execution: 'completed', check: 'failed', coverage: 'partial' }, diagnostics: [], warnings: [], coverage: limits,
    summary: { complete: true, owners: 3, sourceFiles: 3, resources: 1, originals: 1, accesses: 8,
      allowed: 6, denied: 2, errors: 1, warnings: 0, coverageNotes: 3, external: 3 },
    snapshot: {
      inventory: { scope: { root: '/fixture', selection: 'given', invokedFrom: '/fixture', configuration: 'tsconfig.json', walkedAreas: [], independentScopes: [], ownership: { modules: [], exclusions: [] } },
        modules: [
          { id: 'fixture', name: 'fixture', parent: null, directory: '.', headerTags: [], areas: [{ owner: 'fixture', kind: 'ordinary', root: 'src', present: true }], purpose: { state: 'present', readme: 'README.md', paragraph: 'Root.' }, description: {} },
          { id: 'fixture/consumer', name: 'consumer', parent: 'fixture', directory: 'subs/consumer', headerTags: ['dispatch'], areas: [{ ...consumerArea, present: true }], purpose: { state: 'missing-file', readme: 'subs/consumer/README.md' }, description: {} },
          { id: 'fixture/provider', name: 'provider', parent: 'fixture', directory: 'subs/provider', headerTags: ['browser'], areas: [{ ...providerArea, present: true }], purpose: { state: 'present', readme: 'subs/provider/README.md', paragraph: 'Provider.' }, description: {} },
        ],
        files: [
          { path: 'src/index.ts', owner: 'fixture', area: 'ordinary', kind: 'source', sha256: 'a', bytes: 1 },
          { path: 'subs/consumer/src/use.ts', owner: 'fixture/consumer', area: 'ordinary', kind: 'source', sha256: 'b', bytes: 1 },
          { path: 'subs/provider/src/api.ts', owner: 'fixture/provider', area: 'ordinary', kind: 'source', sha256: 'c', bytes: 1 },
          { path: 'subs/provider/src/data.json', owner: 'fixture/provider', area: 'ordinary', kind: 'resource', sha256: 'd', bytes: 1 },
        ], references: [], outsideModuleFiles: [], warnings: [] },
      areas: [area('fixture', 'src'), consumerArea, providerArea], inputs: [],
      catalog: { originals: [{ id: original, origin: providerOrigin, declarations: [location('subs/provider/src/api.ts')], hasValue: true, hasType: true }],
        files: [{ file: 'subs/provider/src/api.ts', state: 'complete', issueIds: [], descriptionFiles: [], exports: [
          { name: 'Value', original, namespace: null, forwarding: [] }, { name: 'Alias', original, namespace: null, forwarding: [providerOrigin] },
          { name: 'Missing', original: null, namespace: null, forwarding: [] },
        ] }], coverage: [] }, linked: null,
      model: { registry, modules: [
        { id: 'fixture', name: 'fixture', parent: null, headerTags: [], areas: [area('fixture', 'src')] },
        { id: 'fixture/consumer', name: 'consumer', parent: 'fixture', headerTags: ['dispatch'], areas: [consumerArea] },
        { id: 'fixture/provider', name: 'provider', parent: 'fixture', headerTags: ['browser'], areas: [providerArea] },
      ], originals: [{ id: original, origin: providerOrigin, declarations: [location('subs/provider/src/api.ts')], hasValue: true, hasType: true,
        tags: ['browser'], tagEvidence: [location('subs/provider/module.ramify')] }],
      exposures: [{ module: 'fixture/provider', original, names: ['Value', 'Alias'], destinations: ['parent'], evidence: [location('subs/provider/module.ramify')], provider: null, effective: true },
        { module: 'fixture', original, names: ['Value'], destinations: ['descendants'], evidence: [location('module.ramify')], provider: 'fixture/provider', effective: true }] },
      accesses, results,
    },
  } as unknown as AnalysisReport;
  const revision = { revision: 'rev/1:00000000-0000-0000-0000-000000000001:1', sequence: 1,
    fingerprints: { inputId: 'input/1:fixture' } } as unknown as ContextRevision;
  return { report, revision };
}

function collectJson(value: unknown, keys: Set<string>, strings: Set<string>): void {
  if (typeof value === 'string') {
    strings.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJson(item, keys, strings);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    keys.add(key);
    collectJson(item, keys, strings);
  }
}

describe('createProjectExplorerModel', () => {
  it('projects only cross-owner application accesses while preserving exports and truthful coverage', () => {
    const input = fixture();
    const reportAccesses = input.report.snapshot!.accesses;
    expect(reportAccesses).toHaveLength(8);
    expect(reportAccesses.filter(item => item.target.kind === 'application')).toHaveLength(3);
    expect(reportAccesses.filter(item => item.target.kind === 'application'
      && item.importer.area.owner !== item.target.origin.area.owner)).toHaveLength(2);
    expect(reportAccesses.filter(item => item.target.kind === 'application'
      && item.importer.area.owner === item.target.origin.area.owner)).toHaveLength(1);
    expect(reportAccesses.filter(item => item.target.kind === 'external')
      .map(item => item.target.kind === 'external' ? item.target.resolution : null)).toEqual([
        'package', 'builtin', 'standard-library',
      ]);
    expect(reportAccesses.filter(item => item.target.kind === 'outside-project')).toHaveLength(1);
    expect(reportAccesses.filter(item => item.target.kind === 'unresolved')).toHaveLength(1);
    const omittedTargetLabels = reportAccesses.flatMap(item => item.target.kind === 'external'
      ? [item.target.name]
      : item.target.kind === 'outside-project' ? [item.target.file]
        : item.target.kind === 'unresolved' ? ['unresolved'] : []);
    expect(omittedTargetLabels).toEqual(['react', 'node:fs', 'lib.es2022', 'scripts/tool.ts', 'unresolved']);
    expect(reportAccesses.find(item => item.id === 'unresolved')?.coverageIds).toEqual(['coverage-target']);
    expect(input.report.snapshot!.results.find(item => item.accessId === 'application-same-owner')?.decisions)
      .toEqual([decision('denied', 'not-visible')]);
    const first = createProjectExplorerModel(input);
    const second = createProjectExplorerModel({ revision: input.revision, report: structuredClone(input.report) });
    expect(second).toEqual(first);
    expect(first.status).toBe('ready');
    if (first.status !== 'ready') throw new Error(first.reason);
    const encoded = JSON.stringify(first.view);
    const roundTripped = JSON.parse(encoded) as unknown;
    expect(roundTripped).toEqual(first.view);
    const encodedBytes = Buffer.byteLength(encoded, 'utf8');
    // Each of the two projected selections carries one forwarding origin, and
    // each origin's `,"auxiliary":false` member adds 18 bytes.
    expect(encodedBytes).toBe(5_880 + 2 * 18);
    expect(encodedBytes).toBeLessThanOrEqual(8_485);
    const serializedKeys = new Set<string>();
    const serializedStrings = new Set<string>();
    collectJson(roundTripped, serializedKeys, serializedStrings);
    expect(serializedKeys).not.toContain('otherTargets');
    expect(serializedKeys).not.toContain('targetIds');
    for (const label of omittedTargetLabels) expect(serializedStrings).not.toContain(label);
    expect(serializedStrings).toContain('application-limited');
    expect(serializedStrings).toContain('application-denied');
    for (const id of ['application-same-owner', 'package', 'builtin', 'standard', 'outside', 'unresolved']) {
      expect(serializedStrings).not.toContain(id);
    }
    expect(first.view).toMatchObject({ state: 'partial', rootModuleId: 'fixture', summary: {
      owners: 3, ownedFiles: 4, edges: 1, accessOccurrences: 2,
      selectedSymbols: 2, deniedAccesses: 1, limitedAccesses: 1, coverageNotes: 3,
    } });
    expect(first.view.revision).toBe(input.revision.revision);
    expect(first.view.registry).toEqual(input.report.registry);
    expect(first.view.edges[0]).toMatchObject({ consumer: 'fixture/consumer', provider: 'fixture/provider',
      accessCount: 2, symbolCount: 2, status: 'denied', reasons: ['exposed', 'not-visible'], coverageIds: ['coverage-edge'] });
    expect(first.view.edges[0]!.accesses.map(item => item.id)).toEqual(['application-denied', 'application-limited']);
    expect(first.view.edges[0]!.accesses[0]).toMatchObject({ targetFile: 'subs/provider/src/api.ts', status: 'denied' });
    expect(first.view.edges[0]!.accesses[1]).toMatchObject({ status: 'limited', selections: [
      { exportedName: 'Value', original, forwarding: [{ file: 'src/index.ts' }] }, { exportedName: 'Alias', original },
    ] });
    const consumer = first.view.modules.find(module => module.id === 'fixture/consumer')!;
    expect(consumer.metrics).toMatchObject({ dependencies: 1, accessOccurrences: 2, selectedSymbols: 2,
      deniedAccesses: 1, limitedAccesses: 1 });
    const provider = first.view.modules.find(module => module.id === 'fixture/provider')!;
    expect(provider.metrics).toMatchObject({ ownedFiles: 2, subtreeFiles: 2, dependents: 1 });
    expect(provider.files.map(file => file.path)).toEqual(['subs/provider/src/api.ts', 'subs/provider/src/data.json']);
    expect(provider.exports).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Alias', aliases: ['Alias', 'Value'],
      capability: 'value-and-type', tags: ['browser'], forwarded: true, exposures: expect.arrayContaining([
        expect.objectContaining({ module: 'fixture', destinations: ['descendants'], effective: true }),
      ]), signature: { state: 'loadable', request: { original, exportName: 'Alias' } } }),
    expect.objectContaining({ name: 'Missing', signature: { state: 'unavailable', reason: 'missing-original' } })]));
    expect(first.view.coverage).toEqual([
      expect.objectContaining({ limit: expect.objectContaining({ id: 'coverage-edge' }), moduleIds: ['fixture/consumer'], edgeIds: [first.view.edges[0]!.id] }),
      expect.objectContaining({ limit: expect.objectContaining({ id: 'coverage-global' }), moduleIds: [], edgeIds: [] }),
      expect.objectContaining({ limit: expect.objectContaining({ id: 'coverage-target' }), moduleIds: ['fixture/consumer'], edgeIds: [] }),
    ]);
  });

  it('gives an original exported from two files of one owner distinct export IDs', () => {
    const { report, revision } = fixture();
    const snapshot = report.snapshot as unknown as { inventory: { files: unknown[] }; catalog: { files: unknown[] } };
    snapshot.inventory.files.push({ path: 'subs/provider/src/index.ts', owner: 'fixture/provider', area: 'ordinary',
      kind: 'source', sha256: 'e', bytes: 1 });
    snapshot.catalog.files.push({ file: 'subs/provider/src/index.ts', state: 'complete', issueIds: [], descriptionFiles: [],
      exports: [{ name: 'Alias', original, namespace: null, forwarding: [providerOrigin] }] });
    const projected = createProjectExplorerModel({ revision, report });
    if (projected.status !== 'ready') throw new Error(JSON.stringify(projected));
    const exports = projected.view.modules.find(module => module.id === 'fixture/provider')!.exports;
    const values = exports.filter(item => item.aliases.includes('Alias'));
    expect(values.map(item => item.file).sort()).toEqual(['subs/provider/src/api.ts', 'subs/provider/src/index.ts']);
    expect(new Set(exports.map(item => item.id)).size).toBe(exports.length);
  });

  it('refuses invalid/incomplete inputs and an encoded model above 16 MiB without partial output', () => {
    const input = fixture();
    for (const report of [{ ...input.report, snapshot: null }, { ...input.report, registry: null },
      { ...input.report, outcome: { ...input.report.outcome, execution: 'invalid' as const } }]) {
      expect(createProjectExplorerModel({ revision: input.revision, report })).toMatchObject({ status: 'unavailable' });
    }
    const huge = structuredClone(input.report);
    const root = huge.snapshot!.inventory.modules[0]!;
    (huge.snapshot!.inventory.modules as unknown as Record<string, unknown>[])[0] = {
      ...root, purpose: { state: 'present', readme: 'README.md', paragraph: 'x'.repeat(maximumProjectViewBytes + 1) },
    };
    const result = createProjectExplorerModel({ revision: input.revision, report: huge });
    expect(result).toEqual({ status: 'unavailable', reason: expect.any(String), limit: {
      maximumBytes: maximumProjectViewBytes, observedBytes: expect.any(Number),
    } });
    if (result.status !== 'unavailable' || !result.limit) throw new Error('Expected an encoded response refusal');
    expect(result.limit.observedBytes).toBeGreaterThan(result.limit.maximumBytes);
    expect(result).not.toHaveProperty('view');
  });

  it('keeps the production projection import closure pure', async () => {
    const source = await readFile(new URL('../project-view.ts', import.meta.url), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
    expect(imports.some(specifier => /^(?:node:fs|typescript)(?:\/|$)/.test(specifier)
      || /context-manager|daemon\/src\/(?:host|service)/.test(specifier))).toBe(false);
    expect(imports.every(specifier => specifier.startsWith('.') && !specifier.includes('/src/context'))).toBe(true);
  });
});
