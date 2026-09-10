import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { instanceFromSeed, inventoryDocument, planDirectory } from './instances.js';
import type { FixtureCode, InstanceSeed, ReferenceInstance } from './instances.js';

export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Frozen independently of instance records and handler registration. */
export const iterationPrerequisites: Readonly<Record<number, readonly number[]>> = {
  1: [], 2: [1], 3: [2], 4: [2], 5: [2, 4], 6: [3, 5],
  7: [3, 4, 5, 6], 8: [7], 9: [7], 10: [9], 11: [9],
  12: [10, 11], 13: [8, 12], 14: [13], 15: [14],
};

export interface ReviewedPlan {
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
  ].flatMap((path) => tableRows(readFileSync(resolve(root, path), 'utf8'))
    .filter((row) => /^[A-Z]+\d{2}$/.test(row[0])).map((row) => row[0])));
  for (const record of records) {
    for (const family of record.families) {
      if (!families.has(family)) issues.push(`Unknown family ${family}: ${record.id}`);
    }
  }
  return issues;
}
