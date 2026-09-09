import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateProject } from '../validation-entry.js';
import type { AnalysisInputs } from '../validation-entry.js';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';

async function fixture(run: (root: string, inputs: AnalysisInputs) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'ramify-validation-'));
  try {
    await mkdir(join(root, 'src/interfaces'), { recursive: true });
    await writeFile(join(root, 'module.ramify'), 'ramify 1\nmodule fixture\nexpose-src * from "interfaces/api.ts" to descendants\n');
    await writeFile(join(root, 'package.json'), '{"type":"module"}\n');
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext',
      moduleResolution: 'bundler', types: [], skipLibCheck: true }, include: ['src'] }));
    await writeFile(join(root, 'src/interfaces/api.ts'), 'export const value = 1;\nexport interface Contract { readonly value: number }\n');
    await run(root, { project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' }, registry: createDefaultTagRegistry(), capabilities: ['exposure-linking'],
      limits: { acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
        maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
      source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
      maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 32 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 120_000 } });
  } finally { await rm(root, { recursive: true, force: true }); }
}

describe('real project validation library', () => {
  it('returns a sealed frozen model usable after disposal and changes identities on fresh bytes', async () => fixture(async (root, inputs) => {
    const first = await validateProject(inputs);
    expect(first.status).toBe('valid');
    if (first.status !== 'valid') throw new Error(JSON.stringify(first));
    expect(first.linked.selections[0]!.pairs.map(pair => pair.name)).toEqual(['Contract', 'value']);
    expect(first.input.inventory.modules[0]!.purpose.state).toBe('missing-file');
    expect(Object.isFrozen(first.linked.modelInput.originals[0]!.origin.area)).toBe(true);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    const unchanged = await validateProject(inputs);
    expect(unchanged.status === 'valid' && unchanged.input.inputId).toBe(first.input.inputId);
    await writeFile(join(root, 'src/interfaces/api.ts'), 'export const added = 2;\n');
    const second = await validateProject(inputs);
    expect(second.status).toBe('valid');
    if (second.status !== 'valid') throw new Error(JSON.stringify(second));
    expect(second.input.inputId).not.toBe(first.input.inputId);
    expect(second.linked.selections[0]!.pairs.map(pair => pair.name)).toEqual(['added']);
    expect(first.linked.selections[0]!.pairs.map(pair => pair.name)).toEqual(['Contract', 'value']);
  }), 30_000);

  it('retains parsed locations and blocks catalog/link output for malformed declarations', async () => fixture(async (root, inputs) => {
    await writeFile(join(root, 'module.ramify'), 'ramify 1\nmodule fixture\nexpose-test * from "api.ts" to parent\n');
    const result = await validateProject(inputs);
    expect(result).toMatchObject({ status: 'invalid', diagnostics: expect.arrayContaining([expect.objectContaining({
      code: 'invalid-selection', location: expect.objectContaining({ file: 'module.ramify', line: 3 }),
    })]) });
    expect(result).not.toHaveProperty('linked');
    expect(result).not.toHaveProperty('catalog');
  }));

  it('does not fabricate missing exports in named selections', async () => fixture(async (root, inputs) => {
    await writeFile(join(root, 'module.ramify'), 'ramify 1\nmodule fixture\nexpose-src Absent from "interfaces/api.ts" to parent\n');
    expect(await validateProject(inputs)).toMatchObject({ status: 'invalid', diagnostics: [{ code: 'missing-export',
      location: expect.objectContaining({ file: 'module.ramify', line: 3, column: 12 }) }] });
  }), 15_000);

  it('rejects incomplete wildcard namespaces through several forwarding hops', async () => fixture(async (root, inputs) => {
    await writeFile(join(root, 'src/a.ts'), 'export const clash = 1;');
    await writeFile(join(root, 'src/b.ts'), 'export const clash = 2;');
    await writeFile(join(root, 'src/conflict.ts'), "export * from './a.js'; export * from './b.js';");
    await writeFile(join(root, 'src/namespace.ts'), "export * as ns from './conflict.js';");
    await writeFile(join(root, 'src/interfaces/api.ts'), "export { ns } from '../namespace.js'; export const independent = 1;");
    const result = await validateProject(inputs);
    expect(result).toMatchObject({ status: 'invalid', diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'incomplete-expansion' })]) });
    expect(result).not.toHaveProperty('linked');
  }), 15_000);

  it('accepts a lexical merged runtime binding with namespace members', async () => fixture(async (root, inputs) => {
    await writeFile(join(root, 'src/interfaces/api.ts'), 'export function Merged() {}\nexport namespace Merged { export const member = 1; }\n');
    const result = await validateProject(inputs);
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') throw new Error(JSON.stringify(result));
    expect(result.linked.selections[0]!.pairs[0]!.original.binding).toBe('Merged');
    expect(result.linked.modelInput.originals.find(item => item.id.binding === 'Merged')!.hasValue).toBe(true);
  }), 15_000);

  it('validates requested capabilities and supplied resolved registry before reading a project', async () => fixture(async (root, inputs) => {
    await rm(join(root, 'module.ramify'));
    expect(await validateProject({ ...inputs, capabilities: ['browser-verification'] })).toMatchObject({ status: 'unavailable', diagnostics: [{ code: 'unavailable-capability' }] });
    expect(await validateProject({ ...inputs, registry: { ...inputs.registry, id: 'forged' } })).toMatchObject({ status: 'invalid', diagnostics: [{ code: 'invalid-registry' }] });
  }));

  it('rejects unknown header tags before catalog acquisition', async () => fixture(async (root, inputs) => {
    await writeFile(join(root, 'module.ramify'), 'ramify 1\nmodule fixture tagged [unknown]\n');
    expect(await validateProject(inputs)).toMatchObject({ status: 'invalid', diagnostics: [{ code: 'unknown-tag', location: expect.objectContaining({ line: 2 }) }] });
  }));

  it.each(['maxExposurePairs', 'maxReportBytes', 'deadlineMs'] as const)('returns explicit incomplete results on %s exhaustion', async name => fixture(async (_root, inputs) => {
    const result = await validateProject({ ...inputs, limits: { ...inputs.limits, [name]: 1 } });
    expect(result).toMatchObject({ status: 'incomplete', diagnostics: [{ code: 'resource-limit' }] });
    expect(result).not.toHaveProperty('linked');
  }), 15_000);

  it('returns cancelled for pre-start and in-flight cancellation and permits a subsequent fresh run', async () => fixture(async (_root, inputs) => {
    const before = new AbortController(); before.abort();
    expect(await validateProject(inputs, { signal: before.signal })).toEqual({ status: 'cancelled' });
    const during = new AbortController();
    const pending = validateProject(inputs, { signal: during.signal });
    const timer = setTimeout(() => during.abort(), 30);
    try { expect(await pending).toEqual({ status: 'cancelled' }); }
    finally { clearTimeout(timer); }
    expect((await validateProject(inputs)).status).toBe('valid');
  }), 15_000);

  it('reports invalid exact paths with the authored span instead of performing extension substitution', async () => fixture(async (root, inputs) => {
    const path = join(root, 'module.ramify');
    await writeFile(path, (await readFile(path, 'utf8')).replace('interfaces/api.ts', 'interfaces/api.js'));
    expect(await validateProject(inputs)).toMatchObject({ status: 'invalid', diagnostics: [{ code: 'missing-file', location: expect.objectContaining({ line: 3, column: 19 }) }] });
  }));
});
