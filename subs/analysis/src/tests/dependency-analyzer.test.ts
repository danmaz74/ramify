import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { analyzeDependencyDiagram, analyzeProject, projectDependencyDiagram } from '../index.js';
import type { AnalysisLimits, AnalysisReport, Capability, DependencyAnalyzerLimits, DependencyAnalyzerOutcome,
  DependencyDiagramFacts, ProjectRequest } from '../index.js';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';

/**
 * The command frames each compiler helper received on standard input, one list per helper
 * lifetime in spawn order, and every retained session or retained compiler opened in this process.
 */
const observed = vi.hoisted(() => ({ lifetimes: [] as string[][], retained: [] as string[] }));
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const spawn = ((...args: Parameters<typeof actual.spawn>) => {
    const child = actual.spawn(...args);
    if (JSON.stringify(args).includes('compiler-helper.') && child.stdin) {
      const commands: string[] = [];
      observed.lifetimes.push(commands);
      const write = child.stdin.write.bind(child.stdin) as (...values: unknown[]) => boolean;
      child.stdin.write = ((...values: unknown[]) => {
        for (const line of String(values[0]).split('\n')) {
          if (!line.includes('"kind":"command"')) continue;
          const frame = JSON.parse(line) as { command: string; supplied?: boolean };
          commands.push(frame.supplied ? `${frame.command}(supplied)` : frame.command);
        }
        return write(...values);
      }) as typeof child.stdin.write;
    }
    return child;
  }) as typeof actual.spawn;
  return { ...actual, spawn, default: { ...actual, spawn } };
});
// Every way to open a retained session or a retained compiler counts its calls.
vi.mock('../session-host.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../session-host.js')>();
  return { ...actual, openWorkerSession: (...args: Parameters<typeof actual.openWorkerSession>) => {
    observed.retained.push('openWorkerSession'); return actual.openWorkerSession(...args);
  } };
});
vi.mock('../session-engine.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../session-engine.js')>();
  return { ...actual, openSessionEngine: (...args: Parameters<typeof actual.openSessionEngine>) => {
    observed.retained.push('openSessionEngine'); return actual.openSessionEngine(...args);
  } };
});
vi.mock('../../subs/typescript/src/retained-source-analysis.js', async importOriginal => {
  // Only the exposed factory is named; the module's other exports pass through unchanged.
  const actual = await importOriginal<{ createRetainedSourceAnalysis(...args: unknown[]): unknown }>();
  return { ...actual, createRetainedSourceAnalysis: (...args: unknown[]) => {
    observed.retained.push('createRetainedSourceAnalysis'); return actual.createRetainedSourceAnalysis(...args);
  } };
});

const timeout = 120_000;
const checkCapabilities: readonly Capability[] = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking',
  'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'];
const limits: AnalysisLimits = {
  acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2,
    maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
  source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
  maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 96 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 120_000,
};
const analyzerLimits: DependencyAnalyzerLimits = { source: limits.source, maxResultBytes: 16 * 1024 ** 2, deadlineMs: 120_000 };

const module = (name: string, exposures = ''): Record<string, string> => ({
  'module.ramify': `ramify 1\nmodule ${name}\n${exposures}`, 'README.md': `# ${name}\n\nA dependency analyzer fixture module.\n`,
});
const within = (directory: string, files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([path, text]) => [`${directory}/${path}`, text]));
const project = (files: Record<string, string>): Record<string, string> => ({
  ...module('fixture'), 'package.json': '{"type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', types: [],
    strict: true, skipLibCheck: true }, include: ['src', 'subs'] }),
  ...files,
});

