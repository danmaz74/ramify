import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertOwner, reviewedOwners, reviewedPackage, validatePackageEntries } from '../validate-final-contracts.js';
import { repositoryRoot } from './plan.js';

const archive = 'docs/plans/done/iteration-1-project-verifier';
const resident = 'docs/plans/iteration-2-resident-verification';
async function reviews(file: string): Promise<[string, string]> {
  return [await readFile(join(repositoryRoot, archive, file), 'utf8'), await readFile(join(repositoryRoot, resident, file), 'utf8')];
}

describe('Plan 2 final contract validator', () => {
  it('requires eleven owners and expands every abbreviation from the archived review', async () => {
    const owners = reviewedOwners(...await reviews('owners.md'));
    expect([...owners.keys()].sort()).toEqual(['analysis', 'cli', 'contexts', 'daemon', 'descriptions', 'layout', 'model', 'presentation', 'project', 'ramify', 'typescript']);
    const names = owners.get('ramify')!.document.statements.flatMap(statement => statement.selection.kind === 'named' ? statement.selection.names.map(item => item.name) : []);
    for (const name of ['explainImport', 'LinkedDescriptions', 'SourceAnalysis', 'shopFocusDiagram', 'ProjectResolution', 'IncrementRun', 'ServiceConnector', 'createQuickEnvironment']) expect(names).toContain(name);
    expect(owners.get('analysis')!.document.statements.some(statement => statement.from.value === 'increment.ts')).toBe(true);
    const [baseline, plan2] = await reviews('owners.md');
    expect(() => reviewedOwners(baseline.replace('TextSpan, DescriptionToken', 'ChangedSpan, DescriptionToken'), plan2)).toThrow('Abbreviation must match');
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

  it('resolves all eight runtime and type targets from the supplied package and rejects missing or broken entries', async () => {
    const metadata = reviewedPackage(...await reviews('contracts.md'));
    expect(Object.keys(metadata.exports).sort()).toEqual(['.', './analysis', './analysis/inventory', './cli', './client', './layout', './model', './presentation']);
    const root = await mkdtemp(join(tmpdir(), 'ramify-final-entries-'));
    const manifest = { name: 'ramify.ts', ...metadata };
    const put = async (path: string, text: string) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text); };
    try {
      await put('package.json', JSON.stringify(manifest));
      for (const entry of Object.values(metadata.exports)) {
        await put(entry.types, 'export declare const marker: string;\n');
        await put(entry.import, 'export const marker = "fixture";\n');
      }
      await put(metadata.bin.ramify, '#!/usr/bin/env node\n');
      expect(await validatePackageEntries(root, metadata)).toBe(8);
      const client = metadata.exports['./client'];
      await rm(join(root, client.types));
      await expect(validatePackageEntries(root, metadata)).rejects.toThrow('ENOENT');
      await put(client.types, 'export {};\n');
      await put(client.import, 'throw new Error("supplied package was imported");\n');
      await expect(validatePackageEntries(root, metadata)).rejects.toThrow('supplied package was imported');
      await put(client.import, 'export {};\n');
      const { './client': _client, ...seven } = metadata.exports;
      await put('package.json', JSON.stringify({ ...manifest, exports: seven }));
      await expect(validatePackageEntries(root, metadata)).rejects.toThrow('Final package exports');
      await put('package.json', JSON.stringify(manifest));
      await put(metadata.bin.ramify, '// missing shebang\n');
      await expect(validatePackageEntries(root, metadata)).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);
});
