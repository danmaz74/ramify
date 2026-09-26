import { scopePaths } from '../work/scope.js';
import type { IterationAssignment } from '../work/iterations.js';
import { contractToolName, type NeedAsBehavior } from './submission.js';

/*
 * The contract sub-session's first message.
 *
 * It is an engineer invocation with the contract skill, not another persona.
 * What keeps the agreement from serving one side is what this message asks
 * it to read and to produce: both sides of the seam, the executable evidence
 * the consumer already has, and a fake the consumer's own tests run against
 * before anyone implements the provider.
 */

export interface ContractBriefing {
  readonly assignment: IterationAssignment;
  readonly projectRoot: string;
  /** The commit `git diff` compares against: the last accepted boundary. */
  readonly base: string;
  /** The need, as the requesting engineer wrote it; absent for a revision. */
  readonly need?: NeedAsBehavior | undefined;
  /** The agreement this session revises, where it revises one. */
  readonly revision?: RevisionBriefing | undefined;
  /** The consumer this agreement is established for, and the iteration that asked. */
  readonly consumer: { readonly module: string; readonly iteration: string | null };
  readonly provider: string;
  /** Existing consumers of the capability, where this session extends an agreement. */
  readonly existingConsumers: readonly string[];
  /** Diagnostics of an attempt that did not pass, where this invocation is a repair. */
  readonly failedGate?: { readonly id: string; readonly cause: string | null; readonly summary: readonly string[] } | undefined;
  /** The requesting assignment's package, rendered by the package creator; given to a session once. */
  readonly package?: string | undefined;
}

/** The agreement in force, as a revising session receives it. */
export interface RevisionBriefing {
  readonly contract: string;
  /** The revision in force. The harness fills the next one; this session does not choose it. */
  readonly inForce: number;
  readonly behavior: string;
  /** The interface, conformance and fake files the agreement in force names. */
  readonly artifacts: readonly string[];
  /** Why the architect asked for a revision. */
  readonly rationale: string;
  /** What a provider reported it cannot conform to, where one did. */
  readonly report?: string | undefined;
}

