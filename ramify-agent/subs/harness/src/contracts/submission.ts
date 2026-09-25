import { posix, sep } from 'node:path';
import { z } from 'zod';
import { findModule, type ArchitectIndex } from '../../subs/evidence/src/views.js';
import type { JsonSchema } from '../../subs/agent/src/interfaces/port.js';
import { modulePathSchema } from '../interfaces/protocol/evidence.js';
import { slugSchema } from '../analysis/records.js';
import { validateAgainst, type SubmissionError, type SubmissionValidation } from '../run/submissions.js';
import { isFakeFile } from './naming.js';
import { ancestorsOf, ownerOf } from './parity.js';
import { contractAuthoritySchema, contractModeSchema, standsForSchema } from './records.js';

/*
 * What an engineer writes when the behavior it needs is outside its scope,
 * and what the contract sub-session submits when its work is done.
 *
 * The need is written as behavior and not as an interface: use cases,
 * inputs, outputs, side effects, constraints and the executable evidence
 * that already exists. Naming the design would decide for the other side,
 * which is what a contract iteration exists to prevent.
 *
 * `established` registers; `incomplete` registers nothing. Neither carries
 * an identifier the harness assigned, a gate, a test selection or a
 * revision number: the harness owns all of them, and a contract engineer
 * cannot choose the revision it establishes.
 */

const text = z.string().min(1);

/** A need stated as behavior, which the contract iteration designs an interface for. */
export const needAsBehaviorSchema = z.object({
  /** The capability the need is for, as the registry names it or would name it. */
  capability: slugSchema,
  useCases: z.array(text).min(1),
  inputs: z.array(text),
  outputs: z.array(text),
  sideEffects: z.array(text),
  constraints: z.array(text),
  /** Executable evidence that already exists: the tests that state the need. */
  existingEvidence: z.array(text),
}).strict();
export type NeedAsBehavior = z.infer<typeof needAsBehaviorSchema>;

/** One artifact the session wrote, as it names it. The harness hashes it itself. */
const artifactBody = z.object({ path: text, exports: z.array(text) }).strict();

/** A fake file, and the real provider export each of its exported names stands for. */
const fakeBody = artifactBody.extend({ standsFor: z.array(standsForSchema) }).strict();

export const contractSubmissionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('established'),
    mode: contractModeSchema,
    authority: contractAuthoritySchema,
    provider: modulePathSchema,
    behavior: text,
    artifacts: z.object({
      interface: z.array(artifactBody),
      conformance: z.array(z.object({ path: text }).strict()),
      fake: z.array(fakeBody),
      exposure: z.array(z.object({ path: text, declaration: text }).strict()),
    }).strict(),
    /** Where the consumer holds the fake, which verification replaces with the real provider. */
    fakeInjections: z.array(text),
    summary: text,
  }).strict(),
  z.object({
    kind: z.literal('incomplete'),
    done: z.array(text),
    unfinished: z.array(text).min(1),
    findings: z.array(text),
  }).strict(),
]);
export type ContractSubmission = z.infer<typeof contractSubmissionSchema>;
export type EstablishedContract = Extract<ContractSubmission, { kind: 'established' }>;

/** The members this iteration's package offers the role. */
export const contractSubmissionKinds = ['established', 'incomplete'] as const;

/** The schema the agent's tool is given, taken from the same definition that validates. */
export const contractJsonSchema = z.toJSONSchema(contractSubmissionSchema) as JsonSchema;

export const contractToolName = 'submit_contract_result';

/** What the rules beyond the schema are checked against. */
export interface ContractEvidence {
  /** The refreshed architect view, or null where the run has none. */
  readonly index: ArchitectIndex | null;
  /** Whether one project-relative path is a file of the tree as it stands. */
  readonly exists: (path: string) => Promise<boolean>;
}

/** A line that would be read as one of the trailers the harness writes itself. */
const trailerLine = /^\s*Ramify-[A-Za-z-]*\s*:/m;

/**
 * Validates one contract submission: the strict schema, then the rules the
 * schema cannot hold. Nothing changes on a failure and every error names its
 * path.
 */
