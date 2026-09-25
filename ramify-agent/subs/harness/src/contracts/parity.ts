import type { ArchitectIndex, ExposureChannel, ModuleEntry, SymbolRecord } from '../../subs/evidence/src/views.js';
import type { GateRuleRecord } from '../checks/records.js';
import { exportedNames } from './naming.js';
import type { ExposureChain, StandsFor } from './records.js';

/*
 * The fake-exposure-parity rule of the harness principles: a fake is exactly
 * as importable as the real export it stands for. A fake that more modules
 * receive than the real export is used at a seam the real provider never
 * acts at, and retiring it means re-plumbing the consumer; a fake that fewer
 * receive hides an exposure the real export will need.
 *
 * Importability is compared, never statement text. Each original's exposure
 * is read from the architect view Ramify generated, which records where its
 * owner exposes it and each ancestor that re-exposes it, and the modules
 * that receive it are derived from that chain over the module tree. The
 * view says nothing of an export that does not exist yet, so while the real
 * export is missing the fake is compared with the exposure the agreement
 * declares for it. The required tags come from the source area, so a fake
 * and its real export in the same owner's same area carry the same tags.
 *
 * Retiring a fake is the harness's and the agents' concern. A fake whose file
 * or export is gone is out of the rule, and a declaration that still names it
 * is a violation where it lies, named as a retired fake's exposure rather
 * than left to surface as an invalid exposure.
 */

/** One fake export and the real export it stands for, as an agreement names them. */
export interface StandIn {
  /** The agreement that names it, for the messages. */
  readonly contract: string;
  readonly fakePath: string;
  readonly standsFor: StandsFor;
  /**
   * Whether the agreement under this gate declares it. Its exposure is then
   * the gate's own to answer, whatever the write scope; another agreement's
   * fake is attributed by the write scope.
   */
  readonly declaredHere: boolean;
}

export interface ParityInput {
  /** The architect view refreshed for this gate, or null where it could not be. */
  readonly index: ArchitectIndex | null;
  readonly standIns: readonly StandIn[];
  /** A project-relative file's text, or null where it does not exist. */
  readonly read: (path: string) => Promise<string | null>;
  /**
   * The project-relative write scope of the iteration the gate follows, its
   * roots and its named files. A violation of another agreement's fake that
   * no file of this scope decides was not introduced by this iteration's
   * writes, and is recorded as a limit rather than failing the gate: a
   * provider that writes the real export before an ancestor outside its
   * scope re-exposes it is not failed for the ancestor's step.
   */
  readonly writeScope: readonly string[];
}

/** Which part of the rule one violation breaks. */
export type ParityViolationKind = 'extra-exposure' | 'missing-exposure' | 'owner' | 'tags' | 'retired-fake-exposure';

interface Found {
  readonly violation: { readonly rule: ParityViolationKind; readonly path: string; readonly detail: string };
  /**
   * The files an iteration writes to introduce or repair the violation, for
   * attribution: the declaration of a differing exposure step, or the fake
   * and the real export's files for their owner and source area.
   */
  readonly decidedBy: readonly string[];
}

/** How many receiving modules one message names before it counts the rest. */
const namedModules = 5;

/** The rule over every stand-in, with what it could not compare and what it did not attribute. */
export async function fakeExposureParity(input: ParityInput): Promise<GateRuleRecord> {
  const violations: Array<GateRuleRecord['violations'][number]> = [];
  const limits: string[] = [];
  for (const standIn of input.standIns) {
    const outcome = await judge(standIn, input);
    if (outcome.limit !== undefined) limits.push(outcome.limit);
    for (const found of outcome.found) {
      if (standIn.declaredHere || found.decidedBy.some(path => inside(path, input.writeScope))) {
        violations.push(found.violation);
      } else {
        limits.push(`not this iteration's: no file that decides it lies in its write scope (${found.violation.path}: ${found.violation.detail})`);
      }
    }
  }
  return {
    rule: 'fake-exposure-parity',
    outcome: violations.length === 0 ? 'passed' : 'failed',
    violations: dedupe(violations),
    ...(limits.length === 0 ? {} : { limits: [...new Set(limits)] }),
  };
}