/** path-facts: consumer `fixture` reaches originals of `core` through the forwarding modules `b` and `c`. */
const B = "'../subs/b/src/index.js'", C = "'../subs/c/src/index.js'";
const forwarder = "export { act, Service, settings, type Shape, loose } from '../../core/src/index.js';\n";
const pathFacts = project({
  ...within('subs/core', { ...module('core'), 'src/index.ts': `export function act(): void {}
export class Service { start(): void {} }
export const settings = { size: 1 };
export interface Shape { size: number }
export const loose: any = 1;
` }),
  ...within('subs/b', { ...module('b'), 'src/index.ts': forwarder }),
  ...within('subs/c', { ...module('c'), 'src/index.ts': forwarder }),
  'src/only-b.ts': `import { act } from ${B};\nimport { act as actC } from ${C};\nact();\n`,
  'src/both.ts': `import { act } from ${B};\nimport { act as actC } from ${C};\nact();\nexport type Signature = typeof actC;\n`,
  'src/neither.ts': `import { act } from ${B};\nimport { act as actC } from ${C};\n`,
  'src/kinds.ts': `import { Service, settings, type Shape } from ${B};\nimport { act, settings as settingsC } from ${C};
new Service();\n[0].forEach(act);\nexport const shape: Shape = settings;\nexport { settingsC };\n`,
  'src/limited.ts': `import { loose } from ${B};\nimport { loose as looseC } from ${C};\nvoid (loose + 1);\n`,
});
/** forwarding: `fixture/b` forwards originals owned by `fixture/b/a`; only `act` is exposed. */
const forwarding = project({
  ...within('subs/b', { ...module('b', 'expose-sub act from a to parent\n'),
    'src/index.ts': "export { act, secret, type Settings } from '../subs/a/src/index.js';\n" }),
  ...within('subs/b/subs/a', { ...module('a', 'expose-src act from "index.ts" to parent\n'),
    'src/index.ts': 'export function act(): void {}\nexport const secret = { level: 1 };\nexport interface Settings { size: number }\n' }),
  'src/use.ts': "import { act, secret } from '../subs/b/src/index.js';\nimport type { Settings } from '../subs/b/src/index.js';\nact();\nexport const settings: Settings = { size: 1 };\n",
  'src/reexport.ts': "export * from '../subs/b/src/index.js';\n",
});

async function put(root: string, path: string, text: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}
async function withProject(files: Record<string, string>, check: (root: string, request: ProjectRequest) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-dependency-analyzer-')));
  try {
    for (const [path, text] of Object.entries(files)) await put(root, path, text);
    await check(root, { cwd: root, root, scope: 'whole-project', configuration: 'discover' });
  } finally { await rm(root, { recursive: true, force: true }); }
}
async function batch(request: ProjectRequest, capabilities: readonly Capability[]): Promise<AnalysisReport> {
  const run = await analyzeProject({ project: request, registry: createDefaultTagRegistry(), capabilities, limits });
  if (run.status !== 'reported') throw new Error('Expected a batch report');
  expect(run.report.outcome.execution).toBe('completed');
  return run.report;
}
function projected(report: AnalysisReport): DependencyDiagramFacts {
  const outcome = projectDependencyDiagram({ revision: report.inputId!, report, limits: { maxResultBytes: analyzerLimits.maxResultBytes } });
  if (outcome.status !== 'projected') throw new Error(`Expected a projected diagram: ${JSON.stringify(outcome)}`);
  return outcome.diagram;
}
function ready(outcome: DependencyAnalyzerOutcome): Extract<DependencyAnalyzerOutcome, { status: 'ready' }> {
  if (outcome.status !== 'ready') throw new Error(`Expected a ready analyzer outcome: ${JSON.stringify(outcome)}`);
  return outcome;
}

/** BD14/BD15: the analyzer over an ordinary report equals the projection of a requesting batch report over identical inputs. */
async function equalsBatch(files: Record<string, string>): Promise<DependencyDiagramFacts> {
  let diagram: DependencyDiagramFacts | undefined;
  await withProject(files, async (_root, request) => {
    const requested = await batch(request, [...checkCapabilities, 'dependency-behavior']);
    const ordinary = await batch(request, checkCapabilities);
    expect(ordinary.inputId).toBe(requested.inputId);
    expect(ordinary.snapshot!.dependencyBehavior).toBeUndefined();
    const first = observed.lifetimes.length;
    const outcome = ready(await analyzeDependencyDiagram({ project: request, report: ordinary, limits: analyzerLimits }));
    expect(observed.lifetimes.slice(first)).toEqual([['behavior(supplied)', 'dispose']]);
    expect(outcome.behaviorRuns).toBe(1);
    expect(outcome.diagram).toEqual(projected(requested));
    expect(JSON.stringify(outcome.diagram)).toBe(JSON.stringify(projected(requested)));
    expect(Object.isFrozen(outcome.diagram.boundaries)).toBe(true);
    const { acquireMs, classifyMs, projectMs, totalMs } = outcome.timings;
    expect([acquireMs, classifyMs, projectMs].every(value => value >= 0 && value <= totalMs)).toBe(true);
    diagram = outcome.diagram;
  });
  return diagram!;
}

