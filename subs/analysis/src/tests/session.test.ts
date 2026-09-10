import { createHook } from 'node:async_hooks';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { analyzeProject, createAnalysisSession } from '../index.js';
import type { AnalysisInputs, AnalysisReport, AnalysisRun } from '../index.js';
import { createDefaultTagRegistry, resolveTagRegistry } from '../../subs/model/src/index.js';

const fixtureFiles = {
  'module.ramify': 'ramify 1\nmodule fixture\nexpose-src publicValue from "interfaces/api.ts" to descendants\n',
  'README.md': '# Fixture\n\nThis fixture exercises the public batch session.\n',
  'package.json': '{"type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
    types: [], skipLibCheck: true }, include: ['src', 'subs', 'tools'] }),
  'src/interfaces/api.ts': 'export const publicValue = 1;\nexport const privateValue = 2;\nexport const anotherPrivate = 3;\n',
  'subs/consumer/module.ramify': 'ramify 1\nmodule consumer\n',
  'subs/consumer/src/probe.ts': "import { publicValue } from '../../../src/interfaces/api.js';\nvoid publicValue;\n",
};
const importer = 'subs/consumer/src/probe.ts';

async function put(root: string, path: string, text: string | Uint8Array): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}

async function fixture(check: (root: string, inputs: AnalysisInputs) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'ramify-public-session-'));
  try {
    for (const [path, text] of Object.entries(fixtureFiles)) await put(root, path, text);
    await check(root, {
      project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
      registry: createDefaultTagRegistry(), capabilities: ['static-access'],
      limits: {
        acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
          maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
        source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
        maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 32 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 120_000,
      },
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}

function reported(run: AnalysisRun): AnalysisReport {
  expect(run.status).toBe('reported');
  if (run.status !== 'reported') throw new Error('Expected an analysis report');
  return run.report;
}

function expectBlocked(report: AnalysisReport, prerequisite: string, dependents: readonly string[]): void {
  expect(report.stages.find(stage => stage.stage === prerequisite)?.status).toBe('invalid');
  for (const dependent of dependents) {
    expect(report.stages.find(stage => stage.stage === dependent)).toMatchObject({ status: 'blocked' });
    expect(report.stages.find(stage => stage.stage === dependent)!.blockedBy.length).toBeGreaterThan(0);
  }
  expect(report.outcome).toMatchObject({ execution: 'invalid', check: 'failed', coverage: 'not-run' });
  expect(report.summary.complete).toBe(false);
  expect(report.snapshot?.results ?? []).toEqual([]);
}

/** Inspect hidden properties and prototypes too: JSON equality alone would
 * miss a non-enumerable compiler handle or a getter retaining live state. */
function expectFrozenPlainData(value: unknown, active = new Set<object>(), verified = new Set<object>()): void {
  if (value === null || typeof value !== 'object') {
    expect(['string', 'number', 'boolean'].includes(typeof value) || value === null).toBe(true);
    return;
  }
  expect(active.has(value)).toBe(false);
  if (verified.has(value)) return;
  active.add(value);
  expect(Object.getPrototypeOf(value)).toBe(Array.isArray(value) ? Array.prototype : Object.prototype);
  expect(Object.isFrozen(value)).toBe(true);
  expect(Object.getOwnPropertySymbols(value)).toEqual([]);
  for (const [key, property] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    expect(property.get).toBeUndefined();
    expect(property.set).toBeUndefined();
    if (Array.isArray(value) && key === 'length') continue;
    expect(property.enumerable).toBe(true);
    expectFrozenPlainData(property.value, active, verified);
  }
  active.delete(value);
  verified.add(value);
}

describe('public disposable analysis session', () => {
  it('publishes the full real pipeline, provenance and independent capability dimensions', async () => fixture(async (root, inputs) => {
    const report = reported(await analyzeProject(inputs));
    expect(report).toMatchObject({ schemaVersion: 'ramify.analysis/1', request: inputs,
      scope: { root, configuration: join(root, 'tsconfig.json'), selection: 'given', walkedAreas: expect.arrayContaining(['src', 'subs/consumer/src']) },
      registry: inputs.registry, outcome: { execution: 'completed', check: 'passed', coverage: 'complete' },
      diagnostics: [], warnings: [], coverage: [],
      summary: { complete: true, owners: 2, sourceFiles: 2, resources: 0, originals: 3, accesses: 1,
        allowed: 1, denied: 0, errors: 0, warnings: 0, coverageNotes: 0, external: 0 } });
    expect(report.stages.map(stage => [stage.stage, stage.status, stage.blockedBy, stage.diagnosticIds])).toEqual(
      ['registry', 'acquisition', 'parse', 'catalog', 'link', 'access', 'decide', 'report'].map(stage => [stage, 'completed', [], []]));
    expect(report.capabilities.find(capability => capability.capability === 'static-access')).toEqual({
      capability: 'static-access', available: true, requested: true, executed: true,
    });
    expect(report.capabilities.find(capability => capability.capability === 'resource-access')).toEqual({
      capability: 'resource-access', available: true, requested: false, executed: true,
    });
    expect(report.capabilities.find(capability => capability.capability === 'browser-verification')).toEqual({
      capability: 'browser-verification', available: false, requested: false, executed: false,
    });
    expect(report.snapshot!.inventory.modules[0]!.purpose).toEqual({ state: 'present', readme: 'README.md',
      paragraph: 'This fixture exercises the public batch session.' });
    expect(report.snapshot!.catalog!.originals.map(original => original.id.binding).sort()).toEqual(['anotherPrivate', 'privateValue', 'publicValue']);
    expect(report.snapshot!.accesses[0]).toMatchObject({ importer: { file: importer, area: { owner: 'fixture/consumer', kind: 'ordinary' } },
      target: { kind: 'application', origin: { file: 'src/interfaces/api.ts' } },
      selections: [{ original: { kind: 'code', owner: 'fixture', file: 'interfaces/api.ts', binding: 'publicValue' } }] });
    expect(report.snapshot!.results[0]).toMatchObject({ outcome: 'checked', diagnostics: [], coverage: [],
      decisions: [{ status: 'allowed', reason: 'exposed' }] });
    expect(report.snapshot!.inputs.some(input => input.path === 'src/interfaces/api.ts' && input.role === 'source')).toBe(true);
  }), 15_000);

  it('seals stable input identities while assigning each fresh batch a unique run identity', async () => fixture(async (root, inputs) => {
    const first = reported(await analyzeProject(inputs));
    const second = reported(await analyzeProject(inputs));
    expect(first.runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second.runId).not.toBe(first.runId);
    expect(first.inputId).toBeTruthy();
    expect(second.inputId).toBe(first.inputId);
    expect({ ...second, runId: first.runId }).toEqual(first);
    await put(root, 'README.md', '# Fixture\n\nThe edited purpose changes the captured input.\n');
    const edited = reported(await analyzeProject(inputs));
    expect(edited.inputId).not.toBe(first.inputId);
    expect(edited.snapshot!.results).toEqual(first.snapshot!.results);
    expect(edited.outcome).toEqual(first.outcome);
    const registry = resolveTagRegistry([...inputs.registry.definitions, { name: 'extra', kind: 'required-importer' }]);
    if (registry.status !== 'valid') throw new Error(JSON.stringify(registry));
    const otherRegistry = reported(await analyzeProject({ ...inputs, registry: registry.value }));
    expect(otherRegistry.inputId).not.toBe(edited.inputId);
    expect(otherRegistry.outcome).toEqual(edited.outcome);
  }), 30_000);

  it('retains only immutable plain report data after disposal and a later changed run', async () => fixture(async (root, inputs) => {
    const session = createAnalysisSession(inputs);
    try {
      const report = reported(await session.analyze());
      const serialized = JSON.stringify(report);
      expectFrozenPlainData(report);
      expect(JSON.parse(serialized)).toEqual(report);
      await Promise.all([session.dispose(), session.dispose()]);
      await put(root, importer, "import { privateValue } from '../../../src/interfaces/api.js';\nvoid privateValue;\n");
      expect(reported(await analyzeProject(inputs)).outcome.check).toBe('failed');
      expect(JSON.stringify(report)).toBe(serialized);
      expect(report.snapshot!.results[0]!.decisions[0]!.status).toBe('allowed');
    } finally { await session.dispose(); }
  }), 20_000);

  it('does not read inputs or launch a compiler merely by constructing a session', async () => fixture(async (root, inputs) => {
    await put(root, 'module.ramify', 'this description is not valid');
    let children = 0;
    const hook = createHook({ init(_id, type) { if (type === 'PROCESSWRAP') children++; } });
    hook.enable();
    const session = createAnalysisSession(inputs);
    try {
      expect(children).toBe(0);
      await put(root, 'module.ramify', fixtureFiles['module.ramify']);
      expect(reported(await session.analyze()).outcome.check).toBe('passed');
      expect(children).toBeGreaterThan(0);
    } finally { hook.disable(); await session.dispose(); }
  }), 15_000);

  it('rejects forged registry identity before acquisition and blocks dependent source stages', async () => fixture(async (root, inputs) => {
    await rm(join(root, 'module.ramify'));
    const report = reported(await analyzeProject({ ...inputs, registry: { ...inputs.registry, id: 'forged' } }));
    expect(report.registry).toBeNull();
    expect(report.request.registry.id).toBe('forged');
    expect(report.diagnostics).toEqual([expect.objectContaining({ code: 'invalid-registry', category: 'registry' })]);
    expectBlocked(report, 'registry', ['acquisition', 'catalog', 'link', 'access', 'decide']);
  }));

  it('marks malformed descriptions invalid and never checks a partial permission graph', async () => fixture(async (root, inputs) => {
    await put(root, 'module.ramify', 'ramify 1\nmodule fixture\nexpose-test * from "api.ts" to parent\n');
    const report = reported(await analyzeProject(inputs));
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'invalid-selection', category: 'description',
      location: expect.objectContaining({ file: 'module.ramify', line: 3 }) }));
    expectBlocked(report, 'parse', ['catalog', 'link', 'access', 'decide']);
  }));

  it('marks stray declarations as invalid layout with blocked source stages', async () => fixture(async (root, inputs) => {
    await put(root, 'tools/module.ramify', 'ramify 1\nmodule stray\n');
    const report = reported(await analyzeProject(inputs));
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'stray-description', category: 'layout',
      location: expect.objectContaining({ file: 'tools/module.ramify' }) }));
    expectBlocked(report, 'acquisition', ['catalog', 'link', 'access', 'decide']);
  }));

  it('blocks decisions on missing declaration exports despite a complete catalog', async () => fixture(async (root, inputs) => {
    await put(root, 'module.ramify', fixtureFiles['module.ramify'].replace('publicValue', 'absent'));
    const report = reported(await analyzeProject(inputs));
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'missing-export', category: 'missing-export',
      location: expect.objectContaining({ file: 'module.ramify', line: 3 }) }));
    expect(report.stages.find(stage => stage.stage === 'catalog')!.status).toBe('completed');
    expect(report.snapshot!.catalog!.originals).toHaveLength(3);
    expectBlocked(report, 'link', ['access', 'decide']);
  }), 15_000);

  it('reports unavailable browser verification independently of ordinary browser tag capability', async () => fixture(async (root, inputs) => {
    await rm(join(root, 'module.ramify'));
    const report = reported(await analyzeProject({ ...inputs, capabilities: ['browser-verification', 'tags-origin'] }));
    expect(report.outcome).toEqual({ execution: 'unavailable', check: 'not-run', coverage: 'not-run' });
    expect(report.summary.complete).toBe(false);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'unavailable-capability', category: 'unavailable' }));
    expect(report.capabilities.find(capability => capability.capability === 'browser-verification')).toEqual({
      capability: 'browser-verification', available: false, requested: true, executed: false,
    });
    expect(report.capabilities.find(capability => capability.capability === 'tags-origin')).toMatchObject({ available: true, requested: true, executed: false });
    expect(report.snapshot?.results ?? []).toEqual([]);
  }));

  it('separates partial coverage from a definite denial in the same real source run', async () => fixture(async (root, inputs) => {
    await put(root, importer, `declare const target: string;\nvoid import(target);\n${fixtureFiles[importer]}`);
    const clean = reported(await analyzeProject(inputs));
    expect(clean.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'partial' });
    expect(clean.summary).toMatchObject({ complete: true, allowed: 1, denied: 0, errors: 0, coverageNotes: 1 });
    expect(clean.coverage).toEqual([expect.objectContaining({ code: 'nonliteral-target', location: expect.objectContaining({ file: importer, line: 2 }) })]);
    await put(root, importer, `declare const target: string;\nvoid import(target);\nimport { privateValue } from '../../../src/interfaces/api.js';\nvoid privateValue;\n`);
    const denied = reported(await analyzeProject(inputs));
    expect(denied.outcome).toEqual({ execution: 'completed', check: 'failed', coverage: 'partial' });
    expect(denied.summary).toMatchObject({ complete: true, denied: 1, errors: 1, coverageNotes: 1 });
    expect(denied.coverage).toEqual(clean.coverage);
    expect(denied.diagnostics).toEqual([expect.objectContaining({ code: 'not-visible', category: 'import',
      importer: expect.objectContaining({ owner: 'fixture/consumer', kind: 'ordinary' }),
      original: { kind: 'code', owner: 'fixture', file: 'interfaces/api.ts', binding: 'privateValue' },
      location: expect.objectContaining({ file: importer, line: 3 }) })]);
    expect(denied.snapshot!.results.filter(result => result.outcome === 'unverifiable')).toHaveLength(1);
  }), 20_000);

  it('reports compiler-selected project targets outside modules as coverage and warnings', async () => fixture(async (root, inputs) => {
    await put(root, 'tools/outside.ts', 'export const outside = 1;\n');
    await put(root, importer, "import { outside } from '../../../tools/outside.js';\nvoid outside;\n");
    const report = reported(await analyzeProject(inputs));
    expect(report.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'partial' });
    expect(report.summary).toMatchObject({ warnings: 1, coverageNotes: 1, external: 0, allowed: 0, denied: 0 });
    expect(report.warnings).toEqual([{ code: 'outside-module-source', entry: 'tools', count: 1, files: ['tools/outside.ts'] }]);
    expect(report.coverage).toEqual([expect.objectContaining({ code: 'outside-module-target', location: expect.objectContaining({ file: importer }) })]);
    expect(report.snapshot!.accesses[0]!.target).toEqual({ kind: 'outside-module', file: 'tools/outside.ts' });
    expect(report.snapshot!.results[0]).toMatchObject({ outcome: 'outside-scope', decisions: [], diagnostics: [] });
  }), 15_000);

  it.each(['ordinary', 'testing'] as const)('keeps known %s origins on unsupported CommonJS without manufacturing allowed decisions', async area => fixture(async (root, inputs) => {
    await put(root, 'package.json', '{"type":"commonjs"}');
    await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'Node16', moduleResolution: 'Node16',
      types: [], skipLibCheck: true, noEmit: true }, include: ['src', 'subs'] }));
    await put(root, 'src/tests/private.ts', 'export const fixtureValue = 1;\n');
    const target = area === 'ordinary' ? 'src/interfaces/api.ts' : 'src/tests/private.ts';
    await put(root, importer, `import implementation = require('../../../${target.replace(/\.ts$/, '.js')}');\nvoid implementation;\n`);
    const compiler = await promisify(execFile)(process.execPath,
      [fileURLToPath(new URL('../../../../node_modules/typescript/lib/tsc.js', import.meta.url)), '--project', join(root, 'tsconfig.json')],
      { cwd: root, timeout: 10_000 });
    expect([compiler.stdout, compiler.stderr]).toEqual(['', '']);
    const report = reported(await analyzeProject(inputs));
    expect(report.outcome).toEqual({ execution: 'completed', check: area === 'ordinary' ? 'passed' : 'failed', coverage: 'partial' });
    expect(report.summary).toMatchObject({ allowed: 0, denied: area === 'ordinary' ? 0 : 1, errors: area === 'ordinary' ? 0 : 1, coverageNotes: 1 });
    expect(report.coverage).toEqual([expect.objectContaining({ code: 'unsupported-commonjs', location: expect.objectContaining({ file: importer, line: 1 }) })]);
    expect(report.snapshot!.accesses).toEqual([expect.objectContaining({ form: 'commonjs', target: {
      kind: 'application', origin: expect.objectContaining({ file: target, area: expect.objectContaining({ kind: area === 'ordinary' ? 'ordinary' : 'tests' }) }),
    } })]);
    if (area === 'ordinary') {
      expect(report.snapshot!.results[0]).toMatchObject({ outcome: 'unverifiable', decisions: [], diagnostics: [] });
      expect(report.diagnostics).toEqual([]);
    } else {
      expect(report.snapshot!.results[0]).toMatchObject({ outcome: 'mixed', decisions: [{ status: 'denied', reason: 'testing-origin' }] });
      expect(report.diagnostics).toEqual([expect.objectContaining({ code: 'testing-origin', category: 'import',
        location: expect.objectContaining({ file: importer, line: 1 }), importer: expect.objectContaining({ owner: 'fixture/consumer', kind: 'ordinary' }) })]);
    }
  }), 20_000);

  it('distinguishes missing resource source coverage from an invalid exposure declaration', async () => fixture(async (root, inputs) => {
    await put(root, 'src/styles.d.ts', 'declare module "*.css" { const styles: Record<string, string>; export default styles; }\n');
    await put(root, importer, "import styles from '../../../src/missing.css';\nvoid styles;\n");
    const source = reported(await analyzeProject(inputs));
    expect(source.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'partial' });
    expect(source.coverage).toContainEqual(expect.objectContaining({ code: 'resource-target', location: expect.objectContaining({ file: importer }) }));
    expect(source.diagnostics).toEqual([]);
    expect(source.snapshot!.results[0]).toMatchObject({ outcome: 'unverifiable', decisions: [] });
    await put(root, 'module.ramify', fixtureFiles['module.ramify'] + 'expose-src default from "missing.css" to descendants\n');
    const exposed = reported(await analyzeProject(inputs));
    expect(exposed.outcome).toMatchObject({ execution: 'invalid', check: 'failed' });
    expect(exposed.diagnostics).toContainEqual(expect.objectContaining({ code: 'missing-file',
      location: expect.objectContaining({ file: 'module.ramify', line: 4 }) }));
    expect(exposed.stages.find(stage => stage.stage === 'access')!.status).toBe('blocked');
  }), 20_000);

  it('fails a known resource missing export with located source evidence through the public API', async () => fixture(async (root, inputs) => {
    await put(root, 'src/styles.d.ts', 'declare module "*.css" { const styles: Record<string, string>; export default styles; }\n');
    await put(root, 'src/style.css', '.root { color: red; }\n');
    await put(root, 'module.ramify', fixtureFiles['module.ramify'] + 'expose-src default from "style.css" to descendants\n');
    await put(root, importer, "import styles from '../../../src/style.css';\nvoid styles;\n");
    expect(reported(await analyzeProject(inputs)).outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'complete' });
    await put(root, importer, "import { missing } from '../../../src/style.css';\nvoid missing;\n");
    const report = reported(await analyzeProject(inputs));
    expect(report.outcome).toEqual({ execution: 'completed', check: 'failed', coverage: 'complete' });
    expect(report.coverage).toEqual([]);
    expect(report.diagnostics).toEqual([expect.objectContaining({ code: 'missing-export', category: 'missing-export',
      importer: expect.objectContaining({ owner: 'fixture/consumer' }), accessId: report.snapshot!.accesses[0]!.id,
      location: expect.objectContaining({ file: importer, line: 1, column: 10 }) })]);
    expect(report.snapshot!.accesses[0]).toMatchObject({ target: { kind: 'application', origin: { file: 'src/style.css' } },
      selections: [{ exportedName: 'missing', status: 'missing-export', original: null }] });
    expect(report.summary).toMatchObject({ errors: 1, resources: 1 });
  }), 20_000);

  it.each([
    ['separate imports', "import { privateValue } from '../../../src/interfaces/api.js';\nimport { anotherPrivate } from '../../../src/interfaces/api.js';\nvoid [privateValue, anotherPrivate];\n"],
    ['one namespace occurrence', "import * as api from '../../../src/interfaces/api.js';\nvoid api.privateValue;\nvoid api.anotherPrivate;\n"],
  ])('retains admitted diagnostic evidence on exhaustion within %s', async (_name, source) => fixture(async (root, inputs) => {
    await put(root, importer, source);
    const report = reported(await analyzeProject({ ...inputs, limits: { ...inputs.limits, maxDiagnostics: 1 } }));
    expect(report.outcome).toMatchObject({ execution: 'incomplete' });
    expect(report.outcome.check).not.toBe('passed');
    expect(report.summary.complete).toBe(false);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'not-visible',
      original: expect.objectContaining({ binding: 'privateValue' }) }));
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'resource-limit', category: 'limit',
      limit: { name: 'maxDiagnostics', maximum: 1, observed: 2, collectedPrefix: true } }));
    expect(report.diagnostics.filter(issue => issue.code === 'not-visible')).toHaveLength(1);
    expect(report.stages.find(stage => stage.stage === 'decide')!.status).not.toBe('completed');
  }), 15_000);

  it('applies the combined diagnostic bound when warnings alone exceed it', async () => fixture(async (root, inputs) => {
    const config = JSON.parse(fixtureFiles['tsconfig.json']) as { include: string[] };
    config.include.push('scripts');
    await put(root, 'tsconfig.json', JSON.stringify(config));
    await put(root, 'scripts/outside.ts', 'export const script = 1;\n');
    await put(root, 'tools/outside.ts', 'export const tool = 1;\n');
    const baseline = reported(await analyzeProject(inputs));
    expect(baseline.outcome.check).toBe('passed');
    expect(baseline.summary).toMatchObject({ warnings: 2, errors: 0, coverageNotes: 0 });
    const bounded = reported(await analyzeProject({ ...inputs, limits: { ...inputs.limits, maxDiagnostics: 1 } }));
    expect(bounded.outcome).toMatchObject({ execution: 'incomplete', check: 'not-run' });
    expect(bounded.summary.complete).toBe(false);
    expect(bounded.warnings).toEqual([baseline.warnings[0]]);
    expect(bounded.diagnostics).toContainEqual(expect.objectContaining({ code: 'resource-limit',
      limit: { name: 'maxDiagnostics', maximum: 1, observed: 2, collectedPrefix: true } }));
  }), 20_000);

  it('keeps acquisition evidence when a later file exceeds the admitted byte bound', async () => fixture(async (root, inputs) => {
    await put(root, 'src/a-kept.ts', 'export const kept = 1;\n');
    await put(root, 'src/z-large.ts', `/*${'x'.repeat(2048)}*/\nexport {};\n`);
    const report = reported(await analyzeProject({ ...inputs, limits: { ...inputs.limits,
      acquisition: { ...inputs.limits.acquisition, maxFileBytes: 1024 } } }));
    expect(report.outcome).toMatchObject({ execution: 'incomplete', check: 'not-run' });
    expect(report.summary.complete).toBe(false);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'resource-limit', location: expect.objectContaining({ file: 'src/z-large.ts' }) }));
    expect(report.snapshot!.inventory.files).toContainEqual(expect.objectContaining({ path: 'src/a-kept.ts' }));
    expect(report.stages.find(stage => stage.stage === 'catalog')!.status).toBe('blocked');
  }));

  it.each(['maxExposurePairs', 'maxReportBytes', 'deadlineMs'] as const)('cannot publish a pass after %s exhaustion', async name => fixture(async (root, inputs) => {
    if (name === 'maxExposurePairs') await put(root, 'module.ramify', fixtureFiles['module.ramify'].replace('publicValue from', 'publicValue, privateValue from'));
    const report = reported(await analyzeProject({ ...inputs, limits: { ...inputs.limits, [name]: 1 } }));
    expect(report.outcome).toMatchObject({ execution: 'incomplete' });
    expect(report.outcome.check).not.toBe('passed');
    expect(report.summary.complete).toBe(false);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'resource-limit' }));
  }), 15_000);

  it('bounds the incomplete envelope when retained registry descriptions exceed the result budget', async () => fixture(async (_root, inputs) => {
    const registry = resolveTagRegistry(inputs.registry.definitions.map(definition => ({
      ...definition, description: 'x'.repeat(100_000),
    })));
    if (registry.status !== 'valid') throw new Error(JSON.stringify(registry));
    const maximum = 131_072;
    const report = reported(await analyzeProject({ ...inputs, registry: registry.value, capabilities: ['browser-verification'],
      limits: { ...inputs.limits, maxReportBytes: maximum } }));
    expect(report.outcome).toEqual({ execution: 'incomplete', check: 'not-run', coverage: 'not-run' });
    expect(report.summary.complete).toBe(false);
    expect(Buffer.byteLength(JSON.stringify(report))).toBeLessThanOrEqual(maximum);
    expect(report.registry).toBeNull();
    expect(report.snapshot).toBeNull();
    expect(report.request.project).toEqual(inputs.project);
    expect(report.request.limits.maxReportBytes).toBe(maximum);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'resource-limit', category: 'limit',
      limit: expect.objectContaining({ name: 'maxReportBytes', maximum, collectedPrefix: true }) }));
    expect(report.stages.find(stage => stage.stage === 'report')!.status).toBe('failed');
  }));

  it('returns a read failure as incomplete and permits an independent healthy run', async () => fixture(async (root, inputs) => {
    await put(root, 'src/broken.ts', new Uint8Array([0xff]));
    const failure = reported(await analyzeProject(inputs));
    expect(failure.outcome).toMatchObject({ execution: 'incomplete', check: 'not-run' });
    expect(failure.diagnostics).toContainEqual(expect.objectContaining({ code: 'read-failure', location: expect.objectContaining({ file: 'src/broken.ts' }) }));
    expect(failure.stages.find(stage => stage.stage === 'catalog')!.status).toBe('failed');
    expect(failure.stages.find(stage => stage.stage === 'access')!.status).toBe('blocked');
    await put(root, 'src/broken.ts', 'export {};\n');
    expect(reported(await analyzeProject(inputs)).outcome.check).toBe('passed');
  }), 15_000);

  it('rejects concurrent and repeated analyze calls instead of reusing or queuing success', async () => fixture(async (_root, inputs) => {
    const session = createAnalysisSession(inputs);
    try {
      const first = session.analyze();
      const concurrent = reported(await session.analyze());
      expect(concurrent.outcome).toMatchObject({ execution: 'incomplete', check: 'not-run' });
      expect(concurrent.diagnostics).toContainEqual(expect.objectContaining({ code: 'session-used', category: 'execution' }));
      expect(reported(await first).outcome.check).toBe('passed');
      const repeated = reported(await session.analyze());
      expect(repeated.outcome.check).toBe('not-run');
      expect(repeated.diagnostics).toContainEqual(expect.objectContaining({ code: 'session-used' }));
    } finally { await session.dispose(); }
  }), 15_000);

  it('makes disposal idempotent and prohibits first analysis after disposal', async () => fixture(async (_root, inputs) => {
    const session = createAnalysisSession(inputs);
    await Promise.all([session.dispose(), session.dispose()]);
    const report = reported(await session.analyze());
    expect(report.outcome).toMatchObject({ execution: 'incomplete', check: 'not-run' });
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'session-disposed', category: 'execution' }));
    expect(report.snapshot?.results ?? []).toEqual([]);
  }));

  it('consumes a pre-cancelled session without starting child work or publishing success', async () => fixture(async (_root, inputs) => {
    const controller = new AbortController(); controller.abort();
    let children = 0;
    const hook = createHook({ init(_id, type) { if (type === 'PROCESSWRAP') children++; } });
    const session = createAnalysisSession(inputs);
    hook.enable();
    try {
      expect(await session.analyze({ signal: controller.signal })).toEqual({ status: 'cancelled' });
      expect(children).toBe(0);
      expect(reported(await session.analyze()).diagnostics).toContainEqual(expect.objectContaining({ code: 'session-used' }));
    } finally { hook.disable(); await session.dispose(); }
  }));

  it.each(['signal', 'dispose'] as const)('cancels observable in-flight child work through %s and allows a fresh session', async mode => fixture(async (_root, inputs) => {
    const controller = new AbortController();
    const session = createAnalysisSession(inputs);
    let started!: () => void;
    const childStarted = new Promise<void>(done => { started = done; });
    const hook = createHook({ init(_id, type) { if (type === 'PROCESSWRAP') started(); } });
    hook.enable();
    try {
      const pending = session.analyze({ signal: controller.signal });
      await childStarted;
      hook.disable();
      if (mode === 'signal') controller.abort();
      else await session.dispose();
      expect(await pending).toEqual({ status: 'cancelled' });
      await session.dispose();
      expect(reported(await analyzeProject(inputs)).outcome.check).toBe('passed');
    } finally { hook.disable(); await session.dispose(); }
  }), 15_000);
});

