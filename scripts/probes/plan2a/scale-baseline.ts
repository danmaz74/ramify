// Plan 2A iteration 1 probe: I2A-01:scale-baseline.
//
// Computes available-entry/file counts and a projected-byte proxy for the
// materialized API view on R (examples/collection-review), T (this toolkit)
// and the S100/S500/S1000 synthetic generators, WITHOUT implementing
// `listAvailableOriginals` (that provider is iteration 3's deliverable).
//
// For R and T, availability is computed by calling the REAL, already-public
// `explainImport` decision engine from `ramify.ts/model` once per
// (consuming source area, foreign original, request) triple -- not a
// reimplemented approximation of its rules, per contracts.md's shared-helper
// requirement. `explainImport` accepts any well-formed `SourceOrigin` as the
// hypothetical importer, so a synthetic, non-existent file path under each
// real source area's root is used purely to select the area's real profile;
// nothing is written to disk and no production source is touched.
//
// Byte projections here are a proxy, not a rendered document: for each
// available original, the RAW SOURCE SPAN of its first declaration (the
// bytes between `start` and `end` in the original defining file, i.e. full
// declaration text, including any body) is measured, plus a small constant
// per-entry Markdown overhead (heading + fence + blank lines). This
// deliberately over-estimates a future bounded, body-free signature and is
// clearly not a rendering: iteration 4's real signature/doc extraction
// (probed separately in typescript-detail-feasibility.ts) will replace it
// with a materially smaller, accurate figure once implemented.
//
// S100/S500/S1000 use the checked-in `syntheticOwnerFiles` generator via
// `materializeSynthetic` (scripts/measurements/materialize.ts). That
// generator's module.ramify files carry tags but NO `expose-src` statements,
// so every module's `model.exposures` is empty and every cross-module
// availability query is genuinely, correctly zero -- this is a real
// observation, not a probe limitation, and is recorded plainly below.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { archive, packageRoot } from '../resident-probe.js';
import { materializeSynthetic } from '../../measurements/materialize.js';
import type { Model as RamifyModel, ModuleRecord, Original, SourceArea, SourceOrigin } from 'ramify.ts/model';

