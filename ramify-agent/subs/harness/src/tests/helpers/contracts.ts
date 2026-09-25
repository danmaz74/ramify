import { join } from 'node:path';
import { write } from './iterations.js';
import type { ScriptStep } from '../../../subs/agent/src/scripted.js';

/*
 * One agreement, as a test writes it: the files a contract sub-session
 * produces, the files the provider adds to make the same conformance suite
 * pass against the real implementation, and the consumer's own source before
 * and after verification.
 *
 * A revision of the agreement is the same seam with a different behavior:
 * a different limit, or a trimming rule the agreement did not state before.
 * The files it writes are the files the agreement in force named, so the
 * revision really replaces what the run was working against.
 *
 * Nothing here simulates a transition. The files are real source, written
 * through the port's own built-ins behind the write guard, and the
 * conformance suite really runs against whichever subjects the tree holds
 * when a gate resolves it.
 */

export interface Seam {
  /** The capability slug, such as `note-limit`. */
  readonly capability: string;
  /** The exported name stem, such as `NoteLimit`. */
  readonly name: string;
  /** The provider's project-relative directory. */
  readonly providerDirectory: string;
  /** The provider's declared module path. */
  readonly provider: string;
  /** The consumer's project-relative directory. */
  readonly consumerDirectory: string;
  /** The consumer's own source file that holds the fake. */
  readonly consumerFile: string;
  /** How the consumer reaches the provider's directory, relative to its own source. */
  readonly reach: string;
  /** The behavior the consumer's own tests state. */
  readonly behavior: string;
  /** The length the agreement accepts, which a revision may change. 500 by default. */
  readonly limit?: number | undefined;
  /** Whether the agreement also states trimming, which a revision may add. */
  readonly trims?: boolean | undefined;
}

const lines = (...parts: string[]) => `${parts.join('\n')}\n`;

const limitOf = (seam: Seam): number => seam.limit ?? 500;

/** Every path of one seam. */
export function paths(seam: Seam) {
  return {
    contract: `${seam.providerDirectory}/src/interfaces/${seam.capability}.ts`,
    fake: `${seam.providerDirectory}/src/fakes/${seam.capability}.fake.ts`,
    subjects: `${seam.providerDirectory}/src/tests/${seam.capability}.subjects.ts`,
    conformance: `${seam.providerDirectory}/src/tests/${seam.capability}.conformance.test.ts`,
    real: `${seam.providerDirectory}/src/${seam.capability}.ts`,
    declaration: `${seam.providerDirectory}/module.ramify`,
    consumer: `${seam.consumerDirectory}/src/${seam.consumerFile}`,
  };
}

/** The need the consumer's engineer reports, stated as behavior. */
export function need(seam: Seam) {
  return {
    capability: seam.capability,
    useCases: [seam.behavior],
    inputs: ['the note text'],
    outputs: ['whether the note is acceptable'],
    sideEffects: [],
    constraints: ['the rule the plan states'],
    existingEvidence: [`${seam.consumerDirectory}/src/tests/${seam.consumerFile.replace(/\.ts$/, '')}.test.ts`],
  };
}

/** The `contract-needed` submission of the consumer's engineer. */
export function contractNeeded(seam: Seam) {
  return {
    kind: 'contract-needed' as const,
    need: need(seam),
    suggestedProvider: seam.provider,
    summary: `The ${seam.capability} is not behavior this module owns, so nothing here was changed.`,
  };
}

/** The `established` submission of the contract sub-session. */
export function established(seam: Seam) {
  const path = paths(seam);
  return {
    kind: 'established' as const,
    mode: 'fake-backed' as const,
    authority: {
      kind: 'provider' as const,
      owner: seam.provider,
      rationale: 'The capability has an implementation of its own, so its public contract belongs with it.',
    },
    provider: seam.provider,
    behavior: seam.behavior,
    artifacts: {
      interface: [{
        path: path.contract,
        exports: seam.trims === true ? [`${seam.name}Cases`, `${seam.name}TrimCases`] : [`${seam.name}Cases`],
      }],
      conformance: [{ path: path.conformance }],
      fake: [{
        path: path.fake,
        exports: [`create${seam.name}Fake`],
        standsFor: [{ fake: `create${seam.name}Fake`, path: path.real, export: `create${seam.name}`, exposure: { to: [], reexposed: [] } }],
      }],
      exposure: [{ path: path.declaration, declaration: `expose-src ${seam.name}Cases from "interfaces/${seam.capability}.ts" to parent` }],
    },
    fakeInjections: [path.consumer],
    summary: `The ${seam.capability} is agreed, the consumer runs against its fake, and the conformance suite states what the provider owes.`,
  };
}