export async function validateContract(input: unknown, evidence: ContractEvidence): Promise<SubmissionValidation<ContractSubmission>> {
  const shape = validateAgainst(contractSubmissionSchema, input);
  if (!shape.ok) return shape;
  if (shape.value.kind === 'incomplete') return shape;
  const errors = await establishedErrors(shape.value, evidence);
  return errors.length === 0 ? shape : { ok: false, errors };
}

async function establishedErrors(value: EstablishedContract, evidence: ContractEvidence): Promise<SubmissionError[]> {
  const errors: SubmissionError[] = [];
  const index = evidence.index;

  const known = (module: string, path: string) => {
    if (index === null || findModule(index, module) !== undefined) return;
    errors.push({ path, message: `No module "${module}" is in the refreshed architect view`, expected: 'a module of the view' });
  };
  known(value.provider, 'provider');
  known(value.authority.owner, 'authority.owner');

  if (trailerLine.test(value.summary)) {
    errors.push({
      path: 'summary',
      message: 'The harness writes the commit\'s trailers; a submission may not contain a line that reads as one',
      expected: 'prose with no "Ramify-…:" line',
    });
  }

  const named: Array<{ path: string; value: string }> = [
    ...value.artifacts.interface.map((entry, position) => ({ path: `artifacts.interface.${position}.path`, value: entry.path })),
    ...value.artifacts.conformance.map((entry, position) => ({ path: `artifacts.conformance.${position}.path`, value: entry.path })),
    ...value.artifacts.fake.map((entry, position) => ({ path: `artifacts.fake.${position}.path`, value: entry.path })),
    ...value.artifacts.exposure.map((entry, position) => ({ path: `artifacts.exposure.${position}.path`, value: entry.path })),
    ...value.fakeInjections.map((entry, position) => ({ path: `fakeInjections.${position}`, value: entry })),
  ];
  for (const entry of named) {
    const target = toPosix(entry.value);
    if (target === '' || target.startsWith('/') || target.split('/').includes('..')) {
      errors.push({ path: entry.path, message: `"${entry.value}" is not a project-relative path`, expected: 'a path relative to the project root' });
      continue;
    }
    if (await evidence.exists(target)) continue;
    errors.push({
      path: entry.path,
      message: `"${entry.value}" is not a file of the tree; an agreement names the artifacts it wrote`,
      expected: 'a path the iteration wrote',
    });
  }

  if (value.mode === 'fake-backed') {
    const required: Array<readonly [readonly unknown[], string, string]> = [
      [value.artifacts.interface, 'artifacts.interface', 'the interface the two sides agree on'],
      [value.artifacts.conformance, 'artifacts.conformance', 'the conformance suite the provider must pass'],
      [value.artifacts.fake, 'artifacts.fake', 'the fake the consumer implements against'],
      [value.fakeInjections, 'fakeInjections', 'where the consumer holds the fake'],
    ];
    for (const [entries, path, what] of required) {
      if (entries.length > 0) continue;
      errors.push({
        path,
        message: `A fake-backed agreement names ${what}; without it the delegation has no executable evidence`,
        expected: 'at least one entry',
      });
    }
    for (const [position, entry] of value.artifacts.fake.entries()) {
      if (entry.exports.length > 0) continue;
      errors.push({
        path: `artifacts.fake.${position}.exports`,
        message: 'A fake file exports the implementation, factory or class the consumer uses',
        expected: 'at least one exported name',
      });
    }
    errors.push(...standsForErrors(value, index));
  } else {
    const forbidden: Array<readonly [readonly unknown[], string]> = [
      [value.artifacts.fake, 'artifacts.fake'],
      [value.fakeInjections, 'fakeInjections'],
      [value.artifacts.conformance, 'artifacts.conformance'],
    ];
    for (const [entries, path] of forbidden) {
      if (entries.length === 0) continue;
      errors.push({
        path,
        message: 'An access-only agreement integrates the real behavior: it has no fake, no conformance suite and no obligation',
        expected: 'no entry',
      });
    }
    if (value.artifacts.exposure.length === 0) {
      errors.push({
        path: 'artifacts.exposure',
        message: 'An access-only agreement is an exposure change, so it names the declarations it changed',
        expected: 'at least one entry',
      });
    }
  }

  return errors;
}

