import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { validateProject } from '../subs/analysis/src/validation-entry.js';
import { parseDescription } from '../subs/analysis/subs/descriptions/src/parse.js';
import type { DescriptionDocument } from '../subs/analysis/subs/descriptions/src/interfaces/syntax.js';
import { readPurpose } from '../subs/analysis/subs/project/src/purpose.js';
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

const plan1 = 'docs/plans/done/iteration-1-project-verifier';
const plan2 = 'docs/plans/iteration-2-resident-verification';
interface ReviewedOwner { readonly directory: string; readonly purpose: string; readonly document: DescriptionDocument }
interface PackageMetadata {
  readonly type: string; readonly main: string; readonly types: string;
  readonly bin: { readonly ramify: string };
  readonly exports: Readonly<Record<string, { readonly types: string; readonly import: string }>>;
}

// Independent entry expectations: Plan 1's portable entry witnesses plus
// the analysis and client exports required by Plan 2's activation contract.
const entryFunctions = {
  '.': ['createAnalysisSession', 'analyzeProject', 'validateProject', 'acquireInventory', 'analyzeIncrement', 'resolveProject'],
  './analysis': ['createAnalysisSession', 'analyzeProject', 'validateProject', 'acquireInventory', 'analyzeIncrement', 'resolveProject'],
  './analysis/inventory': ['acquireInventory'], './model': ['createDefaultTagRegistry'],
  './presentation': ['ModelDiagram'], './layout': ['placeNodes'], './cli': ['runCli'],
  './client': ['connectDaemon', 'selectEndpoint', 'readDaemonRecord', 'encodeMessage', 'decodeMessage'],
};

function description(text: string): DescriptionDocument {
  const parsed = parseDescription('reviewed module.ramify', text);
  assert.equal(parsed.status, 'valid', 'Reviewed declaration must parse without abbreviations');
  if (parsed.status !== 'valid') throw new Error('Invalid reviewed declaration');
  return parsed.document;
}

/** Plan 2 abbreviates unchanged named lists. Expand only from the archived
 * Plan 1 review, never from the implementation being checked. */
