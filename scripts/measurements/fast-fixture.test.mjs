import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fastFixture } from './fast-fixture.mjs';
import { treeIdentity } from './identities.mjs';

const witness = "import './fast-measurement-created.js';\n";
// These small templates exercise edit-fixture invariants only. Real retained
// sessions and the installed CLI separately qualify observation and rendezvous.
async function setup(name, run) {
  const scratch = await mkdtemp(join(tmpdir(), 'fast-fixture-control-'));
  const templates = join(scratch, 'templates');
  const files = name === 'reference' ? {
    'src/assembly.ts': "export type AppRouter = AssembledSystem['router'];\nexport function build() { return { ready: true }; }\n",
    'subs/workspace/README.md': 'Workspace is the browser shell.\n\nFixture documentation.\n',
    'subs/workspace/module.ramify': 'expose-sub createCatalogRouter, createCatalogTools, inspectRecord from catalog to parent\n',
  } : {
    'src/impl0.ts': 'export function implementation(input) { return input.value + value; }\n',
    'subs/m001/src/interfaces/api.ts': 'export const value = 1;\n',
    'subs/m001/module.ramify': 'module fixture\n',
    'subs/m001/README.md': 'Supplies deterministic workload bytes.\n\nFixture documentation.\n',
  };
  files['tsconfig.json'] = '{"compilerOptions":{"target": "ES2022"}}\n';
  try {
    for (const [path, source] of Object.entries(files)) {
      const destination = join(templates, name, path);
      await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, source);
    }
    const frozen = treeIdentity(join(templates, name));
    await run(await fastFixture(scratch, templates, name, name));
    assert.deepEqual(treeIdentity(join(templates, name)), frozen, 'Frozen generator/template bytes must stay unchanged');
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
for (const name of ['reference', 'S100']) {
  test(`${name}: all alternating edits preserve the observed-deletion witness and setup identity`, () => setup(name, async project => {
    const sourcePath = join(project.root, project.body);
    assert.equal((await readFile(sourcePath, 'utf8')).split(witness).length, 2,
      'An unreferenced creation/deletion fixture has no absent-target witness');
    assert.deepEqual(project.setupIdentity, treeIdentity(project.root));
    const expectedImporters = name === 'reference'
      ? ['src/server.ts', 'src/interfaces/protocol.ts', 'src/tests/setup.ts', 'src/tests/http.test.ts']
      : ['src/impl0.ts', ...Array.from({ length: 9 }, (_, index) => `subs/m001/src/impl${index}.ts`)];
    assert.deepEqual(project.sourceImporters, expectedImporters);
    assert.deepEqual(project.creationWitness, { path: project.body, specifier: './fast-measurement-created.js' });
    const initialTarget = await readFile(join(project.root, project.created), 'utf8');
    for (const kind of ['body', 'source', 'description', 'readme', 'configuration']) {
      for (let index = 0; index < 4; index++) {
        await project.change(kind, index);
        assert.equal((await readFile(sourcePath, 'utf8')).split(witness).length, 2, `${kind} ${index} lost or duplicated the witness`);
      }
    }
    for (let index = 0; index < 4; index++) {
      const deleted = await project.change('deleted', index);
      assert.deepEqual(deleted, [{ path: project.created, sha256: null }]);
      assert.equal((await readFile(sourcePath, 'utf8')).split(witness).length, 2);
      await assert.rejects(readFile(join(project.root, project.created)), { code: 'ENOENT' });
      const created = await project.change('created', index);
      assert.equal(created[0].path, project.created); assert.match(created[0].sha256, /^[a-f0-9]{64}$/);
      assert.equal((await readFile(sourcePath, 'utf8')).split(witness).length, 2);
    }
    await project.change('deleted'); await project.change('created', 0);
    assert.equal(await readFile(join(project.root, project.created), 'utf8'), initialTarget);
    assert.deepEqual(project.setupIdentity, treeIdentity(project.root), 'Full edit/revert sequence returns to the recorded setup');
  }));
  test(`${name}: a missing or duplicated witness fails before creation/deletion`, () => setup(name, async project => {
    const sourcePath = join(project.root, project.body), target = join(project.root, project.created);
    const source = await readFile(sourcePath, 'utf8');
    await project.change('deleted');
    await writeFile(sourcePath, source.replace(witness, ''));
    await assert.rejects(project.change('created'), /stable same-owner side-effect import witness/);
    await assert.rejects(readFile(target), { code: 'ENOENT' });
    await writeFile(sourcePath, source); await project.change('created');
    const created = await readFile(target, 'utf8');
    for (const changed of [source.replace(witness, ''), witness + source]) {
      await writeFile(sourcePath, changed);
      await assert.rejects(project.change('deleted'), /stable same-owner side-effect import witness/);
      assert.equal(await readFile(target, 'utf8'), created, 'Guard must not delete the target');
    }
  }));
}