/**
 * Each fake export names the one real provider export it stands for: a file
 * of the provider module, which need not exist yet, and its export name, with
 * the exposure the agreement declares for it. The fake is compared with that
 * exposure at the gate, so every ancestor it names must be one that can
 * re-expose what the provider exposes.
 */
function standsForErrors(value: EstablishedContract, index: ArchitectIndex | null): SubmissionError[] {
  const errors: SubmissionError[] = [];
  const provider = index === null ? undefined : findModule(index, value.provider);
  for (const [position, entry] of value.artifacts.fake.entries()) {
    const named = new Map<string, number>();
    for (const [at, standsFor] of entry.standsFor.entries()) {
      const path = `artifacts.fake.${position}.standsFor.${at}`;
      named.set(standsFor.fake, (named.get(standsFor.fake) ?? 0) + 1);
      if (!entry.exports.includes(standsFor.fake)) {
        errors.push({ path: `${path}.fake`, message: `"${standsFor.fake}" is not one of this fake file's exports`, expected: `one of ${entry.exports.join(', ') || 'its exports'}` });
      }
      const target = toPosix(standsFor.path);
      if (target === '' || target.startsWith('/') || target.split('/').includes('..')) {
        errors.push({ path: `${path}.path`, message: `"${standsFor.path}" is not a project-relative path`, expected: 'a path relative to the project root' });
      } else if (isFakeFile(target)) {
        errors.push({ path: `${path}.path`, message: `"${standsFor.path}" is a fake; a fake stands for the real provider export`, expected: 'the provider file that holds, or will hold, the real export' });
      } else if (provider !== undefined && index !== null && ownerOf(index, target)?.module !== provider.module) {
        errors.push({
          path: `${path}.path`,
          message: `"${standsFor.path}" is not a file of the provider ${provider.module}; the real export a fake stands for is the provider's`,
          expected: `a path beneath ${provider.dir === '' ? 'the root module' : `${provider.dir}/`} and no child module`,
        });
      }
      const channels = new Set<string>();
      for (const channel of standsFor.exposure.to) {
        if (channels.has(channel)) errors.push({ path: `${path}.exposure.to`, message: `"${channel}" is named twice`, expected: 'each channel once' });
        channels.add(channel);
      }
      const ancestors = provider === undefined || index === null ? null : ancestorsOf(index, provider.module);
      const by = new Set<string>();
      for (const [step, reexposed] of standsFor.exposure.reexposed.entries()) {
        if (by.has(reexposed.by)) {
          errors.push({ path: `${path}.exposure.reexposed.${step}.by`, message: `"${reexposed.by}" re-exposes the real export once, with every channel in its "to"`, expected: 'each ancestor once' });
        }
        by.add(reexposed.by);
        if (ancestors !== null && !ancestors.includes(reexposed.by)) {
          errors.push({
            path: `${path}.exposure.reexposed.${step}.by`,
            message: `"${reexposed.by}" is not an ancestor of the provider ${value.provider}; only an ancestor re-exposes what it received`,
            expected: ancestors.length === 0 ? 'no re-exposure' : `one of ${ancestors.join(', ')}`,
          });
        }
      }
    }
    for (const name of entry.exports) {
      const count = named.get(name) ?? 0;
      if (count === 1) continue;
      errors.push({
        path: `artifacts.fake.${position}.standsFor`,
        message: count === 0
          ? `The fake export "${name}" names no real export it stands for; a fake is exactly as importable as what it stands for, so the agreement names it`
          : `The fake export "${name}" stands for ${count} real exports; name the one it stands for`,
        expected: `exactly one entry whose "fake" is "${name}"`,
      });
    }
  }
  return errors;
}

function toPosix(path: string): string {
  return posix.normalize(path.split(sep).join('/')).replace(/^\.\//, '').replace(/\/$/, '');
}
