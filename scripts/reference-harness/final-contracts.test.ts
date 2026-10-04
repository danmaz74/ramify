import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertOwner, layeredOwners, reviewedOwners, reviewedPackage, validatePackageEntries } from '../validate-final-contracts.js';
import { repositoryRoot } from './plan.js';

const archive = 'docs/plans/done/iteration-1-project-verifier';
const resident = 'docs/plans/done/iteration-2-resident-verification';
async function reviews(file: string): Promise<[string, string]> {
  return [await readFile(join(repositoryRoot, archive, file), 'utf8'), await readFile(join(repositoryRoot, resident, file), 'utf8')];
}

describe('Plan 2 final contract validator', () => {
  it('requires eleven owners and expands every abbreviation from the archived review', async () => {
    const owners = reviewedOwners(...await reviews('owners.md'));
    expect([...owners.keys()].sort()).toEqual(['analysis', 'cli', 'contexts', 'daemon', 'descriptions', 'layout', 'model', 'presentation', 'project', 'ramify', 'typescript']);
    const names = owners.get('ramify')!.document.statements.flatMap(statement => 'selection' in statement && statement.selection.kind === 'named' ? statement.selection.names.map(item => item.name) : []);
    for (const name of ['explainImport', 'LinkedDescriptions', 'SourceAnalysis', 'shopFocusDiagram', 'ProjectResolution', 'IncrementRun', 'ServiceConnector', 'createQuickEnvironment']) expect(names).toContain(name);
    expect(owners.get('analysis')!.document.statements.some(statement => 'from' in statement && statement.from.value === 'increment.ts')).toBe(true);
    const [baseline, plan2] = await reviews('owners.md');
    expect(() => reviewedOwners(baseline.replace('TextSpan, DescriptionToken', 'ChangedSpan, DescriptionToken'), plan2)).toThrow('Abbreviation must match');
  });

  it('layers the owners and selections later plans added over the untouched archived eleven', async () => {
    const archived = reviewedOwners(...await reviews('owners.md'));
    const layered = layeredOwners(archived);
    expect([...layered.keys()].sort()).toEqual(['analysis', 'cli', 'contexts', 'daemon', 'descriptions', 'explorer',
      'integration-tests', 'layout', 'model', 'presentation', 'project', 'project-view', 'ramify', 'service-api', 'typescript']);
    // Each archived declaration is carried through unchanged; every later
    // selection arrives as a layer that names the plan which reviewed it.
    for (const [name, owner] of archived) expect(layered.get(name)!.document).toBe(owner.document);
    expect(layered.get('daemon')!.layers!.map(layer => layer.plan))
      .toEqual(['Plan 6 (project explorer)', 'Plan 6D (behavioral dependency diagram)', 'Plan 8 (signature companions)',
        'Plan 7 (affected modules)', 'Phase 1 project boundaries (root tooling access)']);
    for (const owner of layered.values()) for (const layer of owner.layers ?? []) expect(layer.plan.trim()).not.toBe('');
    // Each archived purpose is carried through unchanged; a later purpose
    // change arrives as a layer that names the plan which reviewed it.
    for (const [name, owner] of archived) expect(layered.get(name)!.purpose).toBe(owner.purpose);
    expect(Object.fromEntries([...layered].filter(([, owner]) => owner.purposeLayers?.length)
      .map(([name, owner]) => [name, owner.purposeLayers!.map(layer => layer.plan)])))
      .toEqual({ ramify: ['Plan 7 (affected modules)'], analysis: ['Plan 7 (affected modules)'], cli: ['Plan 7 (affected modules)'],
        daemon: ['Plan 7 (affected modules)'], contexts: ['Plan 7 (affected modules)'],
        project: ['Phase 1 project boundaries (auxiliary source)'] });
  });

  it('accepts reviewed exposures and purpose while rejecting independent declaration and prose drift', async () => {
    const [, text] = await reviews('owners.md');
    const owner = reviewedOwners(...await reviews('owners.md')).get('daemon')!;
    const declaration = /```ramify\n(ramify 1\nmodule daemon[\s\S]*?)\n```/.exec(text)![1];
    const readme = `# Daemon\n\n${owner.purpose}\n\nImplementation details.\n`;
    expect(() => assertOwner(declaration, readme, owner)).not.toThrow();
    for (const changed of [
      declaration.replace('expose-src connectDaemon from "connect-daemon.ts" to parent\n', ''),
      declaration.replace('connect-daemon.ts', 'wrong-client.ts'),
      declaration.replace('module daemon tagged [dispatch]', 'module daemon'),
      declaration.replace('"start-daemon.ts" to parent', '"start-daemon.ts" to descendants'),
      declaration + '\nexpose-src extra from "private.ts" to parent',
    ]) expect(() => assertOwner(changed, readme, owner)).toThrow('Final selections differ');
    expect(() => assertOwner(declaration, '# Daemon\n\nWrong purpose.\n', owner)).toThrow('Final README purpose differs');
  });

  it.each([
    ['unordered list', '- Introductory item\ncontinued list text\n'],
    ['ordered list', '1. Introductory item\n'],
    ['table', '| Heading |\n| --- |\n| Introductory cell |\n'],
    ['table without leading pipes', 'Heading | Value\n--- | ---\nIntroductory | cell\n'],
    ['fenced code', '```md\nNot the purpose.\n\nStill code.\n```\n'],
    ['tilde fenced code', '~~~~\nNot the purpose.\n~~~\nStill code.\n~~~~\n'],
    ['indented code', '    Not the purpose.\n'],
  ])('compares the first prose purpose after an introductory %s', async (_kind, introduction) => {
    const [, text] = await reviews('owners.md');
    const owner = reviewedOwners(...await reviews('owners.md')).get('daemon')!;
    const declaration = /```ramify\n(ramify 1\nmodule daemon[\s\S]*?)\n```/.exec(text)![1];
    expect(() => assertOwner(declaration, `# Daemon\n\n${introduction}\n${owner.purpose}\n\nLater paragraph.\n`, owner)).not.toThrow();
    expect(() => assertOwner(declaration, `# Daemon\n\n${introduction}`, owner)).toThrow('Missing README prose paragraph');
  });

  it('converts the selected paragraph to plain text without substituting later prose', async () => {
    const [, text] = await reviews('owners.md');
    const owner = reviewedOwners(...await reviews('owners.md')).get('daemon')!;
    const declaration = /```ramify\n(ramify 1\nmodule daemon[\s\S]*?)\n```/.exec(text)![1];
    const formatted = owner.purpose.replace('Daemon owns the resident process', '**Daemon** owns the [resident](./resident.md) `process`')
      .replace("root's", 'root&#39;s').replace(', the local', ',\nthe local');
    expect(() => assertOwner(declaration, `# Daemon\n${formatted}\n`, owner)).not.toThrow();
    expect(() => assertOwner(declaration, `# Daemon\n\nWrong first purpose.\n\n${owner.purpose}\n`, owner)).toThrow('Final README purpose differs');
  });

  it('resolves all eight reviewed targets, reads the added stylesheet without importing it, and rejects missing or broken entries', async () => {
    const metadata = reviewedPackage(...await reviews('contracts.md'));
    expect(Object.keys(metadata.exports).sort()).toEqual(['.', './analysis', './analysis/inventory', './cli', './client', './layout', './model', './presentation']);
    // The reviewed bin target remains the Node entry beside the installed launcher.
    expect([metadata.bin, metadata.nodeEntry]).toEqual([{ ramify: 'dist/src/ramify' }, 'dist/src/cli-entry.js']);
    const root = await mkdtemp(join(tmpdir(), 'ramify-final-entries-'));
    const { nodeEntry, ...reviewed } = metadata;
    // The recorded additions, restated here rather than read from the gate: the
    // canvas entry, and a stylesheet whose string target is read but never
    // imported. Its bytes would throw if anything did import it.
    const canvas = { types: './dist/subs/presentation/src/module-tree-entry.d.ts', import: './dist/subs/presentation/src/module-tree-entry.js' };
    const stylesheet = './dist/subs/presentation/src/module-tree-entry.css';
    const allExports: Record<string, { readonly types: string; readonly import: string } | string> =
      { ...reviewed.exports, './module-tree': canvas, './module-tree.css': stylesheet };
    const manifest = { name: 'ramify.ts', ...reviewed, exports: allExports };
    const put = async (path: string, text: string) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text); };
    // Independent fixtures contain callable bindings, not an empty module
    // that could mask a missing public entry re-export.
    const functions: Record<string, readonly string[]> = {
      '.': ['createAnalysisSession', 'analyzeProject', 'validateProject', 'acquireInventory', 'openRetainedSession', 'resolveProject'],
      './analysis': ['createAnalysisSession', 'analyzeProject', 'validateProject', 'acquireInventory', 'openRetainedSession', 'resolveProject'],
      './analysis/inventory': ['acquireInventory'], './model': ['createDefaultTagRegistry'],
      './presentation': ['ModelDiagram'], './layout': ['placeNodes'], './cli': ['runCli'],
      './client': ['connectDaemon', 'selectEndpoint', 'readDaemonRecord', 'encodeMessage', 'decodeMessage'],
    };
    const source = (names: readonly string[]) => names.map(name => `export function ${name}() {}`).join('\n');
    try {
      await put('package.json', JSON.stringify(manifest));
      for (const [name, entry] of Object.entries(metadata.exports)) {
        await put(entry.types, functions[name].map(name => `export declare function ${name}(): void;`).join('\n'));
        await put(entry.import, source(functions[name]));
      }
      await put(canvas.types, 'export declare function ModuleTreeCanvas(): void;');
      await put(canvas.import, source(['ModuleTreeCanvas']));
      await put(stylesheet, 'throw new Error("stylesheet was imported");\n');
      await put(metadata.bin.ramify, '#!/bin/sh\n'); await put(nodeEntry, '#!/usr/bin/env node\n');
      for (const file of [metadata.bin.ramify, nodeEntry]) await chmod(join(root, file), 0o755);
      expect(await validatePackageEntries(root, metadata)).toBe(8);
      const client = metadata.exports['./client'];
      await rm(join(root, client.types));
      await expect(validatePackageEntries(root, metadata)).rejects.toThrow('ENOENT');
      await put(client.types, 'export {};\n');
      await put(client.import, 'throw new Error("supplied package was imported");\n');
      await expect(validatePackageEntries(root, metadata)).rejects.toThrow('supplied package was imported');
      await put(client.import, 'export {};\n');
      await expect(validatePackageEntries(root, metadata)).rejects.toThrow('Missing callable export: ramify.ts/client#connectDaemon');
      for (const missing of functions['./client']) {
        await put(client.import, source(functions['./client'].filter(name => name !== missing)));
        await expect(validatePackageEntries(root, metadata)).rejects.toThrow(`Missing callable export: ramify.ts/client#${missing}`);
      }
      await put(client.import, source(functions['./client'].filter(name => name !== 'connectDaemon')) + '\nexport const connectDaemon = "not callable";');
      await expect(validatePackageEntries(root, metadata)).rejects.toThrow('Missing callable export: ramify.ts/client#connectDaemon');
      await put(client.import, source(functions['./client']));
      for (const missing of ['openRetainedSession', 'resolveProject']) {
        await put(metadata.exports['.'].import, source(functions['.'].filter(name => name !== missing)));
        await expect(validatePackageEntries(root, metadata)).rejects.toThrow(`Missing callable export: ramify.ts#${missing}`);
      }
      await put(metadata.exports['.'].import, source(functions['.']));
      const { './client': _client, ...seven } = manifest.exports;
      await put('package.json', JSON.stringify({ ...manifest, exports: seven }));
      await expect(validatePackageEntries(root, metadata)).rejects.toThrow('Final package exports');
      await put('package.json', JSON.stringify(manifest));
      const misordered = { ...manifest, exports: { ...manifest.exports, './client': { import: client.import, types: client.types } } };
      await put('package.json', JSON.stringify(misordered));
      await expect(validatePackageEntries(root, metadata)).rejects.toThrow('ramify.ts/client types target');
      await put('package.json', JSON.stringify(manifest));
      expect(await validatePackageEntries(root, metadata)).toBe(8);
      await put(metadata.bin.ramify, '#!/usr/bin/env node\n');
      await expect(validatePackageEntries(root, metadata)).rejects.toThrow('dist/src/ramify must start with #!/bin/sh');
      await put(metadata.bin.ramify, '#!/bin/sh\n');
      await put(nodeEntry, '// missing shebang\n');
      await expect(validatePackageEntries(root, metadata)).rejects.toThrow('dist/src/cli-entry.js must start with #!/usr/bin/env node');
      await put(nodeEntry, '#!/usr/bin/env node\n');
      await chmod(join(root, nodeEntry), 0o644);
      await expect(validatePackageEntries(root, metadata)).rejects.toThrow('dist/src/cli-entry.js must be executable');
      await chmod(join(root, nodeEntry), 0o755);
      await put('package.json', JSON.stringify({ ...manifest, bin: { ramify: nodeEntry } }));
      await expect(validatePackageEntries(root, metadata)).rejects.toThrow('Final package bin');
      // The stylesheet target is probed as a file, never imported: removing it
      // fails, and restoring it passes although its bytes would throw on import.
      await put('package.json', JSON.stringify(manifest));
      await rm(join(root, stylesheet));
      await expect(validatePackageEntries(root, metadata)).rejects.toThrow('ENOENT');
      await put(stylesheet, 'throw new Error("stylesheet was imported");\n');
      expect(await validatePackageEntries(root, metadata)).toBe(8);
      // An entry beyond the reviewed eight is accepted only as a recorded addition.
      await put('package.json', JSON.stringify({ ...manifest, exports: { ...manifest.exports, './surprise': canvas } }));
      await expect(validatePackageEntries(root, metadata)).rejects.toThrow('Final package exports beyond the reviewed entries');
      await put('package.json', JSON.stringify(manifest));
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);
});
