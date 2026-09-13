import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './resident-driver.mjs';
import { sha256 } from './common.mjs';
import { treeIdentity } from './identities.mjs';

/** The frozen generators stay unchanged. Each workload owns this explicit edit setup. */
export async function fastFixture(scratch, templates, name, suffix) {
  const project = await fixture(scratch, templates, name, suffix);
  const reference = name === 'reference';
  const body = reference ? 'src/assembly.ts' : 'src/impl0.ts';
  const source = reference ? 'src/assembly.ts' : 'subs/m001/src/interfaces/api.ts';
  const description = reference ? 'subs/workspace/module.ramify' : 'subs/m001/module.ramify';
  const readme = reference ? 'subs/workspace/README.md' : 'subs/m001/README.md';
  const created = 'src/fast-measurement-created.ts';
  // A deleted unreferenced file has no absent-path observation. Keep this
  // same-owner import present through every edit so deletion can rendezvous
  // with the compiler's observation of the now-missing target.
  const creationWitness = "import './fast-measurement-created.js';\n";
  const bodyText = await readFile(join(project.root, body), 'utf8');
  assert.ok(!bodyText.includes(creationWitness), 'Creation witness must be an explicit measurement setup addition');
  await writeFile(join(project.root, body), creationWitness + bodyText);
  // Begin with complete coverage. Each measured pair deletes this owned target
  // and then recreates it; only the deleted phase has an unresolved-target note.
  await writeFile(join(project.root, created), 'export const createdMeasurement = 0;\n', { flag: 'wx' });
  const originals = new Map();
  for (const path of new Set([body, source, description, readme, 'tsconfig.json'])) {
    originals.set(path, await readFile(join(project.root, path), 'utf8'));
  }
  const definitions = {
    body: [body, reference ? 'return {' : 'return input.value + value;',
      reference ? 'void 1; return {' : 'return input.value + value + 1;'],
    source: [source, originals.get(source), originals.get(source) + '\nexport const fastMeasurementExport = 1;\n'],
    description: [description, reference
      ? 'expose-sub createCatalogRouter, createCatalogTools, inspectRecord from catalog to parent'
      : 'expose-src value from "interfaces/api.ts" to parent', reference
      ? 'expose-sub createCatalogTools, inspectRecord from catalog to parent'
      : '// measurement exposure removed'],
    readme: [readme, originals.get(readme), originals.get(readme).replace(/\n\n/, '\n\nMeasured purpose. ')],
    configuration: ['tsconfig.json', '"target": "ES2022"', '"target": "ES2021"'],
  };
  for (const [path, before] of Object.values(definitions)) {
    assert.equal(originals.get(path).split(before).length, 2, `Unique edit anchor: ${name}/${path}`);
  }
  const sourceImporters = reference
    ? ['src/server.ts', 'src/interfaces/protocol.ts', 'src/tests/setup.ts', 'src/tests/http.test.ts']
    : ['src/impl0.ts', ...Array.from({ length: 9 }, (_, index) => `subs/m001/src/impl${index}.ts`)];
  return { ...project, body, source, created, sourceImporters,
    creationWitness: { path: body, specifier: './fast-measurement-created.js' },
    setupIdentity: treeIdentity(project.root),
    async change(kind, index = 0) {
      let path, next;
      if (kind === 'created' || kind === 'deleted') {
        assert.equal((await readFile(join(project.root, body), 'utf8')).split(creationWitness).length, 2,
          'Created/deleted measurement requires one stable same-owner side-effect import witness');
        path = created;
        next = kind === 'created' ? `export const createdMeasurement = ${index};\n` : null;
        if (next === null) await unlink(join(project.root, path));
        else await writeFile(join(project.root, path), next, { flag: 'wx' });
      } else {
        const [file, before, after] = definitions[kind]; path = file;
        const original = originals.get(path), modified = original.replace(before, after);
        assert.equal(await readFile(join(project.root, path), 'utf8'), index % 2 ? modified : original, 'Edit fixture drift');
        next = index % 2 ? original : modified;
        await writeFile(join(project.root, path), next);
      }
      return [{ path, sha256: next === null ? null : sha256(next) }];
    },
  };
}