describe('iteration 12 constraint remediation', () => {
  async function compilerValid(root: string): Promise<void> {
    const compiler = await promisify(execFile)(process.execPath,
      [fileURLToPath(new URL('../../../../node_modules/typescript/lib/tsc.js', import.meta.url)), '--noEmit', '--project', join(root, 'tsconfig.json')],
      { cwd: root, timeout: 10_000 });
    expect([compiler.stdout, compiler.stderr]).toEqual(['', '']);
  }

  it.each(['local', 'overloaded', 'variable', 'parameter', 'imported', 'imported-alias', 'renamed'] as const)(
    'does not treat a %s application function as the CommonJS loader', async variant => fixture(async (root, inputs) => {
      await put(root, 'subs/consumer/src/tests/theme.css', '.theme {}\n');
      await put(root, 'subs/consumer/src/identity.ts', 'export function require(value: string) { return value; }\n');
      const call = variant === 'renamed' ? 'identity' : 'require';
      const prefix = variant === 'local' ? 'function require(value: string) { return value; }'
        : variant === 'overloaded' ? 'function require(value: string): string; function require(value: string) { return value; }'
        : variant === 'variable' ? 'const require = (value: string) => value;'
        : variant === 'parameter' ? 'function invoke(require: (value: string) => string) { return require("./tests/theme.css"); }'
        : variant === 'imported' ? 'import { require } from "./identity.js";'
        : variant === 'imported-alias' ? 'import { require as identity } from "./identity.js"; const require = identity;'
        : 'function identity(value: string) { return value; }';
      await put(root, importer, `${prefix}\n${variant === 'parameter' ? 'void invoke(value => value);' : `void ${call}("./tests/theme.css");`}\nexport {};\n`);
      await compilerValid(root);
      const report = reported(await analyzeProject(inputs));
      expect(report.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'complete' });
      expect(report.diagnostics).toEqual([]);
      expect(report.coverage).toEqual([]);
      expect(report.snapshot!.accesses.some(access => access.form === 'commonjs')).toBe(false);
      expect(report.snapshot!.accesses.some(access => access.specifier === './tests/theme.css')).toBe(false);
      if (variant.startsWith('imported')) {
        expect(report.snapshot!.results.some(result => result.decisions.some(decision => decision.status === 'allowed'
          && decision.original?.id.binding === 'require'))).toBe(true);
      }
    }), 15_000);

  it.each(['function', 'variable', 'node-types'] as const)('preserves actual CommonJS origin checks with %s declarations', async variant => fixture(async (root, inputs) => {
    await put(root, 'subs/consumer/src/tests/theme.css', '.theme {}\n');
    await put(root, 'package.json', '{"type":"commonjs"}');
    await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'Node16', moduleResolution: 'Node16',
      types: variant === 'node-types' ? ['node'] : [], skipLibCheck: true,
      ...(variant === 'node-types' ? { typeRoots: [fileURLToPath(new URL('../../../../node_modules/@types', import.meta.url))] } : {}) }, include: ['src', 'subs'] }));
    const ambient = variant === 'function' ? 'declare function require(value: string): unknown;'
      : variant === 'variable' ? 'declare const require: (value: string) => unknown;' : '';
    await put(root, importer, `${ambient}\nvoid require("./tests/theme.css");\nexport {};\n`);
    await compilerValid(root);
    const report = reported(await analyzeProject(inputs));
    expect(report.outcome).toEqual({ execution: 'completed', check: 'failed', coverage: 'partial' });
    expect(report.coverage).toEqual([expect.objectContaining({ code: 'unsupported-commonjs' })]);
    expect(report.diagnostics).toEqual([expect.objectContaining({ code: 'testing-origin', location: expect.objectContaining({ file: importer, line: 2 }) })]);
    expect(report.snapshot!.accesses).toEqual([expect.objectContaining({ form: 'commonjs',
      target: { kind: 'application', origin: expect.objectContaining({ file: 'subs/consumer/src/tests/theme.css' }) } })]);
  }), 15_000);

  it.each(['testing', 'ordinary'] as const)('applies origin checks to Node createRequire loads of established %s targets', async area => fixture(async (root, inputs) => {
    await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
      types: ['node'], typeRoots: [fileURLToPath(new URL('../../../../node_modules/@types', import.meta.url))], skipLibCheck: true }, include: ['src', 'subs'] }));
    await put(root, 'src/tests/hook.ts', "process.env.HOOKED = '1';\n");
    await put(root, 'src/setup.ts', "process.env.CONFIGURED = '1';\n");
    const target = area === 'testing' ? 'src/tests/hook.ts' : 'src/setup.ts';
    await put(root, 'src/use.ts', `import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\nrequire('./${target.slice(4, -3)}.js');\n`);
    await compilerValid(root);
    const report = reported(await analyzeProject(inputs));
    expect(report.outcome).toEqual({ execution: 'completed', check: area === 'testing' ? 'failed' : 'passed', coverage: 'partial' });
    expect(report.summary).toMatchObject({ denied: area === 'testing' ? 1 : 0, errors: area === 'testing' ? 1 : 0, coverageNotes: 1 });
    expect(report.coverage).toEqual([expect.objectContaining({ code: 'unsupported-commonjs', location: expect.objectContaining({ file: 'src/use.ts', line: 3 }) })]);
    const loads = report.snapshot!.accesses.filter(access => access.form === 'commonjs');
    expect(loads).toEqual([expect.objectContaining({ runtimeLoad: true, importer: expect.objectContaining({ file: 'src/use.ts' }),
      target: { kind: 'application', origin: expect.objectContaining({ file: target, area: expect.objectContaining({ kind: area === 'testing' ? 'tests' : 'ordinary' }) }) } })]);
    const result = report.snapshot!.results.find(result => result.accessId === loads[0]!.id);
    if (area === 'testing') {
      expect(result).toMatchObject({ outcome: 'mixed', decisions: [{ status: 'denied', reason: 'testing-origin' }] });
      expect(report.diagnostics).toEqual([expect.objectContaining({ code: 'testing-origin', category: 'import',
        location: expect.objectContaining({ file: 'src/use.ts', line: 3 }), importer: expect.objectContaining({ owner: 'fixture', kind: 'ordinary' }) })]);
    } else {
      expect(result).toMatchObject({ outcome: 'unverifiable', decisions: [], diagnostics: [] });
      expect(report.diagnostics).toEqual([]);
    }
  }), 15_000);

  const selections = {
    static: (pattern: string) => `import * as ns from '../../../src/interfaces/api.js'; const { ${pattern} } = ns;`,
    awaited: (pattern: string) => `const { ${pattern} } = await import('../../../src/interfaces/api.js'); export {};`,
    callback: (pattern: string) => `void import('../../../src/interfaces/api.js').then(({ ${pattern} }) => {});`,
    'callback-body': (pattern: string) => `void import('../../../src/interfaces/api.js').then(ns => { const { ${pattern} } = ns; });`,
  };
  it.each(Object.entries(selections).flatMap(([form, source]) => (['private', 'unpromised', 'allowed'] as const).map(permission => ({ form, source, permission }))))(
    'checks the $permission merged binding in $form empty nested destructuring', async ({ source, permission }) => fixture(async (root, inputs) => {
      await put(root, 'src/interfaces/api.ts', 'export function Merged() {}\nexport namespace Merged { export const member = 1; }\n');
      await put(root, 'module.ramify', `ramify 1\nmodule fixture\n${permission === 'private' ? ''
        : `expose-src Merged from "interfaces/api.ts"${permission === 'allowed' ? ' tagged [browser]' : ''} to descendants\n`}`);
      await put(root, 'subs/consumer/module.ramify', 'ramify 1\nmodule consumer tagged [browser]\n');
      for (const pattern of ['Merged', 'Merged: {}']) {
        await put(root, importer, `${source(pattern)}\n`);
        await compilerValid(root);
        const report = reported(await analyzeProject(inputs));
        expect(report.outcome).toEqual({ execution: 'completed', check: permission === 'allowed' ? 'passed' : 'failed', coverage: 'complete' });
        expect(report.coverage).toEqual([]);
        const accesses = report.snapshot!.accesses.filter(access => access.importer.file === importer);
        expect(accesses).toHaveLength(1);
        expect(accesses[0].selections).toEqual([expect.objectContaining({ request: 'value', status: 'resolved',
          original: { kind: 'code', owner: 'fixture', file: 'interfaces/api.ts', binding: 'Merged' },
          location: expect.objectContaining({ file: importer, line: 1 }) })]);
        const decisions = report.snapshot!.results.flatMap(result => result.decisions);
        expect(decisions).toHaveLength(1);
        expect(decisions[0]).toMatchObject({ status: permission === 'allowed' ? 'allowed' : 'denied',
          reason: permission === 'private' ? 'not-visible' : permission === 'unpromised' ? 'required-symbol-tag' : 'exposed' });
        if (permission === 'unpromised') expect(decisions[0].visibility?.visible).toBe(true);
      }
    }), 20_000);
});
