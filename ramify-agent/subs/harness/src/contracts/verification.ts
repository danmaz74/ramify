import type { ContractRecord } from './records.js';

/*
 * What closes a delegation.
 *
 * A passing gate is not enough. `requirement-verified` also requires that no
 * location the requirement named as a fake injection still reaches the fake:
 * passing against a fake is never completion, and a verification iteration
 * that ran its tests with the fake still in place has verified nothing.
 *
 * The check reads the consumer's own source, never the submission: what an
 * agent says it replaced is not evidence that it did.
 */

/** One named injection location, as it stands in the tree. */
export interface InjectionSite {
  readonly path: string;
  readonly text: string;
}

/** A location that still reaches the fake, and what in it does. */
export interface RemainingInjection {
  readonly path: string;
  readonly reference: string;
}

/**
 * Every injection location that still references the fake: an import or
 * re-export whose specifier names one of the fake's files, or one of the
 * fake's exported names used as an identifier.
 */
export function remainingInjections(contract: ContractRecord, sites: readonly InjectionSite[]): RemainingInjection[] {
  const stems = contract.artifacts.fake.map(entry => stemOf(entry.path));
  const names = [...new Set(contract.artifacts.fake.flatMap(entry => entry.exports))];
  const remaining: RemainingInjection[] = [];

  for (const site of sites) {
    const source = withoutComments(site.text);
    const specifier = [...source.matchAll(/from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)]
      .map(match => match[1] ?? match[2] ?? match[3] ?? '')
      .find(value => stems.some(stem => stemOf(value) === stem));
    if (specifier !== undefined) {
      remaining.push({ path: site.path, reference: specifier });
      continue;
    }
    const used = names.find(name => new RegExp(`(^|[^\\w$])${escape(name)}([^\\w$]|$)`).test(source));
    if (used !== undefined) remaining.push({ path: site.path, reference: used });
  }
  return remaining;
}

/** A module path without its directory and without its language extension. */
function stemOf(path: string): string {
  const base = path.split('/').at(-1) ?? path;
  return base.replace(/\.[cm]?[jt]sx?$/, '');
}

function escape(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
