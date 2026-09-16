// Plan 2A iteration 1 probe: I2A-01:format-token-probe.
//
// Compares the specified compact Markdown format against an equivalent
// VERBOSE record that deliberately includes every field the specification's
// omission rules forbid (availability flag, provider, defining path,
// original ID, tags, exposure path, availability reason, alias, timestamp),
// for real available-entry samples drawn from R (examples/collection-review)
// and T (this toolkit).
//
// No token-counting package (tiktoken / gpt-tokenizer / js-tiktoken) is
// declared in package.json or present in node_modules (confirmed by search
// across dependencies, devDependencies and node_modules). Per the iteration
// brief, this probe therefore records real UTF-8 byte counts as the primary,
// exact measurement, plus TWO clearly-labeled APPROXIMATIONS (not a real
// tokenizer): a bytes/4 rule-of-thumb, and a punctuation/whitespace boundary
// count. Both approximations are named as such in every output field and
// must not be read as an exact token count for any real tokenizer/model.
//
// Entry content reuses the same real explainImport-derived availability and
// raw-declaration-span signature proxy as scale-baseline.ts (see that file's
// header for why this is a legitimate, honestly-labeled proxy rather than a
// production rendering). The comparison this leaf cares about -- compact
// Markdown overhead vs. verbose-record overhead -- is dominated by
// structural boilerplate, not by exact signature text, so the proxy is fair
// for both sides of the comparison.
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { archive, packageRoot } from '../resident-probe.js';
import type { Model as RamifyModel, ModuleRecord, Original, SourceArea, SourceOrigin } from 'ramify.ts/model';

void dirname; void fileURLToPath; // reserved for parity with sibling probes; packageRoot supplies the root here.

const CAPABILITIES = ['registry', 'layout', 'metadata', 'descriptions',
  'source-catalog', 'exposure-linking', 'static-access', 'tags-origin',
  'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] as const;

async function loadModel(root: string): Promise<RamifyModel | null> {
  const { createDefaultTagRegistry } = await import('ramify.ts/model');
  const { createAnalysisSession } = await import('ramify.ts/analysis');
  const inputs = {
    project: { cwd: root, root, configuration: 'discover' as const, scope: 'whole-project' as const },
    registry: createDefaultTagRegistry(), capabilities: CAPABILITIES,
    limits: {
      acquisition: { attempts: 3, maxFiles: 50000, maxApplicationFiles: 20000,
        maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2,
        maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1200, maxDepth: 128, deadlineMs: 30000 },
      source: { maxExports: 250000, maxAccesses: 250000, maxSelections: 1000000,
        maxForwardingDepth: 256, deadlineMs: 90000 },
      maxExposurePairs: 1000000, maxDiagnostics: 100000, maxReportBytes: 96 * 1024 ** 2,
      disposeTimeoutMs: 5000, deadlineMs: 60000,
    },
  };
  const session = createAnalysisSession(inputs as Parameters<typeof createAnalysisSession>[0]);
  try {
    const run = await session.analyze();
    if (run.status === 'cancelled' || !run.report.snapshot?.model) return null;
    return run.report.snapshot.model as RamifyModel;
  } finally {
    await session.dispose();
  }
}

interface SampleEntry { readonly name: string; readonly owner: string; readonly consumer: string; readonly form: 'value' | 'type-only'; readonly definingFile: string; readonly signatureProxy: string; }

async function sampleEntries(model: RamifyModel, root: string, maxEntries: number): Promise<SampleEntry[]> {
  const { explainImport } = await import('ramify.ts/model');
  const modulesById = new Map(model.modules.map((m) => [m.id, m] as const));
  void modulesById;
  const fileCache = new Map<string, Buffer | null>();
  const readSpan = async (file: string, start: number, end: number): Promise<string> => {
    if (!fileCache.has(file)) {
      try { fileCache.set(file, await readFile(resolve(root, file))); }
      catch { fileCache.set(file, null); }
    }
    const buffer = fileCache.get(file);
    if (!buffer) return '';
    return buffer.subarray(Math.min(start, buffer.length), Math.min(end, buffer.length)).toString('utf8');
  };

  const samples: SampleEntry[] = [];
  for (const module of model.modules) {
    if (samples.length >= maxEntries) break;
    const ordinaryArea = module.areas.find((a: SourceArea) => a.kind === 'ordinary');
    if (!ordinaryArea) continue;
    const importerFile = `${ordinaryArea.root}/__plan2a_probe__.ts`;
    const importer: SourceOrigin = { file: importerFile, area: ordinaryArea };
    const location = { file: importerFile, start: 0, end: 0, line: 1, column: 1 };
    for (const original of model.originals as readonly Original[]) {
      if (samples.length >= maxEntries) break;
      if (original.id.owner === module.id) continue;
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
      if (!form) continue;
      const declaration = original.declarations[0];
      const raw = declaration ? await readSpan(declaration.file, declaration.start, declaration.end) : '';
      samples.push({ name: original.id.binding, owner: original.id.owner, consumer: module.id, form,
        definingFile: original.id.file, signatureProxy: raw.slice(0, 2048) });
    }
  }
  return samples.sort((a, b) => a.definingFile.localeCompare(b.definingFile) || a.name.localeCompare(b.name));
}

function compactMarkdown(entries: readonly SampleEntry[]): string {
  const byFile = new Map<string, SampleEntry[]>();
  for (const entry of entries) {
    const list = byFile.get(entry.definingFile) ?? [];
    list.push(entry);
    byFile.set(entry.definingFile, list);
  }
  let out = '';
  for (const [, fileEntries] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const entry of fileEntries.sort((a, b) => a.name.localeCompare(b.name))) {
      const marker = entry.form === 'type-only' ? ' [type-only]' : '';
      out += `## \`${entry.name}\`${marker}\n\n\`\`\`ts\n${entry.signatureProxy}\n\`\`\`\n\n`;
    }
  }
  return out;
}