/** The writes of the contract sub-session, in the order it makes them. */
export function contractWrites(seam: Seam): ScriptStep[] {
  const path = paths(seam);
  const limit = limitOf(seam);
  return [
    write(path.contract, lines(
      `/** ${seam.behavior} */`,
      `export const ${seam.name}Cases = [`,
      "  { note: 'a short note', accepted: true },",
      `  { note: 'x'.repeat(${limit}), accepted: true },`,
      `  { note: 'x'.repeat(${limit + 1}), accepted: false },`,
      '];',
      ...(seam.trims === true
        ? [
          `export const ${seam.name}TrimCases = [`,
          "  { note: '  a short note  ', trimmed: 'a short note' },",
          "  { note: 'a short note', trimmed: 'a short note' },",
          '];',
        ]
        : []),
    )),
    write(path.fake, lines(
      `import { ${seam.name}Cases } from '../interfaces/${seam.capability}.ts';`,
      '',
      '/** The fake the consumer implements against until the real provider exists. */',
      `export function create${seam.name}Fake() {`,
      `  void ${seam.name}Cases;`,
      '  return {',
      `    accepts: (note) => note.length <= ${limit},`,
      ...(seam.trims === true ? ['    trim: (note) => note.trim(),'] : []),
      '  };',
      '}',
    )),
    write(path.subjects, lines(
      `import { create${seam.name}Fake } from '../fakes/${seam.capability}.fake.ts';`,
      '',
      `export const subjects = [{ name: 'the fake', create: create${seam.name}Fake }];`,
    )),
    write(path.conformance, conformanceFile(seam)),
    write(path.consumer, consumerAgainstFake(seam)),
  ];
}

/** The conformance suite the agreement is judged by, over whichever subjects the tree holds. */
function conformanceFile(seam: Seam): string {
  return lines(
    "import { test, expect } from 'vitest';",
    `import { ${seam.name}Cases${seam.trims === true ? `, ${seam.name}TrimCases` : ''} } from '../interfaces/${seam.capability}.ts';`,
    `import { subjects } from './${seam.capability}.subjects.ts';`,
    '',
    'for (const subject of subjects) {',
    `  for (const agreed of ${seam.name}Cases) {`,
    "    test(subject.name + ' answers ' + agreed.accepted + ' for ' + agreed.note.length, () => {",
    '      expect(subject.create().accepts(agreed.note)).toBe(agreed.accepted);',
    '    });',
    '  }',
    ...(seam.trims === true
      ? [
        `  for (const agreed of ${seam.name}TrimCases) {`,
        "    test(subject.name + ' trims ' + agreed.note.length + ' to ' + agreed.trimmed, () => {",
        '      expect(subject.create().trim(agreed.note)).toBe(agreed.trimmed);',
        '    });',
        '  }',
      ]
      : []),
    '}',
  );
}

/** The consumer's source with the fake in place. */
export function consumerAgainstFake(seam: Seam): string {
  return consumerSource(seam, `create${seam.name}Fake`, `${seam.reach}/src/fakes/${seam.capability}.fake.ts`);
}

/** The consumer's source with the real provider in place of the fake. */
export function consumerAgainstReal(seam: Seam): string {
  return consumerSource(seam, `create${seam.name}`, `${seam.reach}/src/${seam.capability}.ts`);
}

function consumerSource(seam: Seam, factory: string, from: string): string {
  return lines(
    `import { ${factory} } from '${from}';`,
    '',
    `const rule = ${factory}();`,
    '',
    'export function addNote(note) {',
    ...(seam.trims === true
      ? [
        '  const kept = rule.trim(note);',
        "  return rule.accepts(kept) ? kept : '';",
      ]
      : ["  return rule.accepts(note) ? note : '';"]),
    '}',
  );
}

/** The writes of the provider's own engineer: the real implementation, in the agreed suite's subjects. */
export function providerWrites(seam: Seam, projectRoot?: string): ScriptStep[] {
  const path = paths(seam);
  const limit = limitOf(seam);
  const toolPath = (projectPath: string) => projectRoot === undefined ? projectPath : join(projectRoot, projectPath);
  return [
    write(toolPath(path.real), lines(
      `/** The real ${seam.capability}. */`,
      `export function create${seam.name}() {`,
      '  return {',
      `    accepts: (note) => note.length <= ${limit},`,
      ...(seam.trims === true ? ['    trim: (note) => note.trim(),'] : []),
      '  };',
      '}',
    )),
    write(toolPath(path.subjects), lines(
      `import { create${seam.name}Fake } from '../fakes/${seam.capability}.fake.ts';`,
      `import { create${seam.name} } from '../${seam.capability}.ts';`,
      '',
      'export const subjects = [',
      `  { name: 'the fake', create: create${seam.name}Fake },`,
      `  { name: 'the real provider', create: create${seam.name} },`,
      '];',
    )),
  ];
}

/** A consumer module's own behavioral test, which states what it needs. */
export function consumerTest(file: string): string {
  return lines(
    "import { test, expect } from 'vitest';",
    `import { addNote } from '../${file}';`,
    '',
    "test('a note within the rule is kept', () => {",
    "  expect(addNote('a short note')).toBe('a short note');",
    '});',
    '',
    "test('a note outside the rule is refused', () => {",
    "  expect(addNote('x'.repeat(501))).toBe('');",
    '});',
  );
}

/** A consumer module's source before it has what it needs. */
export const consumerStub = lines(
  'export function addNote(note) {',
  "  throw new Error('the rule this module needs is not available here yet');",
  '}',
);
