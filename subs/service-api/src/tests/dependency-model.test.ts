import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { DependencyBoundaryFact, DependencyDiagramFacts } from '../../../analysis/src/interfaces/dependency-diagram.js';
import type { ContextRevision } from '../../../daemon/subs/contexts/src/interfaces/contexts.js';
import { createExplorerDependencyModel, maximumDependencyViewBytes } from '../dependency-model.js';
import type { ExplorerDependencyModel } from '../interfaces/explorer-dependencies.js';

const inputId = 'input/1:dependency-model';
const revision = { revision: 'rev/1:00000000-0000-4000-8000-000000000000:3', sequence: 3,
  fingerprints: { inputId } } as unknown as ContextRevision;
const original = (owner: string, file: string, binding: string) => ({ kind: 'code' as const, owner, file, binding });
const forwarded = original('app/b/core', 'run.ts', 'run');
const shape = original('app/c', 'types.ts', 'Shape');
const partial = original('app/b/core', 'x.ts', 'x');
const used = original('app/c', 'u.ts', 'u');
const parentValue = original('app/b', 's.ts', 's');

function fact(consumer: string, importedModule: string, target: ReturnType<typeof original>,
  classification: DependencyBoundaryFact['classification'], status: DependencyBoundaryFact['status'] = 'allowed',
  extra: Partial<DependencyBoundaryFact> = {}): DependencyBoundaryFact {
  const directory = (module: string) => `subs/${module.split('/').slice(1).join('/subs/')}/src`;
  return { consumer, importedModule, originalOwner: target.owner, original: target, classification,
    consumerFiles: [`${directory(consumer)}/use.ts`], importedFiles: [`${directory(importedModule)}/index.ts`],
    originalFiles: [`${directory(target.owner)}/${target.file}`], accessIds: [`${consumer}->${importedModule}:${target.binding}`],
    status, reasons: status === 'denied' ? ['not-visible'] : ['exposed'], limitIds: [], ...extra };
}

/**
 * Controls: `a` uses the forwarded original through `b` (behavioral) and `c`
 * (non-behavioral, denied); a type through its own barrel (self-barrel,
 * limited); `x` known through `c` but unknown through `b`; `b` calls `c`; the
 * child `b/core` uses its parent `b`; `idle` has no dependency.
 */
function diagram(): DependencyDiagramFacts {
  return {
    inputId,
    modules: ['app/idle', 'app/c', 'app/b/core', 'app/b', 'app/a', 'app'],
    headline: { behavioralDependencies: 2, nonBehavioralDependencies: 2 },
    boundaries: [
      fact('app/a', 'app/a', shape, 'non-behavioral', 'limited'),
      fact('app/a', 'app/b', forwarded, 'behavioral'),
      fact('app/a', 'app/b', partial, 'unknown', 'allowed', { limitIds: ['limit-x'] }),
      fact('app/a', 'app/c', forwarded, 'non-behavioral', 'denied'),
      fact('app/a', 'app/c', partial, 'non-behavioral'),
      fact('app/b', 'app/c', used, 'behavioral'),
      fact('app/b/core', 'app/b', parentValue, 'non-behavioral'),
    ],
    coverage: { state: 'partial', unknownDependencies: 1, limitIds: ['limit-x'] },
  };
}

const edgeId = (projection: string, consumer: string, provider: string) =>
  `dependency-edge/1:${projection}:${createHash('sha256').update(JSON.stringify([consumer, provider])).digest('hex')}`;
const counts = (behavioral: number, nonBehavioral: number) => ({ behavioral, nonBehavioral });
const imported = (behavioralUsedOriginals: number, nonBehavioralUsedOriginals: number) =>
  ({ behavioralUsedOriginals, nonBehavioralUsedOriginals });

function mapped(input: DependencyDiagramFacts, maxBytes = maximumDependencyViewBytes): { model: ExplorerDependencyModel; encodedBytes: number } {
  const outcome = createExplorerDependencyModel({ revision, diagram: input, maxBytes });
  if (outcome.status !== 'mapped') throw new Error(JSON.stringify(outcome));
  return outcome;
}

