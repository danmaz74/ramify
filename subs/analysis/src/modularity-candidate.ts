import type {
  BoundaryChange,
  BoundaryChanges,
  CandidateOwnership,
  OwnershipIssue,
  OwnershipModule,
} from './interfaces/modularity.js';
import type { ModuleId } from '../subs/model/src/interfaces/model.js';
import type { SourceAccess } from '../subs/typescript/src/interfaces/source.js';
import type { InventoryFile } from '../subs/project/src/interfaces/project.js';
import {
  byteOrder,
  declaredOwnership,
  testingClassified,
  type CompleteReport,
  type Occurrence,
  type OwnershipResolver,
  type ViewFacts,
} from './modularity-context.js';

/**
 * Candidate ownership of docs/architecture/modularity-report.spec.md: the
 * validated resolver that substitutes a hypothetical module tree and file
 * mapping for declared ownership, and the boundary changes it causes.
 */

export type ResolvedOwnership =
  | { readonly status: 'valid'; readonly ownership: OwnershipResolver }
  | { readonly status: 'invalid'; readonly issues: readonly OwnershipIssue[] };

/** Declared ownership, or the validated candidate when one is given. */
export function resolveOwnership(report: CompleteReport, candidate: CandidateOwnership | undefined): ResolvedOwnership {
  return candidate === undefined ? { status: 'valid', ownership: declaredOwnership(report) } : candidateOwnership(report, candidate);
}

const namePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const validModuleId = (id: unknown): id is ModuleId =>
  typeof id === 'string' && id.split('/').every(name => namePattern.test(name));
/** Control characters and lone surrogates; a spread string yields each lone surrogate separately. */
const invalidCharacter = (code: number): boolean => code < 0x20 || (code >= 0x7f && code < 0xa0) || (code >= 0xd800 && code < 0xe000);
const validLabel = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0
  && ![...value].some(character => invalidCharacter(character.codePointAt(0)!));
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const subjectOf = (value: unknown, fallback: string): string => typeof value === 'string' ? value : fallback;

/**
 * Validates a candidate against the report's inventory, registry and declared
 * testing classification. Every issue is returned, ordered by code then subject.
 */
