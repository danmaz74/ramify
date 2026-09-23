import { posix, sep } from 'node:path';
import { z } from 'zod';
import { findModule, type ArchitectIndex } from '../../subs/evidence/src/views.js';
import { modulePathSchema } from '../interfaces/protocol/evidence.js';
import { planRefSchema } from '../run/records.js';
import type { SubmissionError } from '../run/submissions.js';
import { slugSchema, type RegistryEntry } from '../analysis/records.js';
import { extraPurposeSchema } from './iterations.js';
import type { IntegrationScope } from './integration.js';
import type { OutlineBody } from './submission.js';

/*
 * The assignment a local architect submits, and the rules the schema cannot
 * hold.
 *
 * It carries no test selection, no gate and no guarded hashes: those are
 * derived by the harness from the kind, the scope and the required evidence,
 * and frozen on the assignment it commits. It carries no identifier either,
 * because the harness assigns one.
 *
 * Its scope is the assigned module's own contents plus the complete subtrees
 * of the immediate children it names. A child subtree is wholly included or
 * wholly excluded, and a descendant is never selected on its own.
 */

const text = z.string().min(1);

/**
 * The kinds a local architect may assign. `integration` arrives with a later
 * iteration.
 *
 * `contract` is the direct revision of an agreement this work item consumes:
 * it names the agreement in `revisesContract` and its rationale in
 * `approach`, and the harness supplies the revision number, the scope and
 * the gate. It is not how a sub-session is asked for; an engineer's
 * `contract-needed` does that.
 *
 * `breaking` is an ordinary agentic iteration that changes a guarantee the
 * outline records as broken. It uses no contract, fake or provider protocol:
 * what makes it a kind of its own is its checkpoint, which is the whole
 * project, and its permission to state the explicitly broad scope below.
 */
export const assignableKindSchema = z.enum(['ordinary', 'breaking', 'verification', 'repair', 'contract']);

/**
 * The base of a write scope as the architect states it. The ordinary form is
 * one module's own contents plus the complete subtrees of the immediate
 * children it names.
 *
 * The broad form spans the modules one break runs through. It is a planned
 * exception an architect records with its rationale, never permission for an
 * engineer to widen its own writes: only a `breaking` assignment may state
 * it, the change goal stays narrow, and the gate is the whole project.
 */
export const scopeBaseBodySchema = z.union([
  z.object({
    module: modulePathSchema,
    /** Direct children whose complete subtree is included. */
    includedChildren: z.array(modulePathSchema),
  }).strict(),
  z.object({
    /** Every module the break runs through, the one that breaks included. */
    modules: z.array(modulePathSchema).min(1),
    /**
     * Why the break cannot be staged within one module's subtree. The schema
     * accepts any string so the rule beside it can say what a blank one is
     * missing; a broad scope with no rationale is refused.
     */
    rationale: z.string(),
  }).strict(),
]);

/** The write scope as the architect states it: no revision, no captured paths. */
export const scopeBodySchema = z.object({
  base: scopeBaseBodySchema,
  /** Locations beyond the base: a contract, a conformance suite, a fake, an exposure declaration, a consumer. */
  extra: z.array(z.object({ path: text, purpose: extraPurposeSchema }).strict()),
  /** The declared read scope beyond the base; soft. */
  read: z.array(modulePathSchema),
  rationale: text,
}).strict();

/** An `IterationAssignment` without the fields the harness assigns. */
export const assignmentBodySchema = z.object({
  /** Which stage of the outline this iteration works, `0` where the outline has none. */
  stage: z.int().nonnegative(),
  kind: assignableKindSchema,
  goal: text,
  approach: text,
  scope: scopeBodySchema,
  requirementRefs: z.array(planRefSchema),
  externalCapabilities: z.array(z.object({
    capability: slugSchema,
    owner: modulePathSchema,
    role: z.enum(['use', 'request']),
  }).strict()),
  completionEvidence: text,
  /**
   * Guarded paths this iteration is allowed to change, each with the reason
   * the request establishes. The harness names the record that authorizes
   * each one; a submission never does, and an engineer never authorizes
   * anything. An authorization stands for this iteration alone.
   */
  authorizations: z.array(z.object({ path: text, rationale: text }).strict()).optional(),
  /**
   * The agreement this assignment revises, by its identifier. The harness
   * fills the revision: a submission never chooses one.
   */
  revisesContract: text.optional(),
}).strict();
export type AssignmentBody = z.infer<typeof assignmentBodySchema>;

/** What an assignment's rules are checked against. */
export interface AssignmentEvidence {
  /** The architect view, refreshed before the assignment is judged. */
  readonly index: ArchitectIndex | null;
  /** The registry as committed so far, by capability. */
  readonly registry: ReadonlyMap<string, RegistryEntry>;
  /** The outline in force: the one this submission carries, or the last committed revision. */
  readonly outline: Pick<OutlineBody, 'decomposition' | 'stages' | 'breakingChanges'> | null;
  /** The agreements this work item consumes, which are the ones it may revise. */
  readonly contracts?: ReadonlySet<string> | undefined;
  /** The guarded paths of this project, which are the only ones an authorization can name. */
  readonly guardedPaths?: ReadonlySet<string> | undefined;
  /** Whether this submission carries an outline revision, which is what records an authorization. */
  readonly revising?: boolean | undefined;
  /**
   * For an integration work item: the scope its engineer works in, the
   * ancestor with the children on the paths to the sub-scenarios' owners.
   */
  readonly integration?: IntegrationScope | undefined;
}