describe('lean dependency analyzer', () => {
  it('path-facts: equals the batch path and issues only a supplied behavior command (BD14, BD15)', async () => {
    const diagram = await equalsBatch(pathFacts);
    expect(diagram.coverage).toMatchObject({ state: 'partial', unknownDependencies: 1 });
    // Only-B-used adds no C boundary; neither.ts adds none; unknown stays a boundary for coverage only.
    expect(diagram.boundaries.filter(fact => fact.consumer === 'fixture')
      .map(fact => [fact.importedModule, fact.original.binding, fact.classification, fact.consumerFiles.join()])).toEqual([
      ['fixture/b', 'Service', 'behavioral', 'src/kinds.ts'],
      ['fixture/b', 'Shape', 'non-behavioral', 'src/kinds.ts'],
      ['fixture/b', 'act', 'behavioral', 'src/both.ts,src/only-b.ts'],
      ['fixture/b', 'loose', 'unknown', 'src/limited.ts'],
      ['fixture/b', 'settings', 'non-behavioral', 'src/kinds.ts'],
      ['fixture/c', 'act', 'behavioral', 'src/both.ts,src/kinds.ts'],
      ['fixture/c', 'settings', 'non-behavioral', 'src/kinds.ts'],
    ]);
    expect(observed.retained).toEqual([]);
  }, timeout);

  it('forwarding: equals the batch path with per-original status (BD14, BD15)', async () => {
    const diagram = await equalsBatch(forwarding);
    expect(diagram.boundaries.map(fact => [fact.consumer, fact.importedModule, fact.originalOwner, fact.original.binding,
      fact.classification, fact.status])).toEqual([
      // Default links to B; the original owner B/A is the alternate endpoint. Status is per original.
      ['fixture', 'fixture/b', 'fixture/b/a', 'Settings', 'non-behavioral', 'denied'],
      ['fixture', 'fixture/b', 'fixture/b/a', 'act', 'behavioral', 'allowed'],
      ['fixture', 'fixture/b', 'fixture/b/a', 'secret', 'non-behavioral', 'denied'],
      ['fixture/b', 'fixture/b/a', 'fixture/b/a', 'Settings', 'non-behavioral', 'denied'],
      ['fixture/b', 'fixture/b/a', 'fixture/b/a', 'act', 'non-behavioral', 'allowed'],
      ['fixture/b', 'fixture/b/a', 'fixture/b/a', 'secret', 'non-behavioral', 'denied'],
    ]);
    expect(observed.retained).toEqual([]);
  }, timeout);

  it('returns inputs-changed with the differing paths and no diagram after an edit (BD16)', async () => {
    const edits: readonly [string, (root: string) => Promise<void>, readonly string[]][] = [
      ['read source file', root => put(root, 'src/use.ts', "import { act } from '../subs/b/src/index.js';\nact();\nact();\n"), ['src/use.ts']],
      ['configuration file', async root => {
        const configuration = JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8')) as { compilerOptions: Record<string, unknown> };
        configuration.compilerOptions.noUnusedLocals = false;
        await put(root, 'tsconfig.json', JSON.stringify(configuration));
      }, ['tsconfig.json']],
      ['module layout', async root => {
        for (const [path, text] of Object.entries(within('subs/extra', { ...module('extra'), 'src/index.ts': 'export const extra = 1;\n' }))) {
          await put(root, path, text);
        }
      }, ['subs/extra/module.ramify', 'subs/extra/src/index.ts']],
    ];
    for (const [name, edit, expected] of edits) {
      await withProject(forwarding, async (root, request) => {
        const report = await batch(request, checkCapabilities);
        await edit(root);
        const outcome = await analyzeDependencyDiagram({ project: request, report, limits: analyzerLimits });
        expect(outcome.status, name).toBe('inputs-changed');
        expect(outcome, name).not.toHaveProperty('diagram');
        const paths = (outcome as Extract<DependencyAnalyzerOutcome, { status: 'inputs-changed' }>).paths;
        expect(paths, name).toEqual(expect.arrayContaining([...expected]));
        expect(paths, name).toEqual([...paths].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
      });
    }
  }, timeout);

  it('refuses an incomplete report, an oversized diagram and a cancelled run without starting work (BD17)', async () => {
    await withProject(forwarding, async (_root, request) => {
      const report = await batch(request, checkCapabilities);
      const first = observed.lifetimes.length;
      for (const execution of ['invalid', 'incomplete', 'unavailable'] as const) {
        const incomplete = { ...report, outcome: { ...report.outcome, execution } };
        expect(await analyzeDependencyDiagram({ project: request, report: incomplete, limits: analyzerLimits }))
          .toMatchObject({ status: 'unavailable', reason: 'invalid-report' });
      }
      expect(await analyzeDependencyDiagram({ project: request, report, limits: analyzerLimits }, { signal: AbortSignal.abort() }))
        .toEqual({ status: 'cancelled' });
      expect(observed.lifetimes.length).toBe(first);
      const oversized = await analyzeDependencyDiagram({ project: request, report, limits: { ...analyzerLimits, maxResultBytes: 64 } });
      expect(oversized).toMatchObject({ status: 'unavailable', reason: 'resource-limit' });
      expect(oversized).not.toHaveProperty('diagram');
    });
  }, timeout);
});
