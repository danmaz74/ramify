import { posix, sep } from 'node:path';
import { z } from 'zod';
import { findModule, type ArchitectIndex } from '../../subs/evidence/src/views.js';
import { modulePathSchema } from '../interfaces/protocol/evidence.js';
import type { SubmissionError } from '../run/submissions.js';
import { slugSchema, type RegistryEntry } from '../analysis/records.js';
import { assignedBoundsSchema, extraPurposeSchema, type AssignedBounds } from './iterations.js';
import { includedConfigurationPaths, within } from './scope.js';
import { assignedObligationErrors, type ObligationContext, type ObligationRegistration } from './obligations.js';
import type { IntegrationScope } from './integration.js';
import type { OutlineBody } from './submission.js';
import type { EngineerBounds } from '../run/policy.js';

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
    included: z.array(z.object({ directory: text, reason: text, instructions: text }).strict()),
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

/**
 * One narrow location beyond the base. An architect names a file; harness
 * contract assignments may name a directory whose new files the agreement
 * will define. Whole included trees have their own directory/reason/instructions.
 */
export const extraLocationSchema = z.object({
  path: text,
  purpose: extraPurposeSchema,
  kind: z.enum(['file', 'directory']).optional(),
  reason: z.string().optional(),
}).strict();

/** The write scope as the architect states it: no revision, no captured paths. */
export const scopeBodySchema = z.object({
  base: scopeBaseBodySchema,
  /** Locations beyond the base: a contract, a conformance suite, a fake, an exposure declaration, a consumer, a path outside modules. */
  extra: z.array(extraLocationSchema),
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
  /**
   * The elements of the work item's package this iteration must honor, by
   * ID: its engineer, contract engineer and reviewers receive exactly these,
   * with the plan deviations recorded so far.
   */
  citedElements: z.array(text),
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
  /**
   * The registered obligations this architect delegates to the iteration's
   * engineer: scenarios, delegated outcomes, cases or tests it reports on.
   * The engineer's completion proposal binds every one, naming the fakes
   * each binding relies on, or reports partial.
   */
  obligations: z.array(text).optional(),
  /**
   * Bounds this iteration's engineers need beyond the policy's, each with
   * its reason: the longest one shell command may run, the idle bound and
   * the absolute bound of each invocation. Each is raised, never lowered,
   * and at most the policy's ceiling; they apply to every engineer
   * invocation of the iteration.
   */
  bounds: assignedBoundsSchema.optional(),
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
  /** Capability tasks use their own plan as the design basis. */
  readonly capabilityCompatibility?: readonly string[] | undefined;
  /** The agreements this work item consumes, which are the ones it may revise. */
  readonly contracts?: ReadonlySet<string> | undefined;
  /** The guarded paths of this project, which are the only ones an authorization can name. */
  readonly guardedPaths?: ReadonlySet<string> | undefined;
  /** The files only the harness writes, which no extra location may name. */
  readonly harnessOnly?: ReadonlySet<string> | undefined;
  /** Whether this submission carries an outline revision, which is what records an authorization. */
  readonly revising?: boolean | undefined;
  /**
   * For an integration work item: the scope its engineer works in, the
   * ancestor with the children on the paths to the sub-scenarios' owners.
   */
  readonly integration?: IntegrationScope | undefined;
  /**
   * The assigning architect, the run's obligations and the same
   * submission's registrations, which `obligations` is judged against.
   * Absent, no obligation can be assigned.
   */
  readonly obligations?: (ObligationContext & { readonly registrations?: readonly ObligationRegistration[] | undefined }) | undefined;
  /** The policy's engineer bounds and their ceilings, which `bounds` is judged against. */
  readonly bounds?: { readonly defaults: EngineerBounds; readonly ceilings: EngineerBounds } | undefined;
  /** The element IDs of the work item's package, which `citedElements` is judged against; absent where the run has none. */
  readonly package?: ReadonlySet<string> | undefined;
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
  const cited = new Set<string>();
  body.citedElements.forEach((id, position) => {
    if (evidence.package !== undefined && !evidence.package.has(id)) errors.push({
      path: `assignment.citedElements.${position}`, message: `"${id}" is not an element of this work item's package`,
      expected: 'an element ID of the work-item package',
    });
    if (cited.has(id)) errors.push({
      path: `assignment.citedElements.${position}`, message: `"${id}" is cited more than once`,
      expected: 'each element at most once',
    });
    cited.add(id);
  });
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

  narrow?.included.forEach((entry, position) => {
    if (entry.directory === '' || entry.directory.startsWith('/') || entry.directory.split('/').some(part => part === '..' || part === '.' || part === '')) {
      errors.push({ path: `assignment.scope.base.included.${position}.directory`, message: 'An included tree names a normalized project-relative directory' });
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
  if (body.kind === 'breaking' && (evidence.outline?.breakingChanges.length ?? evidence.capabilityCompatibility?.length ?? 0) === 0) {
    errors.push({
      path: 'assignment.kind',
      message: 'A breaking iteration works a guarantee the outline records as broken, and this work item\'s outline records none',
      expected: 'an outline whose "breakingChanges" names the guarantee, or another kind',
    });
  }

  // An authorization lets a guarded change pass the gate, so it names a
  // guarded path and arrives with the outline revision that records it.
  const authorizations = body.authorizations ?? [];
  const guardedPaths = evidence.guardedPaths === undefined ? undefined : new Set([...evidence.guardedPaths, ...includedConfigurationPaths(base)]);
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

  // Narrow extras still require explicit guarded authorization. Provider
  // capture validates topology and hard exclusions before accepting authority.
  const authorized = new Set(authorizations.map(authorization => toPosix(authorization.path)));
  const harnessOnly = evidence.harnessOnly ?? new Set<string>();
  body.scope.extra.forEach((entry, position) => {
    const at = `assignment.scope.extra.${position}`;
    const path = `${at}.path`;
    const target = toPosix(entry.path);
    if (target === '' || target.startsWith('/') || target.split('/').includes('..')) {
      errors.push({ path, message: `"${entry.path}" is not a project-relative path`, expected: 'a path relative to the project root' });
      return;
    }
    const directory = entry.kind === 'directory';
    if (directory) errors.push({ path: `${at}.kind`, message: 'An architect extra names one file; whole trees use included' });
    const covered = (file: string) => (directory ? within(file, target) : file === target);
    const reserved = [...harnessOnly].filter(covered).sort();
    if (reserved.length > 0) {
      errors.push({
        path,
        message: `${reserved.map(file => `"${file}"`).join(', ')} ${reserved.length === 1 ? 'is' : 'are'} written by the harness alone, so no assignment names ${reserved.length === 1 ? 'it' : 'them'}`,
        expected: 'a path the harness does not write',
      });
      return;
    }
    // A guarded file passes the gate changed only with an authorization, so
    // an extra location that makes one writable without it is refused here
    // rather than at the gate. A contract iteration's scope and
    // authorizations are the harness's, so what it states here decides none.
    const unauthorized = body.kind === 'contract'
      ? []
      : [...(guardedPaths ?? [])].filter(file => covered(file) && !authorized.has(file)).sort();
    if (unauthorized.length > 0) {
      errors.push({
        path,
        message: `${unauthorized.map(file => `"${file}"`).join(', ')} ${unauthorized.length === 1 ? 'is a guarded file' : 'are guarded files'}; a change to ${unauthorized.length === 1 ? 'it' : 'them'} passes the gate only with an authorization recorded by an outline revision`,
        expected: `an entry in "assignment.authorizations" for ${unauthorized.map(file => `"${file}"`).join(', ')}, with an "outline" revision on the same submission that states why`,
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
    const wanted = `the base { module: "${integration.module}", included: [${integration.includedChildren.map(child => `{ directory: "${findModule(index!, child)?.dir ?? child}", reason, instructions }`).join(', ')}] }`;
    if (narrow === null || narrow.module !== integration.module) {
      errors.push({
        path: 'assignment.scope.base',
        message: `An integration work item's engineer works at the common ancestor "${integration.module}" of its sub-scenarios' owners`,
        expected: wanted,
      });
    } else {
      const missing = integration.includedChildren.filter(child => !narrow.included.some(entry => findModule(index!, child)?.dir === entry.directory));
      if (missing.length > 0) {
        errors.push({
          path: 'assignment.scope.base.included',
          message: `The scope leaves out ${missing.map(child => `"${child}"`).join(', ')}, on the path to a sub-scenario's owner whose step files the scenario imports`,
          expected: wanted,
        });
      }
    }
  }

  // The obligations named for the engineer are this architect's own: an
  // iteration binds nothing another architect reports on.
  if (body.obligations !== undefined && body.obligations.length > 0) {
    errors.push(...(evidence.obligations === undefined
      ? [{ path: 'assignment.obligations', message: 'This assignment has no obligation context, so it names no obligation', expected: 'an empty list' }]
      : assignedObligationErrors(body.obligations, evidence.obligations)));
  }

  if (body.bounds !== undefined && evidence.bounds !== undefined) errors.push(...boundsErrors(body.bounds, evidence.bounds));

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

/** What each bound is called where the architect reads it. */
const boundNames: Readonly<Record<keyof EngineerBounds, string>> = {
  commandTimeoutMs: 'a shell command\'s timeout',
  idleMs: 'the idle bound',
  absoluteMs: 'the absolute bound of an invocation',
};

/**
 * The rules of raised bounds: each is raised and never lowered, none
 * exceeds the policy's ceiling, and a command never outlasts the
 * invocation that runs it.
 */
export function boundsErrors(
  bounds: AssignedBounds,
  policy: { readonly defaults: EngineerBounds; readonly ceilings: EngineerBounds },
): SubmissionError[] {
  const errors: SubmissionError[] = [];
  for (const name of ['commandTimeoutMs', 'idleMs', 'absoluteMs'] as const) {
    const raised = bounds[name];
    if (raised === undefined) continue;
    const path = `assignment.bounds.${name}.ms`;
    if (raised.ms > policy.ceilings[name]) {
      errors.push({
        path,
        message: `${raised.ms} ms is above the policy's ceiling for ${boundNames[name]}, which is ${policy.ceilings[name]} ms`,
        expected: `at most ${policy.ceilings[name]}`,
      });
    } else if (raised.ms < policy.defaults[name]) {
      errors.push({
        path,
        message: `${raised.ms} ms is below the policy's ${policy.defaults[name]} ms for ${boundNames[name]}; a bound is raised here, never lowered`,
        expected: `between ${policy.defaults[name]} and ${policy.ceilings[name]}`,
      });
    }
  }
  const command = bounds.commandTimeoutMs?.ms;
  const absolute = bounds.absoluteMs?.ms ?? policy.defaults.absoluteMs;
  if (command !== undefined && command > absolute) {
    errors.push({
      path: 'assignment.bounds.commandTimeoutMs.ms',
      message: `A command's timeout of ${command} ms is longer than the ${absolute} ms its invocation may run${bounds.absoluteMs === undefined ? ', the policy\'s absolute bound' : ''}; raise \`absoluteMs\` with it, up to ${policy.ceilings.absoluteMs} ms`,
      expected: `at most ${absolute}`,
    });
  }
  return errors;
}

/** A project-relative path in posix form; the project root itself is `''`, never `'.'`. */
function toPosix(path: string): string {
  const normalized = posix.normalize(path.split(sep).join('/')).replace(/^\.\//, '').replace(/\/$/, '');
  return normalized === '.' ? '' : normalized;
}