export function reviewedOwners(baseline: string, resident: string): ReadonlyMap<string, ReviewedOwner> {
  const owners = new Map<string, ReviewedOwner>();
  function add(review: string, abbreviations: boolean): number {
    let count = 0;
    for (const section of review.split(/^## /m)) {
      const block = /```ramify\n([\s\S]*?)\n```/.exec(section)?.[1];
      if (!block) continue;
      const directory = /\*\*Directory:\*\* `([^`]+)`/.exec(section)?.[1];
      const purpose = /^> (.+)$/m.exec(section)?.[1];
      assert.ok(directory && purpose, 'Each reviewed owner needs its directory and purpose');
      const name = /^module "?([\w-]+)"?/m.exec(block)?.[1];
      assert.ok(name);
      const previous = owners.get(name);
      const expanded = block.split('\n').map(line => {
        if (!line.includes('…')) return line;
        assert.ok(abbreviations && previous, `No archived declaration for ${name}`);
        const range = /^expose-sub (\w+), … , (\w+) from (\w+) to (.+)$/.exec(line);
        assert.ok(range, `Unrecognized abbreviation: ${line}`);
        const [, first, last, child, destinations] = range;
        const candidates = previous.document.statements.flatMap(statement => {
          if (statement.kind !== 'expose-sub' || statement.from.value !== child
            || statement.destinations.join(', ') !== destinations || statement.selection.kind !== 'named') return [];
          const names = statement.selection.names;
          const start = names.findIndex(item => item.name === first), end = names.findIndex(item => item.name === last);
          return start < 0 || end < start ? [] : [names.slice(start, end + 1)];
        });
        assert.equal(candidates.length, 1, `Abbreviation must match exactly one archived list: ${line}`);
        return `expose-sub ${candidates[0].map(item => item.name === item.alias ? item.name : `${item.name} as ${item.alias}`).join(', ')} from ${child} to ${destinations}`;
      }).join('\n');
      owners.set(name, { directory, purpose, document: description(expanded) });
      count++;
    }
    return count;
  }
  assert.equal(add(baseline, false), 9, 'All nine archived Plan 1 owners must be present');
  assert.equal(add(resident, true), 6, 'All six Plan 2 owner declarations must be present');
  assert.equal(owners.size, 11, 'All eleven final owners must be present');
  return owners;
}

export function reviewedPackage(baseline: string, resident: string): PackageMetadata {
  const metadata = (text: string): PackageMetadata => {
    const block = [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => match[1]).find(value => value.includes('"bin"'));
    assert.ok(block, 'Reviewed package metadata must be present');
    return JSON.parse(block) as PackageMetadata;
  };
  const original = metadata(baseline), addition = metadata(resident);
  assert.deepEqual(addition.bin, original.bin, 'Plan 2 keeps the bin target');
  assert.deepEqual(Object.keys(addition.exports), ['./client'], 'Plan 2 adds only the client entry');
  const expected = { ...original, exports: { ...original.exports, ...addition.exports } };
  assert.equal(Object.keys(expected.exports).length, 8);
  return expected;
}

export function assertOwner(actual: string, readme: string, expected: ReviewedOwner): void {
  // Comments, line wrapping and grouping of equivalent selections are prose;
  // names, paths, tags, destinations and wildcard/named spelling are contracts.
  assert.deepEqual(manifest(description(actual)), manifest(expected.document), `Final selections differ: ${expected.directory}module.ramify`);
  const purpose = readPurpose(`${expected.directory}README.md`, readme);
  assert.equal(purpose.state, 'present', `Missing README prose paragraph: ${expected.directory}`);
  if (purpose.state === 'present') assert.equal(purpose.paragraph, expected.purpose, `Final README purpose differs: ${expected.directory}`);
}

export async function validatePackageEntries(root: string, expected: PackageMetadata): Promise<number> {
  const actual = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  for (const key of ['type', 'main', 'types', 'bin', 'exports'] as const) assert.deepEqual(actual[key], expected[key], `Final package ${key}`);
  for (const entry of Object.values(expected.exports)) {
    for (const target of [entry.types, entry.import]) assert.ok((await stat(resolve(root, target))).isFile(), `Entry target is not a file: ${target}`);
  }
  // Resolve from the supplied package, including relocated packages. Resolving
  // from this script would accidentally validate this checkout instead.
  const probe = `import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const metadata = JSON.parse(process.argv[1]);
const condition = process.argv[2];
const required = JSON.parse(process.argv[3]);
for (const [name, entry] of Object.entries(metadata.exports)) {
  const specifier = name === '.' ? metadata.name : metadata.name + name.slice(1);
  const url = import.meta.resolve(specifier);
  assert.equal(fileURLToPath(url), resolve(entry[condition]), specifier + ' ' + condition + ' target');
  if (condition === 'import') {
    const values = await import(url);
    for (const binding of required[name]) assert.equal(typeof values[binding], 'function', 'Missing callable export: ' + specifier + '#' + binding);
  }
}`;
  for (const condition of ['import', 'types']) {
    // Type targets are resolved, never executed. In particular, putting an
    // import condition before types must not silently select the JS target.
    await promisify(execFile)(process.execPath, [...condition === 'types' ? ['--conditions=types'] : [],
      '--input-type=module', '--eval', probe, JSON.stringify(actual), condition, JSON.stringify(entryFunctions)],
    { cwd: root, timeout: 30_000, maxBuffer: 1024 * 1024 });
  }
  assert.ok((await readFile(resolve(root, actual.bin.ramify), 'utf8')).startsWith('#!/usr/bin/env node\n'));
  return Object.keys(expected.exports).length;
}

export async function validateFinalContracts(root: string) {
  const read = (path: string) => readFile(resolve(root, path), 'utf8');
  const expected = reviewedOwners(await read(`${plan1}/owners.md`), await read(`${plan2}/owners.md`));
  const metadata = reviewedPackage(await read(`${plan1}/contracts.md`), await read(`${plan2}/contracts.md`));
  const errors: Error[] = [];
  for (const owner of expected.values()) {
    try { assertOwner(await read(`${owner.directory}/module.ramify`), await read(`${owner.directory}/README.md`), owner); }
    catch (error) { errors.push(new Error((error as Error).message.split('\n')[0])); }
  }
  let packageEntries = 0;
  try { packageEntries = await validatePackageEntries(root, metadata); }
  catch (error) { errors.push(new Error((error as Error).message.split('\n')[0])); }
  // Real linking checks every exposure's original export, even when the
  // declaration comparison has already found missing final selections.
  const result = await validateProject(validationInputs(root));
  if (result.status !== 'valid') errors.push(new Error(`Final declarations do not link: ${JSON.stringify(result)}`));
  else {
    const actual = result.input.inventory.modules.map(module => module.description.status === 'valid' ? module.description.document.module.name : '').sort();
    try { assert.deepEqual(actual, [...expected.keys()].sort(), 'Exact eleven final owners'); }
    catch { errors.push(new Error('Exact eleven final owners differ')); }
  }
  if (errors.length) throw new AggregateError(errors, 'Plan 2 final contracts are incomplete');
  assert.equal(result.status, 'valid');
  if (result.status !== 'valid') throw new Error('Final declarations do not link');
  return { owners: result.input.inventory.modules.length, files: result.input.inventory.files.length,
    expandedStatements: result.linked.selections.length, packageEntries, bin: metadata.bin.ramify };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await validateFinalContracts(process.cwd()))); }
  catch (error) {
    console.error(error instanceof AggregateError ? [error.message, ...error.errors.map(item => `- ${(item as Error).message}`)].join('\n') : error);
    process.exitCode = 1;
  }
}
