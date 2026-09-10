import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProject } from '../subs/analysis/src/validation-entry.js';
import { parseDescription } from '../subs/analysis/subs/descriptions/src/parse.js';
import type { DescriptionDocument } from '../subs/analysis/subs/descriptions/src/interfaces/syntax.js';
import { validationInputs } from './reference-harness/linking-expectations.js';

/** Compare atomic selections so grouping named statements creates no false drift. */
function manifest(document: DescriptionDocument): unknown {
  return { name: document.module.name, tags: [...document.module.tags].sort(),
    selections: document.statements.flatMap(statement => statement.destinations.flatMap(destination =>
      (statement.selection.kind === 'wildcard' ? [{ name: '*', alias: '*', wildcard: true }]
        : statement.selection.names.map(({ name, alias }) => ({ name, alias, wildcard: false })))
        .map(selection => JSON.stringify({ kind: statement.kind, from: statement.from.value, destination,
          tags: statement.tags ? [...statement.tags.values].sort() : null, ...selection })))).sort() };
}

export async function validateFinalContracts(root: string) {
  const reviewed = await readFile(resolve(root, 'docs/plans/done/iteration-1-project-verifier/owners.md'), 'utf8');
  const blocks = [...reviewed.matchAll(/```ramify\n([\s\S]*?)\n```/g)].map(match => parseDescription('owners.md', match[1]));
  assert.equal(blocks.length, 9, 'All nine reviewed final owners must be present');
  const expected = new Map(blocks.map(block => {
    assert.equal(block.status, 'valid');
    if (block.status !== 'valid') throw new Error('Invalid reviewed contract');
    return [block.document.module.name, manifest(block.document)];
  }));
  const result = await validateProject(validationInputs(root));
  assert.equal(result.status, 'valid', JSON.stringify(result.status === 'valid' ? [] : result));
  if (result.status !== 'valid') throw new Error('Final declarations do not link');
  assert.equal(result.input.inventory.modules.length, 9);
  for (const module of result.input.inventory.modules) {
    assert.equal(module.description.status, 'valid');
    if (module.description.status !== 'valid') throw new Error('Invalid description');
    const document = module.description.document;
    assert.deepEqual(manifest(document), expected.get(document.module.name), `Final selections differ for ${module.id}`);
  }
  const contracts = await readFile(resolve(root, 'docs/plans/done/iteration-1-project-verifier/contracts.md'), 'utf8');
  const metadata = JSON.parse([...contracts.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => match[1]).find(text => text.includes('"bin"'))!);
  const actual = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  for (const key of ['type', 'main', 'types', 'bin', 'exports']) assert.deepEqual(actual[key], metadata[key], `Final package ${key}`);
  const entries = Object.entries(actual.exports) as [string, { types: string; import: string }][];
  for (const [name, entry] of entries) {
    await access(resolve(root, entry.types)); await access(resolve(root, entry.import));
    // Exercise Node's installed package entry resolution, including its type-free runtime.
    const resolved = import.meta.resolve(name === '.' ? actual.name : actual.name + name.slice(1));
    assert.equal(fileURLToPath(resolved), resolve(root, entry.import));
    await import(resolved);
  }
  const executable = await readFile(resolve(root, actual.bin.ramify), 'utf8');
  assert.ok(executable.startsWith('#!/usr/bin/env node\n'));
  return { owners: result.input.inventory.modules.length, files: result.input.inventory.files.length,
    expandedStatements: result.linked.selections.length, packageEntries: entries.length, bin: actual.bin.ramify };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await validateFinalContracts(process.cwd())));
}