function verboseRecords(entries: readonly SampleEntry[]): string {
  // Deliberately includes every field the spec's omission rules forbid, as a
  // contrast baseline -- not a proposed alternative format.
  return JSON.stringify(entries.map((entry) => ({
    name: entry.name,
    availability: entry.form === 'value' ? 'available' : 'type-only-available',
    provider: entry.owner,
    consumer: entry.consumer,
    definingPath: entry.definingFile,
    originalId: `${entry.owner}:${entry.definingFile}#${entry.name}`,
    tags: [] as string[],
    exposurePath: [entry.owner, entry.consumer],
    availabilityReason: 'exposed',
    exposureAlias: entry.name,
    generatedAt: '2026-09-15T00:00:00.000Z',
    signature: entry.signatureProxy,
  })), null, 2);
}

/** APPROXIMATIONS ONLY -- no tokenizer package is installed. See file header. */
function approxTokens(text: string) {
  const bytes = Buffer.byteLength(text, 'utf8');
  const bytesOverFour = Math.ceil(bytes / 4);
  const boundaryChunks = text.split(/[\s`,{}[\]():;<>"'|&!=./\\]+/u).filter(Boolean).length;
  return { bytes, approxTokensBytesOverFour: bytesOverFour, approxTokensBoundarySplit: boundaryChunks };
}

const results: Record<string, unknown> = {};
for (const [label, root] of [['R', resolve(packageRoot, 'examples/collection-review')], ['T', packageRoot]] as const) {
  const model = await loadModel(root);
  if (!model) { results[label] = { status: 'no-model' }; continue; }
  const entries = await sampleEntries(model, root, 40);
  const compact = compactMarkdown(entries);
  const verbose = verboseRecords(entries);
  results[label] = {
    status: 'sampled', sampledEntries: entries.length,
    compact: { ...approxTokens(compact) },
    verbose: { ...approxTokens(verbose) },
    overheadRatio: entries.length ? Number((Buffer.byteLength(verbose, 'utf8') / Math.max(1, Buffer.byteLength(compact, 'utf8'))).toFixed(2)) : null,
  };
}

await archive('plan2a/token-format', {
  method: 'Compact Markdown per the specification\'s exact template vs. a deliberately verbose JSON record naming every field the spec\'s '
    + 'omission rules forbid (availability, provider, definingPath, originalId, tags, exposurePath, availabilityReason, exposureAlias, generatedAt), '
    + 'over up to 40 real available entries per fixture sampled with the same explainImport-derived availability as scale-baseline.ts. Signature text '
    + 'is the same raw-declaration-span proxy as scale-baseline.ts (see that file\'s header), not a rendered iteration-4 signature; the compact-vs-verbose '
    + 'byte/token RATIO this leaf cares about is dominated by structural boilerplate, not by exact signature content, so the proxy is fair for both sides.',
  tokenizerAvailability: 'None of tiktoken, gpt-tokenizer or js-tiktoken is declared in package.json or present in node_modules (confirmed by search). '
    + 'Byte counts below are exact; approxTokensBytesOverFour and approxTokensBoundarySplit are named, clearly-labeled heuristics only, not real tokenizer output.',
  omissionSetRetained: ['availability', 'provider', 'definingPath', 'originalId', 'tags', 'exposurePath',
    'availabilityReason', 'exposureAlias/alias', 'generatedAt/timestamp', 'kind field (conveyed by the signature itself)'],
  results,
});
