import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { instanceFromSeed, inventoryDocument, planDirectory, plan2Directory, plan2InventoryDocument, verificationCapabilities } from './instances.js';
import type { EvidenceKind, FixtureCode, InstanceSeed, ReferenceInstance } from './instances.js';

export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Frozen independently of instance records and handler registration. */
export const iterationPrerequisites: Readonly<Record<number, readonly number[]>> = {
  1: [], 2: [1], 3: [2], 4: [2], 5: [2, 4], 6: [3, 5],
  7: [3, 4, 5, 6], 8: [7], 9: [7], 10: [9], 11: [9],
  12: [10, 11], 13: [8, 12], 14: [13], 15: [14],
};

export interface ReviewedPlan {
  readonly number?: 1 | 2;
  readonly members: readonly InstanceSeed[];
  readonly prerequisites: Readonly<Record<number, readonly number[]>>;
}

function tableRows(text: string): string[][] {
  return text.split('\n').filter((line) => line.startsWith('| '))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid reviewed Plan 1 inventory: ${message}`);
}

function familyIds(cell: string): string[] {
  const ids: string[] = [];
  for (const match of cell.matchAll(/([A-Z]+)(\d{2})(?:[–-](?:[A-Z]+)?(\d{2}))?/g)) {
    for (let n = Number(match[2]); n <= Number(match[3] ?? match[2]); n++) {
      ids.push(`${match[1]}${String(n).padStart(2, '0')}`);
    }
  }
  return ids;
}

/** Reads required leaves from the reviewed documents, never from executable records. */
export function readReviewedPlan(root = repositoryRoot): ReviewedPlan {
  const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
  const subcaseRows = tableRows(read(inventoryDocument));
  const mainRows = tableRows(read(`${planDirectory}/main-plan.md`));
  const groups = subcaseRows.filter((row) => /^I1-\d{2}:[^/]+$/.test(row[0]));
  const variants = subcaseRows.filter((row) => /^I1-\d{2}:[^/]+\//.test(row[0]));
  requireCondition(groups.length === 187 && groups.every((row) => row.length === 6), 'expected 187 complete matrix groups');
  requireCondition(variants.length === 168 && variants.every((row) => row.length === 3), 'expected 168 complete variants');
  const groupIds = new Set(groups.map((row) => row[0]));
  requireCondition(groupIds.size === groups.length, 'duplicate group');
  requireCondition(variants.every((row) => groupIds.has(row[0].split('/')[0])), 'orphan variant');

  const matrix = new Map(mainRows.filter((row) => /^I1-\d{2}$/.test(row[0]))
    .map((row) => [row[0], familyIds(row[1])]));
  requireCondition(matrix.size === 30, 'expected 30 matrix rows');

  const sequence = mainRows.filter((row) => /^\d+$/.test(row[0]) && row[1]?.includes('iterations/iteration'));
  requireCondition(sequence.length === 15, 'expected 15 iterations');
  for (const row of sequence) {
    const index = Number(row[0]);
    const prerequisites = row[2].match(/\d+/g)?.map(Number) ?? [];
    requireCondition(JSON.stringify(prerequisites) === JSON.stringify(iterationPrerequisites[index]), `iteration ${index} prerequisites differ from main plan`);
    if (index > 1) {
      const draft = subcaseRows.find((candidate) => candidate[0] === row[0] && candidate.length === 3);
      requireCondition(draft && JSON.stringify(draft[1].match(/\d+/g)?.map(Number) ?? []) === JSON.stringify(prerequisites), `iteration ${index} prerequisites differ from subcase list`);
    }
  }

  const members: InstanceSeed[] = [];
  for (const [group, iteration, capabilities, fixture, mutation, expectation] of groups) {
    const children = variants.filter((row) => row[0].split('/')[0] === group);
    for (const [id, variantMutation, variantExpectation] of children.length ? children : [[group]]) {
      let code = fixture;
      if (fixture === 'F / J') code = id.endsWith('/jsdoc-javascript') ? 'J' : 'F';
      if (fixture === 'T / F') code = id.endsWith('/toolkit') ? 'T' : 'F';
      requireCondition(['R', 'F', 'J', 'T', 'M', 'H'].includes(code), `unknown fixture ${code}`);
      const families = matrix.get(group.split(':')[0]);
      requireCondition(families?.length, `missing matrix/families for ${group}`);
      members.push([id, Number(iteration), families, capabilities, code as FixtureCode,
        mutation, expectation, variantMutation ?? null, variantExpectation ?? null]);
    }
  }
  requireCondition(members.length === 308 && new Set(members.map(([id]) => id)).size === 308, 'expected 308 distinct leaves');
  return { members, prerequisites: iterationPrerequisites };
}

export function requiredIterations(plan: ReviewedPlan, iteration?: number): number[] {
  if (iteration === undefined) return Object.keys(plan.prerequisites).map(Number).sort((a, b) => a - b);
  const visited = new Set<number>();
  const visiting = new Set<number>();
  function visit(index: number): void {
    if (visiting.has(index)) throw new Error(`Cyclic prerequisite at iteration ${index}`);
    if (visited.has(index)) return;
    const dependencies = plan.prerequisites[index];
    if (!dependencies) throw new Error(`Unknown iteration: ${index}`);
    visiting.add(index);
    dependencies.forEach(visit);
    visiting.delete(index);
    visited.add(index);
  }
  visit(iteration);
  return [...visited].sort((a, b) => a - b);
}

export function validateInstanceRecords(records: readonly ReferenceInstance[], plan: ReviewedPlan): string[] {
  const issues: string[] = [];
  const expected = new Map(plan.members.map((seed) => [seed[0], instanceFromSeed(seed)]));
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) issues.push(`Duplicate instance: ${record.id}`);
    seen.add(record.id);
    const member = expected.get(record.id);
    if (!member) issues.push(`Unreviewed instance: ${record.id}`);
    else if (JSON.stringify(record) !== JSON.stringify(member)) issues.push(`Instance differs from reviewed metadata: ${record.id}`);
  }
  for (const id of expected.keys()) {
    if (!seen.has(id)) issues.push(`Missing reviewed instance: ${id}`);
  }
  return issues;
}

/** Pointer integrity is a catalogue check, with no source conformance claim. */
export function validateInstancePointers(records: readonly ReferenceInstance[], root = repositoryRoot): string[] {
  const issues: string[] = [];
  const pointers = new Set(records.flatMap((record) => [
    ...record.pointers, record.fixture.recipe, record.expectedCoverage.convention,
  ]));
  for (const pointer of pointers) {
    const [path, anchor] = pointer.split('#');
    if (path.startsWith('/') || path.split('/').includes('..') || !existsSync(resolve(root, path))) {
      issues.push(`Invalid inventory pointer: ${pointer}`);
    } else if (anchor) {
      const headings = readFileSync(resolve(root, path), 'utf8').split('\n')
        .filter((line) => /^#{1,6} /.test(line))
        .map((line) => line.replace(/^#+ /, '').toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').replace(/ /g, '-'));
      if (!headings.includes(anchor)) issues.push(`Missing inventory anchor: ${pointer}`);
    }
  }
  const families = new Set([
    'docs/plans/reference-project/cases.md', 'docs/architecture/daemon.md',
    'docs/architecture/processes-and-clients.md', 'docs/architecture/quick-testing.spec.md',
    'docs/architecture/memory-lifecycle.md',
  ].flatMap((path) => tableRows(readFileSync(resolve(root, path), 'utf8'))
    .filter((row) => /^[A-Z]+\d{2}$/.test(row[0])).map((row) => row[0])));
  for (const record of records) {
    for (const family of record.families) {
      if (family === 'harness' && record.matrixId === 'I2-28') continue;
      if (!families.has(family)) issues.push(`Unknown family ${family}: ${record.id}`);
    }
  }
  return issues;
}

/** Plan 2 scheduling is independent of Plan 1 and of available handlers. */
export const plan2Prerequisites: Readonly<Record<number, readonly number[]>> = {
  1: [], 2: [1], 3: [2], 4: [3], 5: [4], 6: [5], 7: [5],
  8: [7], 9: [6, 8], 10: [9], 11: [10], 12: [10], 13: [10], 14: [11, 12, 13],
};
const plan2Titles = [
  'Contract package, probes and review points',
  'New owner skeletons, harness `--plan 2` and synthetic generators',
  'Analysis increments and project resolution', 'Contexts owner',
  'Shared service, root interface and quick environment',
  'Edit semantics through the quick service', 'Codec, discovery and the lightweight client',
  'Daemon host, records, process entry and real IPC', 'CLI commands and fallback',
  'Entries, final declarations and boundaries', 'Reference edit sequences and equivalence gate',
  'Real process lifecycle and recovery suite', 'Resident measurements and budgets',
  'Self-check, relocation, completion report',
];
const plan2Counts = [0, 4, 18, 27, 15, 20, 0, 22, 28, 5, 9, 13, 9, 6];

export function readReviewedPlan2(root = repositoryRoot): ReviewedPlan {
  const require = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(`Invalid reviewed Plan 2 inventory: ${message}`);
  };
  const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
  const inventory = read(plan2InventoryDocument);
  const rows = tableRows(inventory);
  const main = tableRows(read(`${plan2Directory}/main-plan.md`));
  const leaves = rows.filter(row => /^I2-\d{2}:/.test(row[0]));
  require(leaves.length === 176 && new Set(leaves.map(row => row[0])).size === 176
    && leaves.every(row => row.length === 8), 'expected 176 distinct complete leaves');
  const matrixRows = main.filter(row => /^I2-\d{2}$/.test(row[0]));
  const matrix = new Map(matrixRows.map(row => [row[0], row]));
  require(matrixRows.length === 30 && matrix.size === 30, 'expected 30 distinct matrix groups');
  const sequence = main.filter(row => /^\d+$/.test(row[0]) && row.length === 5);
  require(sequence.length === 14, 'expected fourteen sequence rows');
  const members: InstanceSeed[] = leaves.map(([id, iteration, families, capability, selection, evidence, mutation, expectation]) => {
    const group = matrix.get(id.split(':')[0]);
    require(group && group[2].includes('`' + id.split(':')[1] + '`'), `missing matrix subcase ${id}`);
    const code = selection.split(/[/,×]/)[0];
    require(['R', 'F', 'T', 'S100', 'S500', 'S1000', 'Q', 'M', 'P', 'H', '—'].includes(code), `unknown fixture ${selection}`);
    require(['api', 'unit', 'quick', 'ipc', 'process', 'measurement'].includes(evidence), `unknown evidence ${evidence}`);
    require(verificationCapabilities.includes(capability as typeof verificationCapabilities[number]), `unknown capability ${capability}`);
    require(/^(?:[2-9]|1[0-4])$/.test(iteration) && iteration !== '7', `invalid implementing iteration for ${id}`);
    return [id, Number(iteration), families.split(', '), capability, code as FixtureCode,
      mutation, expectation, null, null, { selection, evidence: evidence as EvidenceKind }];
  });
  for (let offset = 0; offset < 14; offset++) {
    const index = offset + 1;
    const row = sequence[offset];
    require(row[0] === String(index) && row[1] === plan2Titles[offset], `sequence index/title differs at ${index}`);
    const prerequisites = row[3].match(/\d+/g)?.map(Number) ?? [];
    require(JSON.stringify(prerequisites) === JSON.stringify(plan2Prerequisites[index]), `iteration ${index} prerequisites differ from main plan`);
    const assigned = members.filter(member => member[1] === index);
    require(assigned.length === plan2Counts[offset], `iteration ${index} instance count differs`);
    if (index === 1) continue;
    const draft = rows.filter(candidate => candidate[0] === String(index) && candidate.length === 3);
    require(draft.length === 1 && JSON.stringify(draft[0][1].match(/\d+/g)?.map(Number) ?? []) === JSON.stringify(prerequisites),
      `iteration ${index} prerequisites differ from subcase list`);
    const groups = [...new Set(assigned.map(member => member[0].split(':')[0]))].sort();
    for (const cell of [row[4], draft[0]?.[2] ?? '']) {
      require(JSON.stringify(cell.match(/I2-\d{2}/g)?.sort() ?? []) === JSON.stringify(groups), `iteration ${index} matrix assignments differ`);
    }
    const count = rows.filter(candidate => candidate.length === 2 && candidate[0] === String(index));
    require(count.length === 1 && Number(count[0][1]) === assigned.length, `iteration ${index} declared count differs`);
  }
  for (const group of matrix.keys()) require(members.some(member => member[0].startsWith(group + ':')), `empty matrix group ${group}`);
  require(rows.some(row => row[0] === 'Total' && row[1] === '176'), 'declared total differs');
  return { number: 2, members, prerequisites: plan2Prerequisites };
}