/** The first user message of one contract sub-session. */
export function contractMessage(briefing: ContractBriefing): string {
  const { assignment, need, revision } = briefing;
  const paths = scopePaths(briefing.projectRoot, assignment.scope);
  const subject = revision === undefined
    ? `\`${briefing.consumer.module}\` needs \`${need?.capability ?? 'the agreed behavior'}\` from \`${briefing.provider}\``
    : `revise \`${revision.contract}\`, the agreement between \`${briefing.consumer.module}\` and \`${briefing.provider}\``;
  const lines: string[] = [
    `# Contract iteration ${assignment.id} — ${subject}`,
    '',
    '## Goal',
    '',
    assignment.goal,
    '',
    ...(briefing.package === undefined ? [] : ['## What the plan asks of the requesting iteration', '',
      'The elements its assignment cites, whole, with the plan deviations in force when it was assigned.', '',
      briefing.package.trimEnd(), '']),
  ];

  if (revision !== undefined) {
    lines.push(
      '## The agreement in force',
      '',
      `\`${revision.contract}\` stands at revision ${revision.inForce} and stays in force until this iteration's gate passes.`,
      `- Behavior agreed: ${revision.behavior}`,
      `- What it names: ${revision.artifacts.length === 0 ? 'nothing' : revision.artifacts.map(path => `\`${path}\``).join(', ')}`,
      '',
      'The harness fills the next revision number. You do not choose it, and you do not write it anywhere.',
      '',
      '## Why a revision was asked for',
      '',
      revision.rationale,
      '',
    );
    if (revision.report !== undefined) {
      lines.push('The provider reported that it cannot conform to the agreement as it stands:', '', `> ${revision.report}`, '');
    }
    lines.push(
      'Every consumer attached to this agreement is reopened at the new revision and verifies again. Keep what',
      'still holds: a revision that restates the whole agreement makes work for consumers that needed none.',
      '',
    );
  } else if (need !== undefined) {
    lines.push(
      '## The need, as the consumer stated it',
      '',
      'The consumer wrote the need as behavior. It did not design the interface, and neither did the harness.',
      '',
      ...section('Use cases', need.useCases),
      ...section('Inputs', need.inputs),
      ...section('Outputs', need.outputs),
      ...section('Side effects', need.sideEffects),
      ...section('Constraints', need.constraints),
      ...section('Executable evidence that already exists', need.existingEvidence),
    );
  }

  lines.push(
    '## What you do',
    '',
    '1. Read both sides of the seam: the consumer that needs the behavior and the provider that will own it.',
    '2. Place the agreement where authority puts it. A capability\'s public contract belongs with its',
    '   implementation; a port the consumer defined belongs with the consumer; an agreement between peers',
    '   belongs at their common ancestor. Reuse alone never creates a neutral definitions module.',
    '3. Design the interface, write the conformance suite, and write the fake.',
    '4. Integrate the fake at the seam where the real provider will act, and fix consumer and fake failures',
    '   until the consumer\'s relevant tests pass against the fake and the fake passes the conformance suite.',
    '   Existing behavior stays real: the fake replaces only the missing part.',
    '',
    'You do not implement the provider, and you do not change unrelated consumers. If the design you need',
    'would break an existing consumer, look for a compatible one first and report the conflict if there is none.',
    '',
  );

  lines.push(
    '## Naming',
    '',
    'A fake implementation file carries `.fake` before the language extension, such as `send-email.fake.ts`.',
    'Every name it exports carries `Fake`, such as `createSendEmailFake`. A re-export keeps that designation.',
    'The shared contract keeps a behavior-oriented name, such as `SendEmail`, because both the fake and the',
    'real provider implement it. The gate verifies this: generated architectural evidence must never present',
    'a fake under a production-looking name.',
    '',
    '## Exposure',
    '',
    'A fake is exactly as importable as the real export it stands for: the modules that receive one receive the',
    'other. Name the real export each fake export stands for, and the exposure you declare for it; the gate',
    'compares the fake with it, and fails an extra or a missing exposure. Where the real behavior reaches the',
    'consumer as data through a path that already exists, inject the fake on the provider side and let the',
    'consumer integrate through that path: never give the consumer an import path the real export will not have.',
    '',
    '## What you may write',
    '',
    ...paths.roots.map(root => `- \`${root}/\` and everything beneath it`),
    ...paths.files.map(file => `- \`${file}\``),
    '',
    'Nothing else. The caller\'s writes are suspended while you work: one implementation writer at a time.',
    '',
  );
  const injectionSites = assignment.scope.extra.filter(entry => entry.purpose === 'fake-injection').map(entry => entry.path);
  lines.push(
    injectionSites.length === 0
      ? 'No file beyond these was named as holding the fake. If the seam where the real provider will act lies elsewhere, report `incomplete` and name that file: the consumer\'s engineer names it as an injection site in its next `contract-needed`, and the next contract iteration may write it.'
      : `The agreement names ${injectionSites.map(site => `\`${site}\``).join(', ')} as holding the fake; ${injectionSites.length === 1 ? 'it is' : 'they are'} writable and nothing else of the provider is.`,
    '',
  );

  if (briefing.existingConsumers.length > 0) {
    lines.push('## Consumers this agreement already has', '');
    for (const consumer of briefing.existingConsumers) lines.push(`- \`${consumer}\``);
    lines.push('', 'Their contracts and behavioral guarantees are preserved. You may read them and run their tests without changing them.', '');
  }

  lines.push('## Completion evidence', '', assignment.completionEvidence, '');
  lines.push(
    `The gate runs the \`${assignment.gate.checkpoint}\` checkpoint: the consumer's own tests and the conformance`,
    'suite you name, resolved anew from the tree, the project\'s type check and a complete Ramify check.',
    '',
    '## The tree you start from',
    '',
    `\`git diff ${briefing.base}\` shows exactly the work since the last accepted boundary, this iteration's included.`,
    '',
  );

  if (briefing.failedGate !== undefined) {
    lines.push('## The gate did not pass', '');
    lines.push(`Attempt \`${briefing.failedGate.id}\`${briefing.failedGate.cause === null ? '' : ` (${briefing.failedGate.cause})`}:`);
    for (const line of briefing.failedGate.summary) lines.push(`- ${line}`);
    lines.push('', 'Repair it and submit again.', '');
  }

  lines.push(
    `End your turn with \`${contractToolName}\`. \`established\` names the interface, the conformance suite, the fake,`,
    'the exposure declarations you changed and where the consumer holds the fake; it registers the agreement and the',
    'provider\'s obligation. `incomplete` registers nothing and returns what is unfinished.',
  );
  return lines.join('\n');
}

function section(title: string, entries: readonly string[]): string[] {
  if (entries.length === 0) return [`### ${title}`, '', 'The consumer named none.', ''];
  return [`### ${title}`, '', ...entries.map(entry => `- ${entry}`), ''];
}