/** Recount the two units directly from the facts, independently of the mapping's grouping. */
function expectedUnits(input: DependencyDiagramFacts) {
  const units = new Map<string, Set<string>>();
  for (const item of input.boundaries) {
    const key = `${item.consumer}|${item.originalOwner}|${JSON.stringify(item.original)}`;
    units.set(key, (units.get(key) ?? new Set()).add(item.classification));
  }
  const settled = [...units.values()].map(classes => classes.has('behavioral') ? 'behavioral'
    : classes.has('unknown') ? 'unknown' : 'non-behavioral');
  const triples = input.boundaries.filter(item => item.classification !== 'unknown' && item.consumer !== item.importedModule);
  return { settled, triples };
}

describe('BD25: createExplorerDependencyModel', () => {
  it('maps units, rows, breakdowns, copied evidence, self-barrel omission and deterministic IDs', () => {
    const input = diagram();
    const { model, encodedBytes } = mapped(input);
    expect(encodedBytes).toBe(Buffer.byteLength(JSON.stringify(model), 'utf8'));
    expect(model).toMatchObject({ schemaVersion: 'ramify.explorer-dependencies/1', inputId, state: 'partial',
      project: counts(2, 2), coverage: { unknownDependencies: 1, limitIds: ['limit-x'] } });

    // Independent unit counts: headline from (consumer, original); imported edges from known non-self triples.
    const { settled, triples } = expectedUnits(input);
    expect(settled.filter(item => item === 'behavioral')).toHaveLength(model.project.behavioral);
    expect(settled.filter(item => item === 'non-behavioral')).toHaveLength(model.project.nonBehavioral);
    expect(model.importedModuleEdges.reduce((sum, edge) => sum + edge.counts.behavioralUsedOriginals
      + edge.counts.nonBehavioralUsedOriginals, 0)).toBe(triples.length);
    expect(model.originalOwnerEdges.reduce((sum, edge) => sum + edge.counts.behavioral + edge.counts.nonBehavioral, 0))
      .toBe(settled.filter(item => item !== 'unknown').length);

    // One row per diagram module in byte order, zero rows included.
    expect(model.modules).toEqual([
      { id: 'app', uses: counts(0, 0), usedThrough: imported(0, 0), ownedUsedByOthers: counts(0, 0) },
      { id: 'app/a', uses: counts(1, 1), usedThrough: imported(0, 0), ownedUsedByOthers: counts(0, 0) },
      { id: 'app/b', uses: counts(1, 0), usedThrough: imported(1, 1), ownedUsedByOthers: counts(0, 1) },
      { id: 'app/b/core', uses: counts(0, 1), usedThrough: imported(0, 0), ownedUsedByOthers: counts(1, 0) },
      { id: 'app/c', uses: counts(0, 0), usedThrough: imported(1, 2), ownedUsedByOthers: counts(1, 1) },
      { id: 'app/idle', uses: counts(0, 0), usedThrough: imported(0, 0), ownedUsedByOthers: counts(0, 0) },
    ]);

    // Imported-module projection: the forwarded original links to b and c; the self-barrel makes no a -> a edge;
    // the partially known x still counts through c as a lower bound.
    expect(model.importedModuleEdges.map(edge => [edge.id, edge.consumer, edge.provider, edge.counts, edge.originalOwners])).toEqual([
      [edgeId('imported-module', 'app/a', 'app/b'), 'app/a', 'app/b', imported(1, 0), [{ owner: 'app/b/core', counts: imported(1, 0) }]],
      [edgeId('imported-module', 'app/a', 'app/c'), 'app/a', 'app/c', imported(0, 2), [{ owner: 'app/b/core', counts: imported(0, 2) }]],
      [edgeId('imported-module', 'app/b', 'app/c'), 'app/b', 'app/c', imported(1, 0), [{ owner: 'app/c', counts: imported(1, 0) }]],
      [edgeId('imported-module', 'app/b/core', 'app/b'), 'app/b/core', 'app/b', imported(0, 1), [{ owner: 'app/b', counts: imported(0, 1) }]],
    ]);
    expect(model.importedModuleEdges.every(edge => edge.projection === 'imported-module' && edge.consumer !== edge.provider)).toBe(true);

    // Original-owner projection: the forwarded original links to b/core once, imported through b and c;
    // the unknown x makes no owner dependency; the self-barrel type links a -> c.
    expect(model.originalOwnerEdges.map(edge => [edge.id, edge.consumer, edge.provider, edge.counts, edge.importedThrough])).toEqual([
      [edgeId('original-owner', 'app/a', 'app/b/core'), 'app/a', 'app/b/core', counts(1, 0),
        [{ module: 'app/b', counts: imported(1, 0) }, { module: 'app/c', counts: imported(0, 1) }]],
      [edgeId('original-owner', 'app/a', 'app/c'), 'app/a', 'app/c', counts(0, 1), [{ module: 'app/a', counts: imported(0, 1) }]],
      [edgeId('original-owner', 'app/b', 'app/c'), 'app/b', 'app/c', counts(1, 0), [{ module: 'app/c', counts: imported(1, 0) }]],
      [edgeId('original-owner', 'app/b/core', 'app/b'), 'app/b/core', 'app/b', counts(0, 1), [{ module: 'app/b', counts: imported(0, 1) }]],
    ]);
    expect(model.originalOwnerEdges.every(edge => edge.projection === 'original-owner')).toBe(true);
    expect(new Set([...model.importedModuleEdges, ...model.originalOwnerEdges].map(edge => edge.id)).size).toBe(8);

    // Evidence is copied from the facts: status, reasons, files and access IDs, ordered by original then imported module.
    const copy = (item: DependencyBoundaryFact) => ({ original: item.original, originalOwner: item.originalOwner,
      importedModule: item.importedModule, classification: item.classification, consumerFiles: item.consumerFiles,
      importedFiles: item.importedFiles, originalFiles: item.originalFiles, accessIds: item.accessIds, status: item.status,
      reasons: item.reasons, coverageIds: item.limitIds });
    const [selfBarrel, viaB, , viaCDenied, partialViaC, bUsesC, coreUsesB] = input.boundaries;
    expect(model.importedModuleEdges[1]!.evidence).toEqual([copy(viaCDenied!), copy(partialViaC!)]);
    expect(model.importedModuleEdges[1]!.evidence.map(item => [item.status, item.reasons])).toEqual([['denied', ['not-visible']], ['allowed', ['exposed']]]);
    expect(model.originalOwnerEdges[0]!.evidence).toEqual([copy(viaB!), copy(viaCDenied!)]);
    expect(model.originalOwnerEdges[1]!.evidence).toEqual([copy(selfBarrel!)]);
    expect(model.originalOwnerEdges[1]!.evidence[0]).toMatchObject({ status: 'limited', importedModule: 'app/a' });
    expect(model.importedModuleEdges[2]!.evidence).toEqual([copy(bUsesC!)]);
    expect(model.originalOwnerEdges[3]!.evidence).toEqual([copy(coreUsesB!)]);
    // Imported-edge evidence names the imported file; the original's file stays in its own field.
    expect(model.importedModuleEdges[0]!.evidence[0]).toMatchObject({ importedFiles: ['subs/b/src/index.ts'],
      originalFiles: ['subs/b/subs/core/src/run.ts'] });
    expect(JSON.stringify(model)).not.toContain('"unknown"');

    // Deterministic: shuffled input and reordered modules give identical bytes.
    const shuffled = { ...input, modules: [...input.modules].reverse(), boundaries: [...input.boundaries].reverse() };
    expect(JSON.stringify(mapped(structuredClone(shuffled)).model)).toBe(JSON.stringify(model));
  });

  it('maps a measured zero with complete coverage and a row per module', () => {
    const { model } = mapped({ inputId, modules: ['app', 'app/a'], headline: { behavioralDependencies: 0, nonBehavioralDependencies: 0 },
      boundaries: [], coverage: { state: 'complete', unknownDependencies: 0, limitIds: [] } });
    expect(model).toEqual({ schemaVersion: 'ramify.explorer-dependencies/1', inputId, state: 'complete', project: counts(0, 0),
      modules: ['app', 'app/a'].map(id => ({ id, uses: counts(0, 0), usedThrough: imported(0, 0), ownedUsedByOthers: counts(0, 0) })),
      importedModuleEdges: [], originalOwnerEdges: [], coverage: { unknownDependencies: 0, limitIds: [] } });
  });

  it('refuses an identity mismatch, inconsistent counts and an oversized model without partial output', () => {
    const refusal = (input: DependencyDiagramFacts, maxBytes = maximumDependencyViewBytes) =>
      createExplorerDependencyModel({ revision, diagram: input, maxBytes });
    expect(refusal({ ...diagram(), inputId: 'input/1:other' })).toEqual({ status: 'refused', reason: 'identity-mismatch',
      message: expect.stringContaining('input/1:other') });
    expect(refusal({ ...diagram(), headline: { behavioralDependencies: 3, nonBehavioralDependencies: 2 } }))
      .toEqual({ status: 'refused', reason: 'inconsistent-counts', message: expect.any(String) });
    expect(refusal({ ...diagram(), headline: { behavioralDependencies: 2, nonBehavioralDependencies: 3 } }))
      .toMatchObject({ status: 'refused', reason: 'inconsistent-counts' });
    expect(refusal({ ...diagram(), modules: ['app', 'app/a'] })).toMatchObject({ status: 'refused', reason: 'inconsistent-counts' });
    expect(refusal({ ...diagram(), boundaries: [...diagram().boundaries, fact('app/c', 'app/b', used, 'behavioral')] }))
      .toMatchObject({ status: 'refused', reason: 'inconsistent-counts' });

    const { encodedBytes } = mapped(diagram());
    expect(createExplorerDependencyModel({ revision, diagram: diagram(), maxBytes: encodedBytes })).toMatchObject({ status: 'mapped', encodedBytes });
    const tight = refusal(diagram(), encodedBytes - 1);
    expect(tight).toEqual({ status: 'refused', reason: 'resource-limit', message: expect.stringContaining(`${encodedBytes}`) });
    expect(tight).not.toHaveProperty('model');

    // Above the 16 MiB default.
    const base = diagram();
    const oversized = refusal({ ...base, boundaries: base.boundaries.map((item, index) => index === 1
      ? { ...item, consumerFiles: [`subs/a/src/${'x'.repeat(maximumDependencyViewBytes)}.ts`] } : item) });
    expect(oversized).toMatchObject({ status: 'refused', reason: 'resource-limit' });
    expect(oversized).not.toHaveProperty('model');
  });

  it('keeps the mapping and the router state free of analysis and compiler runtime imports', async () => {
    for (const file of ['../dependency-model.ts', '../dependency-view.ts', '../interfaces/explorer-dependencies.ts']) {
      const source = await readFile(new URL(file, import.meta.url), 'utf8');
      const runtime = [...source.matchAll(/^import\s+(?!type\s)[^;]*?from\s+['"]([^'"]+)['"]/gm)].map(match => match[1]!);
      expect([file, runtime.filter(specifier => specifier !== 'node:crypto' && !specifier.startsWith('./'))]).toEqual([file, []]);
    }
  });
});