/** The registry entry that authorizes creating `module`, or undefined when none does. */
export function creationAuthority(
  registry: ReadonlyMap<string, RegistryEntry>,
  module: string,
): RegistryEntry | undefined {
  for (const entry of registry.values()) {
    if (entry.owner === module && entry.proposed !== undefined) return entry;
  }
  return undefined;
}

/**
 * Every rule the schema cannot hold. Nothing is changed by checking them,
 * and each error names its path.
 */
export function assignmentErrors(body: AssignmentBody, evidence: AssignmentEvidence): SubmissionError[] {
  const errors: SubmissionError[] = [];
  const index = evidence.index;
  const base = body.scope.base;
  const narrow = 'module' in base ? base : null;
  const broad = 'module' in base ? null : base;
  const owner = narrow?.module ?? null;
  const known = narrow !== null && index !== null && findModule(index, narrow.module) !== undefined;
  const authority = narrow === null ? undefined : creationAuthority(evidence.registry, narrow.module);

  if (narrow !== null && index !== null && !known) {
    if (authority === undefined) {
      errors.push({
        path: 'assignment.scope.base.module',
        message: `No module "${narrow.module}" is in the refreshed architect view, and no accepted registry entry proposes it`,
        expected: 'a module of the view, or one an accepted proposal creates',
      });
    } else if (findModule(index, authority.proposed!.parent) === undefined) {
      errors.push({
        path: 'assignment.scope.base.module',
        message: `The proposal for "${narrow.module}" names the parent "${authority.proposed!.parent}", which the refreshed view does not have`,
        expected: 'a parent the view has',
      });
    }
  }

  const ownerDirectory = known && index !== null && narrow !== null
    ? findModule(index, narrow.module)!.dir
    : authority?.proposed?.directory ?? null;

  narrow?.includedChildren.forEach((child, position) => {
    const path = `assignment.scope.base.includedChildren.${position}`;
    if (index === null) return;
    const entry = findModule(index, child);
    if (entry === undefined) {
      errors.push({ path, message: `No module "${child}" is in the refreshed architect view`, expected: 'a module of the view' });
      return;
    }
    if (entry.parent !== owner) {
      errors.push({
        path,
        message: entry.parent === null
          ? `"${child}" is the root module, not a direct child of "${owner}"`
          : `"${child}" is a child of "${entry.parent}", not of "${owner}"; a subtree is selected through its direct child, never through a descendant`,
        expected: `a direct child of "${owner}"`,
      });
    }
  });

  // The broad base is the planned exception a break is isolated with. It is
  // stated, not inferred: only a `breaking` assignment may use it, the
  // outline must already record the guarantee it breaks, and a blank
  // rationale is no rationale at all.
  if (broad !== null) {
    if (body.kind !== 'breaking') {
      errors.push({
        path: 'assignment.kind',
        message: `A scope spanning several modules is the planned exception of a breaking iteration, and this one is "${body.kind}"`,
        expected: '"breaking", or a base naming one module',
      });
    }
    if (broad.rationale.trim() === '') {
      errors.push({
        path: 'assignment.scope.base.rationale',
        message: 'A scope spanning several modules is recorded with the rationale that makes it a planned exception; this one has none',
        expected: 'the reason the break cannot be staged within one module\'s subtree',
      });
    }
    broad.modules.forEach((module: string, position: number) => {
      if (index === null || findModule(index, module) !== undefined) return;
      errors.push({
        path: `assignment.scope.base.modules.${position}`,
        message: `No module "${module}" is in the refreshed architect view`,
        expected: 'a module of the view',
      });
    });
  }

  // A breaking iteration exists because the outline records a break. Without
  // one there is no guarantee being changed, and the kind is a claim rather
  // than a plan.
  if (body.kind === 'breaking' && (evidence.outline?.breakingChanges ?? []).length === 0) {
    errors.push({
      path: 'assignment.kind',
      message: 'A breaking iteration works a guarantee the outline records as broken, and this work item\'s outline records none',
      expected: 'an outline whose "breakingChanges" names the guarantee, or another kind',
    });
  }

  // An authorization lets a guarded change pass the gate, so it names a
  // guarded path and arrives with the outline revision that records it.
  const authorizations = body.authorizations ?? [];
  const guardedPaths = evidence.guardedPaths;
  authorizations.forEach((authorization, position) => {
    if (guardedPaths !== undefined && !guardedPaths.has(authorization.path)) {
      errors.push({
        path: `assignment.authorizations.${position}.path`,
        message: `"${authorization.path}" is not a guarded path of this project, so authorizing a change to it decides nothing`,
        expected: guardedPaths.size === 0 ? 'no authorization' : `one of ${[...guardedPaths].sort().join(', ')}`,
      });
    }
  });
  if (authorizations.length > 0 && evidence.revising === false) {
    errors.push({
      path: 'assignment.authorizations',
      message: 'A guarded change is authorized by a recorded revision; submit the outline revision that states why with this assignment',
      expected: 'an "outline" on the same submission',
    });
  }

  body.scope.extra.forEach((entry, position) => {
    const path = `assignment.scope.extra.${position}.path`;
    const target = toPosix(entry.path);
    if (target === '' || target.startsWith('/') || target.split('/').includes('..')) {
      errors.push({ path, message: `"${entry.path}" is not a project-relative path`, expected: 'a path relative to the project root' });
      return;
    }
    if (index === null) return;
    const owners = [...index.modules.values()].map(module => toPosix(module.dir));
    if (ownerDirectory !== null) owners.push(toPosix(ownerDirectory));
    const inside = owners.some(directory => directory === '' || target === directory || target.startsWith(`${directory}/`));
    if (!inside) {
      errors.push({
        path,
        message: `"${entry.path}" lies under no module of the refreshed view and under no module this assignment may create`,
        expected: 'a path under an existing or authorized module',
      });
    }
  });

  body.externalCapabilities.forEach((capability, position) => {
    const registered = evidence.registry.get(capability.capability);
    if (registered === undefined) {
      errors.push({
        path: `assignment.externalCapabilities.${position}.capability`,
        message: `The registry has no entry for "${capability.capability}"`,
        expected: 'a capability the registry holds',
      });
      return;
    }
    if (registered.owner !== capability.owner) {
      errors.push({
        path: `assignment.externalCapabilities.${position}.owner`,
        message: `The registry places "${capability.capability}" with "${registered.owner}", not "${capability.owner}"`,
        expected: registered.owner,
      });
    }
  });

  // A revision is assigned by a consumer of the agreement, and only by one:
  // the harness derives the revision number, the scope and the gate, and an
  // architect that consumes nothing has no agreement to revise.
  const contracts = evidence.contracts ?? new Set<string>();
  if (body.kind === 'contract' && body.revisesContract === undefined) {
    errors.push({
      path: 'assignment.revisesContract',
      message: 'A contract iteration assigned directly revises an agreement this work item consumes; name it',
      expected: contracts.size === 0 ? 'no contract assignment' : `one of ${[...contracts].join(', ')}`,
    });
  }
  if (body.kind !== 'contract' && body.revisesContract !== undefined) {
    errors.push({
      path: 'assignment.kind',
      message: `Only a "contract" iteration revises an agreement, and this one is "${body.kind}"`,
      expected: '"contract"',
    });
  }
  if (body.revisesContract !== undefined && !contracts.has(body.revisesContract)) {
    errors.push({
      path: 'assignment.revisesContract',
      message: contracts.size === 0
        ? `This work item consumes no agreement, so there is nothing for it to revise; "${body.revisesContract}" is not one of its own`
        : `"${body.revisesContract}" is not an agreement this work item consumes`,
      expected: contracts.size === 0 ? 'no contract assignment' : `one of ${[...contracts].join(', ')}`,
    });
  }

  // An integration work item binds its scenario at the common ancestor, and
  // its engineer needs every path down to the sub-scenarios' owners: their
  // step files are what it imports, and their declarations are where the
  // expose-test lines go.
  const integration = evidence.integration;
  if (integration !== undefined) {
    const wanted = `the base { module: "${integration.module}", includedChildren: [${integration.includedChildren.map(child => `"${child}"`).join(', ')}] }`;
    if (narrow === null || narrow.module !== integration.module) {
      errors.push({
        path: 'assignment.scope.base',
        message: `An integration work item's engineer works at the common ancestor "${integration.module}" of its sub-scenarios' owners`,
        expected: wanted,
      });
    } else {
      const missing = integration.includedChildren.filter(child => !narrow.includedChildren.includes(child));
      if (missing.length > 0) {
        errors.push({
          path: 'assignment.scope.base.includedChildren',
          message: `The scope leaves out ${missing.map(child => `"${child}"`).join(', ')}, on the path to a sub-scenario's owner whose step files the scenario imports`,
          expected: wanted,
        });
      }
    }
  }

  const stages = evidence.outline?.stages.length ?? 0;
  if (stages === 0 ? body.stage !== 0 : body.stage >= stages) {
    errors.push({
      path: 'assignment.stage',
      message: stages === 0
        ? `The outline names no stage, so an assignment works stage 0, not ${body.stage}`
        : `The outline names ${stages} stage${stages === 1 ? '' : 's'}, so stage ${body.stage} is not one of them`,
      expected: stages === 0 ? '0' : `a stage index below ${stages}`,
    });
  }

  return errors;
}

function toPosix(path: string): string {
  return posix.normalize(path.split(sep).join('/')).replace(/^\.\//, '').replace(/\/$/, '');
}