export function candidateOwnership(report: CompleteReport, candidate: CandidateOwnership): ResolvedOwnership {
  const issues: OwnershipIssue[] = [];
  const add = (code: OwnershipIssue['code'], subject: string, message: string) => issues.push({ code, subject, message });
  const input: unknown = candidate;
  if (!isRecord(input)) {
    add('invalid-candidate-id', '', 'The candidate must be an object with id, modules and files');
    return { status: 'invalid', issues };
  }
  if (!validLabel(input.id)) add('invalid-candidate-id', subjectOf(input.id, ''), 'The candidate id must be non-empty text without control characters');

  const tagNames = new Set(report.registry.definitions.map(definition => definition.name));
  const declaredRoot = report.snapshot.model.modules.find(module => module.parent === null)?.id ?? null;
  const modules = new Map<ModuleId, OwnershipModule>();
  const moduleEntries: readonly unknown[] = Array.isArray(input.modules) ? input.modules : [];
  if (!Array.isArray(input.modules)) add('invalid-tree', '', 'The candidate modules must be an array');
  for (const [index, entry] of moduleEntries.entries()) {
    const record = isRecord(entry) ? entry : {};
    const subject = subjectOf(record.id, `modules[${index}]`);
    const { id, name, parent, headerTags } = record;
    if (!validModuleId(id) || typeof name !== 'string' || !namePattern.test(name) || (parent !== null && !validModuleId(parent))) {
      add('invalid-module-id', subject, 'A module requires a valid identity, name and parent');
      continue;
    }
    const expected = parent === null ? name : `${parent}/${name}`;
    if (id !== expected) {
      add('invalid-module-id', subject, `Module "${id}" must have identity "${expected}"`);
      continue;
    }
    if (!Array.isArray(headerTags) || !headerTags.every(tag => typeof tag === 'string' && tagNames.has(tag))) {
      add('invalid-module-id', subject, `Module "${id}" header tags must name tags of the analysis registry`);
      continue;
    }
    if (modules.has(id)) {
      add('duplicate-module', id, `Module "${id}" is listed more than once`);
      continue;
    }
    modules.set(id, { id, name, parent, headerTags: [...new Set(headerTags as string[])].sort(byteOrder) });
  }
  const roots = [...modules.values()].filter(module => module.parent === null);
  if (roots.length !== 1) add('invalid-tree', '', `The candidate tree must have exactly one root, not ${roots.length}`);
  else if (roots[0]!.id !== declaredRoot) {
    add('invalid-tree', roots[0]!.id, `The candidate root must be the declared root "${declaredRoot}"`);
  }
  for (const module of modules.values()) {
    if (module.parent !== null && !modules.has(module.parent)) {
      add('invalid-tree', module.id, `Unknown parent "${module.parent}" for module "${module.id}"`);
    }
    // Unreachable while identities embed their parent; retained for the model's acyclicity rule.
    const seen = new Set([module.id]);
    for (let parent = module.parent; parent !== null && modules.has(parent); parent = modules.get(parent)!.parent) {
      if (seen.has(parent)) {
        add('invalid-tree', module.id, `Cyclic ownership at module "${module.id}"`);
        break;
      }
      seen.add(parent);
    }
  }

  const inventory = new Map(report.snapshot.inventory.files.map(file => [file.path, file]));
  const reassigned = new Map<string, ModuleId>();
  /** Paths listed in `files`, valid or not; they are not retained files. */
  const listed = new Set<string>();
  const fileEntries: readonly unknown[] = Array.isArray(input.files) ? input.files : [];
  if (!Array.isArray(input.files)) add('unknown-file', '', 'The candidate files must be an array');
  const counts = new Map<string, number>();
  for (const entry of fileEntries) {
    const path = isRecord(entry) ? entry.path : undefined;
    if (typeof path === 'string') counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  for (const [index, entry] of fileEntries.entries()) {
    const record = isRecord(entry) ? entry : {};
    const path = record.path;
    if (typeof path !== 'string' || !inventory.has(path)) {
      add('unknown-file', subjectOf(path, `files[${index}]`), 'A reassigned path must be an inventory file');
      continue;
    }
    if (listed.has(path)) continue;
    listed.add(path);
    if (counts.get(path)! > 1) {
      add('duplicate-file', path, `File "${path}" is reassigned ${counts.get(path)} times`);
      continue;
    }
    if (typeof record.owner !== 'string' || !modules.has(record.owner)) {
      add('unknown-owner', path, `File "${path}" names owner "${String(record.owner)}", absent from the candidate tree`);
      continue;
    }
    reassigned.set(path, record.owner);
  }
  const testingUnder = (file: InventoryFile, owner: ModuleId): boolean =>
    file.area === 'tests' || modules.get(owner)!.headerTags.includes('testing');
  for (const file of [...inventory.values()].sort((left, right) => byteOrder(left.path, right.path))) {
    let owner: ModuleId;
    if (listed.has(file.path)) {
      if (!reassigned.has(file.path)) continue;
      owner = reassigned.get(file.path)!;
    } else if (modules.has(file.owner)) {
      owner = file.owner;
    } else {
      add('unknown-owner', file.path, `File "${file.path}" keeps owner "${file.owner}", absent from the candidate tree`);
      continue;
    }
    const candidateTesting = testingUnder(file, owner);
    if (candidateTesting !== testingClassified(report, file)) {
      add('classification-change', file.path,
        `Under owner "${owner}" file "${file.path}" would ${candidateTesting ? 'become' : 'stop being'} testing-classified`);
    }
  }

  if (issues.length) {
    return { status: 'invalid', issues: issues.sort((left, right) => byteOrder(left.code, right.code)
      || byteOrder(left.subject, right.subject) || byteOrder(left.message, right.message)) };
  }
  const owners = new Map(report.snapshot.inventory.files.map(file => [file.path, reassigned.get(file.path) ?? file.owner]));
  return { status: 'valid', ownership: {
    mode: 'candidate',
    candidateId: input.id as string,
    modules: [...modules.values()].sort((left, right) => byteOrder(left.id, right.id)),
    ownerOf: path => owners.get(path) ?? null,
    declaredExposure: false,
  } };
}

/**
 * Application occurrences of both views whose (consumer, provider) differs
 * from declared ownership, ordered by access id then filter and capped.
 */
export function boundaryChanges(candidateViews: readonly ViewFacts[], declared: ReadonlyMap<SourceAccess, Occurrence>,
  maxBoundaryChanges: number): BoundaryChanges {
  const changes: BoundaryChange[] = [];
  for (const view of candidateViews) {
    for (const occurrence of view.occurrences) {
      if (occurrence.kind !== 'application') continue;
      const before = declared.get(occurrence.access);
      if (!before || before.provider === null) continue;
      if (before.consumer === occurrence.consumer && before.provider === occurrence.provider) continue;
      const wasSame = before.consumer === before.provider;
      const isSame = occurrence.consumer === occurrence.provider;
      changes.push({
        accessId: occurrence.access.id,
        filter: view.filter,
        importer: occurrence.importer,
        target: occurrence.target!,
        runtimeLoad: occurrence.runtime,
        declared: { consumer: before.consumer, provider: before.provider },
        candidate: { consumer: occurrence.consumer, provider: occurrence.provider! },
        change: wasSame === isSame ? 'changed-owners' : isSame ? 'became-same-owner' : 'became-cross-owner',
      });
    }
  }
  changes.sort((left, right) => byteOrder(left.accessId, right.accessId) || byteOrder(left.filter, right.filter));
  const limit = Math.max(0, maxBoundaryChanges);
  return { total: changes.length, changes: changes.slice(0, limit), truncated: changes.length > limit };
}