const CAPABILITIES = ['registry', 'layout', 'metadata', 'descriptions',
  'source-catalog', 'exposure-linking', 'static-access', 'tags-origin',
  'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] as const;

async function analysisInputs(root: string, overrides: Partial<{ deadlineMs: number; maxReportBytes: number }> = {}) {
  const { createDefaultTagRegistry } = await import('ramify.ts/model');
  return {
    project: { cwd: root, root, configuration: 'discover' as const, scope: 'whole-project' as const },
    registry: createDefaultTagRegistry(), capabilities: CAPABILITIES,
    limits: {
      acquisition: { attempts: 3, maxFiles: 50000, maxApplicationFiles: 20000,
        maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2,
        maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1200, maxDepth: 128, deadlineMs: 30000 },
      source: { maxExports: 250000, maxAccesses: 250000, maxSelections: 1000000,
        maxForwardingDepth: 256, deadlineMs: 90000 },
      maxExposurePairs: 1000000, maxDiagnostics: 100000,
      maxReportBytes: overrides.maxReportBytes ?? 96 * 1024 ** 2,
      disposeTimeoutMs: 5000, deadlineMs: overrides.deadlineMs ?? 120000,
    },
  };
}

async function loadModel(root: string, timeoutMs: number) {
  const { createAnalysisSession } = await import('ramify.ts/analysis');
  const inputs = await analysisInputs(root, { deadlineMs: timeoutMs });
  const session = createAnalysisSession(inputs as Parameters<typeof createAnalysisSession>[0]);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const run = await session.analyze({ signal: controller.signal });
    const elapsedMs = performance.now() - startedAt;
    if (run.status === 'cancelled') return { status: 'cancelled' as const, elapsedMs };
    const { report } = run;
    if (!report.snapshot || !report.snapshot.model) {
      return { status: 'no-model' as const, elapsedMs, outcome: report.outcome, diagnostics: report.diagnostics.slice(0, 5), summary: report.summary };
    }
    return { status: 'completed' as const, elapsedMs, model: report.snapshot.model as RamifyModel, summary: report.summary, outcome: report.outcome };
  } catch (error) {
    const elapsedMs = performance.now() - startedAt;
    return { status: 'failed' as const, elapsedMs, message: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
    await session.dispose();
  }
}

interface EntryProxy { readonly original: string; readonly form: 'value' | 'type-only'; readonly definingFile: string; readonly category: 'children' | 'external'; readonly spanBytes: number; }

/** Real availability, computed with the actual explainImport engine (not reimplemented). */
async function availableOriginals(model: RamifyModel, consumerId: string, area: SourceArea) {
  const { explainImport } = await import('ramify.ts/model');
  const modulesById = new Map(model.modules.map((m) => [m.id, m] as const));
  const ordinaryRoot = model.modules.find((m) => m.id === consumerId)!.areas.find((candidate) => candidate.kind === 'ordinary')!.root;
  const importerFile = area.kind === 'tests' ? `${ordinaryRoot}/tests/__plan2a_probe__.ts` : `${ordinaryRoot}/__plan2a_probe__.ts`;
  const importer: SourceOrigin = { file: importerFile, area, auxiliary: false };
  const location = { file: importerFile, start: 0, end: 0, line: 1, column: 1 };
  const results: { readonly original: Original; readonly form: 'value' | 'type-only' }[] = [];
  for (const original of model.originals) {
    if (original.id.owner === consumerId) continue; // Same-owner originals are absent from the view (spec).
    let form: 'value' | 'type-only' | null = null;
    if (original.hasValue) {
      const decision = explainImport(model, { importer, location, target: original.origin, forwarding: [],
        selection: { original: original.id, request: 'value' } });
      if (decision.status === 'allowed') form = 'value';
    }
    if (!form && original.hasType) {
      const decision = explainImport(model, { importer, location, target: original.origin, forwarding: [],
        selection: { original: original.id, request: 'type-only' } });
      if (decision.status === 'allowed') form = 'type-only';
    }
    if (form) results.push({ original, form });
  }
  return { results, modulesById };
}

function isDescendant(candidateId: string, ancestorId: string, modulesById: Map<string, ModuleRecord>): boolean {
  let cursor = modulesById.get(candidateId)?.parent ?? null;
  while (cursor !== null) {
    if (cursor === ancestorId) return true;
    cursor = modulesById.get(cursor)?.parent ?? null;
  }
  return false;
}

const HEADING_OVERHEAD = Buffer.byteLength('## `x`\n\n```ts\n\n```\n\n');

async function projectFixture(label: string, root: string, timeoutMs: number) {
  const loaded = await loadModel(root, timeoutMs);
  if (loaded.status !== 'completed') return { label, root, ...loaded };
  const { model, summary, elapsedMs } = loaded;
  const fileCache = new Map<string, Buffer | null>();
  const readSpan = async (file: string, start: number, end: number): Promise<number> => {
    if (!fileCache.has(file)) {
      try { fileCache.set(file, await readFile(resolve(root, file))); }
      catch { fileCache.set(file, null); }
    }
    const buffer = fileCache.get(file);
    if (!buffer) return 0;
    return Math.max(0, Math.min(end, buffer.length) - Math.min(start, buffer.length));
  };

  const modules: unknown[] = [];
  let totalOrdinaryEntries = 0, totalTestEntries = 0, totalDuplicated = 0;
  for (const module of model.modules) {
    const ordinaryArea = module.areas.find((a) => a.kind === 'ordinary');
    const testsArea = module.areas.find((a) => a.kind === 'tests');
    if (!ordinaryArea) continue;
    const ordinary = await availableOriginals(model, module.id, ordinaryArea);
    const tests = testsArea ? await availableOriginals(model, module.id, testsArea) : null;

    const entryProxiesFor = async (entries: typeof ordinary.results, modulesById: Map<string, ModuleRecord>): Promise<EntryProxy[]> => {
      const proxies: EntryProxy[] = [];
      for (const { original, form } of entries) {
        const declaration = original.declarations[0];
        const spanBytes = declaration ? await readSpan(declaration.file, declaration.start, declaration.end) : 0;
        proxies.push({
          original: `${original.id.owner}:${original.id.file}#${original.id.binding}`, form,
          definingFile: original.id.file,
          category: isDescendant(original.id.owner, module.id, modulesById) ? 'children' : 'external',
          spanBytes: spanBytes + HEADING_OVERHEAD,
        });
      }
      return proxies;
    };
    const ordinaryProxies = await entryProxiesFor(ordinary.results, ordinary.modulesById);
    const testProxies = tests ? await entryProxiesFor(tests.results, tests.modulesById) : null;
    totalOrdinaryEntries += ordinaryProxies.length;
    if (testProxies) {
      totalTestEntries += testProxies.length;
      const ordinaryKeys = new Set(ordinaryProxies.map((p) => p.original));
      totalDuplicated += testProxies.filter((p) => ordinaryKeys.has(p.original)).length;
    }
    const filesOf = (proxies: readonly EntryProxy[]) => new Set(proxies.map((p) => p.definingFile)).size;
    const bytesOf = (proxies: readonly EntryProxy[]) => proxies.reduce((sum, p) => sum + p.spanBytes, 0);
    modules.push({
      module: module.id,
      ordinary: { files: filesOf(ordinaryProxies), entries: ordinaryProxies.length, projectedBytesProxy: bytesOf(ordinaryProxies),
        children: ordinaryProxies.filter((p) => p.category === 'children').length, external: ordinaryProxies.filter((p) => p.category === 'external').length },
      tests: testProxies ? { files: filesOf(testProxies), entries: testProxies.length, projectedBytesProxy: bytesOf(testProxies),
        children: testProxies.filter((p) => p.category === 'children').length, external: testProxies.filter((p) => p.category === 'external').length } : null,
    });
  }
  return {
    label, root, status: 'completed', elapsedMs,
    summary: { owners: summary.owners, sourceFiles: summary.sourceFiles, originals: summary.originals, exposures: model.exposures.length },
    totals: { ordinaryEntries: totalOrdinaryEntries, testEntries: totalTestEntries, duplicatedAcrossAreas: totalDuplicated },
    modules,
  };
}

/** S100/S500/S1000: aggregate-only. Their generator declares no `expose-src`, so
 * availability is genuinely zero everywhere; per-pair enumeration would be
 * wasted work. Confirmed instead via the real model's exposures count. */
async function projectSynthetic(fixture: 'S100' | 'S500' | 'S1000', timeoutMs: number | null) {
  const scratchParent = resolve(packageRoot, '.reference-work');
  await mkdir(scratchParent, { recursive: true });
  const scratch = await mkdtemp(join(scratchParent, `plan2a-scale-${fixture}-`));
  try {
    const materialized = await materializeSynthetic(join(scratch, fixture), fixture);
    if (timeoutMs === null) {
      return { fixture, status: 'inventory-only' as const, owners: materialized.owners, files: materialized.files, bytes: materialized.bytes,
        contentMapSha256: materialized.contentMapSha256,
        note: 'Batch analysis intentionally not attempted for this fixture in iteration 1; see the S1000 predecessor-refusal note.' };
    }
    const loaded = await loadModel(join(scratch, fixture), timeoutMs);
    if (loaded.status !== 'completed') {
      return { fixture, status: loaded.status, owners: materialized.owners, files: materialized.files, bytes: materialized.bytes,
        contentMapSha256: materialized.contentMapSha256, elapsedMs: loaded.elapsedMs,
        detail: 'message' in loaded ? loaded.message : 'summary' in loaded ? { outcome: loaded.outcome, summary: loaded.summary } : undefined };
    }
    assert.equal(loaded.model.exposures.length, 0, `${fixture} generator was expected to declare no expose-src statements`);
    return { fixture, status: 'completed' as const, owners: materialized.owners, files: materialized.files, bytes: materialized.bytes,
      contentMapSha256: materialized.contentMapSha256, elapsedMs: loaded.elapsedMs,
      summary: { owners: loaded.summary.owners, sourceFiles: loaded.summary.sourceFiles, originals: loaded.summary.originals, exposures: loaded.model.exposures.length },
      availableEntries: 0, availableEntriesReason: 'The synthetic generator (scripts/probes/fixtures/synthetic-owners.ts) declares module tags but no expose-src statements, so model.exposures is empty and every cross-module original is not-visible.' };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

const results: Record<string, unknown> = {};
results.R = await projectFixture('R', resolve(packageRoot, 'examples/collection-review'), 60000);
results.T = await projectFixture('T', packageRoot, 60000);
results.S100 = await projectSynthetic('S100', 60000);
results.S500 = await projectSynthetic('S500', 90000);
// S1000: smoke only, per the iteration-1 brief. A retained session is known to
// refuse S1000 at Plan 5's 96 MiB maxRetainedFactBytes limit (see
// docs/plans/done/iteration-5-fast-incremental-checks/iterations/iteration13-results.md,
// "the S1000 cold check exited 2 with 'resource-limit: maxRetainedFactBytes
// limit 100663296 exceeded (observed 167266182)'"). That is a retained-session
// limit, not this disposable batch path's limit, so a bounded batch attempt is
// still made here and its real outcome (success, resource-limit, or timeout)
// is recorded, never invented.
results.S1000 = await projectSynthetic('S1000', 90000);

await archive('plan2a/scale-baseline', {
  method: 'Real explainImport(model, question) decisions from ramify.ts/model, one call per (module source area, foreign original, request) '
    + 'triple, for R and T. Byte figures are a raw-declaration-span proxy (see file header), not a rendering. S100/S500/S1000 use the checked-in '
    + 'syntheticOwnerFiles generator via materializeSynthetic; their module.ramify files declare no expose-src, so availability is genuinely zero.',
  predecessorRefusal: {
    fixture: 'S1000', provider: 'RetainedSession (Plan 5)',
    limit: 'maxRetainedFactBytes = 100663296 bytes (96 MiB)',
    observed: '167266182 bytes (159.5 MiB) of retained facts; cold check exits 2 with resource-limit',
    source: 'docs/plans/done/iteration-5-fast-incremental-checks/iterations/iteration13-results.md (rows ~258, ~587-588)',
    appliesToThisProbe: false,
    reason: 'This probe uses the disposable batch AnalysisSession (createAnalysisSession/analyze), not RetainedSession; Plan 5\'s retained-fact refusal does not directly apply, though the batch path has its own, separately-configured maxReportBytes bound (also 96 MiB by convention, not identity).',
  },
  results,
});