async function judge(standIn: StandIn, input: ParityInput): Promise<{ found: Found[]; limit?: string }> {
  const { standsFor, fakePath } = standIn;
  const fake = `\`${standsFor.fake}\` (${fakePath})`;
  const real = `\`${standsFor.export}\` (${standsFor.path})`;
  const text = await input.read(fakePath);
  if (text === null || !exportedNames(text).some(entry => entry.name === standsFor.fake)) {
    // Retired: the file or the export is gone, the rule no longer applies,
    // and no declaration may still expose what is gone.
    const found: Found[] = [];
    for (const declaration of await declarationFiles(fakePath, input.read)) {
      const line = exposureNaming(declaration.text, standsFor.fake, fakePath, declaration.dir);
      if (line === null) continue;
      found.push({
        violation: {
          rule: 'retired-fake-exposure',
          path: declaration.path,
          detail: `the fake ${fake} of ${standIn.contract} is retired, and "${line}" still exposes it; a fake's exposure is removed with it`,
        },
        decidedBy: [declaration.path],
      });
    }
    return { found };
  }

  const index = input.index;
  if (index === null) {
    return { found: [], limit: `${fake} of ${standIn.contract}: the architect view could not be refreshed, so its importability was not compared with ${real}` };
  }
  const fakeRecord = recordOf(index, fakePath, standsFor.fake);
  if (fakeRecord === undefined) {
    return { found: [], limit: `${fake} of ${standIn.contract}: the architect view records no such original, so its importability was not compared with ${real}` };
  }
  const realRecord = recordOf(index, standsFor.path, standsFor.export);
  const realOwner = realRecord?.module ?? ownerOf(index, standsFor.path)?.module;
  if (realOwner === undefined) {
    return { found: [], limit: `${fake} of ${standIn.contract}: no module of the architect view holds ${standsFor.path}, so its importability was not compared with ${real}` };
  }
  const files = [fakePath, standsFor.path];

  if (fakeRecord.module !== realOwner) {
    return {
      found: [{
        violation: {
          rule: 'owner',
          path: fakePath,
          detail: `the fake ${fake} is owned by ${fakeRecord.module}, and the real export it stands for, ${real}, by ${realOwner}; `
            + 'an original is received from its owner, so a fake stands beside the real export in the provider',
        },
        decidedBy: files,
      }],
    };
  }

  const owner = realOwner;
  const fakeChain = chainOf(fakeRecord);
  const realChain = realRecord === undefined ? standsFor.exposure : chainOf(realRecord);
  const basis = realRecord === undefined ? 'as the agreement declares it' : 'as the architect view records it';
  const fakeReceivers = receivers(index, owner, fakeChain);
  const realReceivers = receivers(index, owner, realChain);
  const fakeSteps = stepsOf(owner, fakeChain);
  const realSteps = stepsOf(owner, realChain);
  const found: Found[] = [];

  for (const step of fakeSteps) {
    if (realSteps.some(other => other.by === step.by && other.channel === step.channel)) continue;
    const only = [...receiversOfStep(index, step)].filter(module => module !== owner && !realReceivers.has(module));
    if (only.length === 0) continue;
    found.push({
      violation: {
        rule: 'extra-exposure',
        path: declarationPath(index, step.by),
        detail: `${stepText(step, owner)} the fake ${fake} to ${step.channel}, and the real export it stands for, ${real}, has no such exposure ${basis}: `
          + `${listed(only)} would receive the fake and not the real export. Expose the fake exactly as the real export`,
      },
      decidedBy: [declarationPath(index, step.by)],
    });
  }
  for (const step of realSteps) {
    if (fakeSteps.some(other => other.by === step.by && other.channel === step.channel)) continue;
    const only = [...receiversOfStep(index, step)].filter(module => module !== owner && !fakeReceivers.has(module));
    if (only.length === 0) continue;
    found.push({
      violation: {
        rule: 'missing-exposure',
        path: declarationPath(index, step.by),
        detail: `${stepText(step, owner)} the real export ${real} to ${step.channel} ${basis}, and not the fake ${fake} that stands for it: `
          + `${listed(only)} would receive the real export and not the fake. Expose the fake exactly as the real export`,
      },
      decidedBy: [declarationPath(index, step.by)],
    });
  }

  const fakeTags = realRecord === undefined ? areaOf(index, owner, fakePath) : [...(fakeRecord.tags ?? [])].sort().join(', ');
  const realTags = realRecord === undefined ? areaOf(index, owner, standsFor.path) : [...(realRecord.tags ?? [])].sort().join(', ');
  if (fakeTags !== realTags) {
    found.push({
      violation: {
        rule: 'tags',
        path: fakePath,
        detail: realRecord === undefined
          ? `the fake ${fake} is in ${owner}'s ${fakeTags} and the real export ${real} in its ${realTags}, so an importer needs other tags for one than for the other`
          : `an importer of the fake ${fake} needs the tags [${fakeTags}], and one of the real export ${real} needs [${realTags}]`,
      },
      decidedBy: files,
    });
  }
  return { found };
}

/** One exposure step: the owner's own, or an ancestor's re-exposure. */
interface Step {
  readonly by: string;
  readonly channel: ExposureChannel;
}

function stepsOf(owner: string, chain: ExposureChain): Step[] {
  return [
    ...chain.to.map(channel => ({ by: owner, channel })),
    ...chain.reexposed.flatMap(entry => entry.to.map(channel => ({ by: entry.by, channel }))),
  ];
}

function stepText(step: Step, owner: string): string {
  return step.by === owner ? `${owner} exposes` : `${step.by} re-exposes`;
}