/**
 * The presentation owner cannot import this mapping, so its projection-divergence fixture is a
 * serialized output of the real mapping. `RAMIFY_UPDATE_DEPENDENCY_FIXTURES=1` rewrites it.
 */
describe('presentation dependency fixture', () => {
  it('equals the mapping of the forwarding, both-boundaries and measured-zero diagrams', async () => {
    const shared = original('app/b/core', 'run.ts', 'run');
    const bothBoundaries: DependencyDiagramFacts = {
      inputId,
      modules: ['app', 'app/a', 'app/b', 'app/b/core', 'app/c'],
      headline: { behavioralDependencies: 1, nonBehavioralDependencies: 1 },
      boundaries: [
        fact('app/a', 'app/b', shared, 'behavioral'),
        fact('app/a', 'app/b', shape, 'non-behavioral'),
        fact('app/a', 'app/c', shared, 'behavioral', 'limited', { limitIds: [] }),
      ],
      coverage: { state: 'complete', unknownDependencies: 0, limitIds: [] },
    };
    const zero: DependencyDiagramFacts = { inputId, modules: ['app', 'app/a', 'app/b', 'app/b/core', 'app/c', 'app/idle'],
      headline: { behavioralDependencies: 0, nonBehavioralDependencies: 0 }, boundaries: [],
      coverage: { state: 'complete', unknownDependencies: 0, limitIds: [] } };
    const fixture = `${JSON.stringify({
      forwarding: mapped(diagram()).model,
      bothBoundaries: mapped(bothBoundaries).model,
      zero: mapped(zero).model,
    }, null, 2)}\n`;
    const path = new URL('../../../presentation/subs/project-view/src/tests/fixtures/dependency-models.json', import.meta.url);
    if (process.env.RAMIFY_UPDATE_DEPENDENCY_FIXTURES === '1') {
      await mkdir(new URL('.', path), { recursive: true });
      await writeFile(path, fixture);
    }
    expect(await readFile(path, 'utf8')).toBe(fixture);
  });
});