/** An original's exposure as the view records it. An internal original has none. */
function chainOf(record: SymbolRecord): ExposureChain {
  return {
    to: record.role === 'internal' ? [] : [...(record.to ?? [])],
    reexposed: (record.reexposed ?? []).map(entry => ({ by: entry.by, to: [...entry.to] })),
  };
}

/**
 * The modules that receive an original of `owner` through `chain`: the
 * parent of each module that exposes it to its parent, and the descendants
 * of each that exposes it to its descendants. The owner itself always has
 * it, so it is left out of the comparison.
 */
export function receivers(index: ArchitectIndex, owner: string, chain: ExposureChain): Set<string> {
  const received = new Set<string>();
  for (const step of stepsOf(owner, chain)) for (const module of receiversOfStep(index, step)) received.add(module);
  received.delete(owner);
  return received;
}

function receiversOfStep(index: ArchitectIndex, step: Step): Set<string> {
  if (step.channel === 'parent') {
    const parent = index.modules.get(step.by)?.parent ?? null;
    return new Set(parent === null ? [] : [parent]);
  }
  return new Set([...index.modules.values()].filter(entry => ancestorsOf(index, entry.module).includes(step.by)).map(entry => entry.module));
}

/** The module that owns one project-relative path: the deepest module whose directory holds it. */
export function ownerOf(index: ArchitectIndex, path: string): ModuleEntry | undefined {
  let owner: ModuleEntry | undefined;
  for (const entry of index.modules.values()) {
    if (entry.dir !== '' && path !== entry.dir && !path.startsWith(`${entry.dir}/`)) continue;
    if (owner === undefined || depthOf(entry) > depthOf(owner)) owner = entry;
  }
  return owner;
}

/** A module's ancestors, nearest first. */
export function ancestorsOf(index: ArchitectIndex, module: string): string[] {
  const ancestors: string[] = [];
  let current = index.modules.get(module)?.parent ?? null;
  while (current !== null && !ancestors.includes(current)) {
    ancestors.push(current);
    current = index.modules.get(current)?.parent ?? null;
  }
  return ancestors;
}

function depthOf(entry: ModuleEntry): number {
  return entry.dir === '' ? 0 : entry.dir.split('/').length;
}

/** The record of the original `name` that `file` defines, or exposes under that name. */
function recordOf(index: ArchitectIndex, file: string, name: string): SymbolRecord | undefined {
  for (const records of index.symbols.values()) {
    const found = records.find(record => record.file === file && (record.name === name || record.binding === name || record.as?.includes(name)));
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The source area a path lies in, which decides the tags its originals carry. */
function areaOf(index: ArchitectIndex, owner: string, path: string): string {
  const dir = index.modules.get(owner)?.dir ?? '';
  const local = dir === '' ? path : path.slice(dir.length + 1);
  return local.startsWith('src/tests/') ? 'src/tests' : 'src';
}

function declarationPath(index: ArchitectIndex, module: string): string {
  const dir = index.modules.get(module)?.dir ?? '';
  return dir === '' ? 'module.ramify' : `${dir}/module.ramify`;
}

/** Every `module.ramify` in a directory that holds `path`: its owner's and its ancestors'. */
async function declarationFiles(path: string, read: (path: string) => Promise<string | null>): Promise<Array<{ path: string; dir: string; text: string }>> {
  const parts = path.split('/').slice(0, -1);
  const found: Array<{ path: string; dir: string; text: string }> = [];
  for (let length = 0; length <= parts.length; length += 1) {
    const dir = parts.slice(0, length).join('/');
    const declaration = dir === '' ? 'module.ramify' : `${dir}/module.ramify`;
    const text = await read(declaration);
    if (text !== null) found.push({ path: declaration, dir, text });
  }
  return found;
}

/**
 * The exposure statement of one declaration that still names a fake: by its
 * exported name, or by its file where the statement selects the whole file.
 */
function exposureNaming(text: string, name: string, fakePath: string, dir: string): string | null {
  const word = new RegExp(`(^|[^\\w$])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w$]|$)`);
  const local = dir === '' ? fakePath : fakePath.slice(dir.length + 1);
  const file = local.replace(/^src\/(tests\/)?/, '');
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line.startsWith('expose-')) continue;
    if (word.test(line) || line.includes(`"${file}"`)) return line;
  }
  return null;
}

function listed(modules: readonly string[]): string {
  const sorted = [...modules].sort();
  if (sorted.length <= namedModules) return sorted.join(', ');
  return `${sorted.slice(0, namedModules).join(', ')} and ${sorted.length - namedModules} more`;
}

function inside(file: string, writeScope: readonly string[]): boolean {
  return writeScope.some(path => file === path || path === '.' || file.startsWith(`${path}/`));
}

function dedupe<T extends { rule: string; path: string; detail: string }>(values: readonly T[]): T[] {
  return values.filter((value, position) => values.findIndex(other => other.rule === value.rule && other.path === value.path && other.detail === value.detail) === position);
}
