import { posix } from 'node:path';
import type { CheckFindingLocation, CheckFindingReportCredibility } from '../../subs/check-findings/src/interfaces/check-findings.js';
import type { CandidateSource } from '../../subs/evidence/src/git.js';
import type { ArchitectIndex, ModuleEntry } from '../../subs/evidence/src/views.js';
import { ownerOf } from '../kpi/lines.js';
import type { CandidateSnapshot } from './snapshot.js';

/*
 * What the harness binds to a reviewer's concern besides its words: the
 * credibility of what grounds it and the modules it concerns. Both are
 * derived from the audited candidate and the run's own records, never from
 * the submission, so a reviewer can neither raise its own credibility nor
 * move a concern into another module's authority.
 *
 * Credibility follows the provenance of the ground, never its kind or its
 * wording. A ground is human-reviewed when it is a principles document, the
 * run's plan document or a feature file the harness wrote from the accepted
 * analysis; any other file an agent may have written, and is
 * agent-generated. That includes any other file of the plan's directory: an
 * agent may write there, and under-crediting a person's note costs only
 * attention order, while crediting an agent's would raise its own words to
 * human-reviewed. No ground is ungrounded. An approved requirement
 * record would count as human-reviewed too, but the run's records live in
 * its state directory, which is never part of an audited candidate, so no
 * ground a reviewer read can name one.
 */

/** What the classifier needs of the run: its plan and the feature files it wrote. */
export interface GroundProvenance {
  readonly planId: string;
  /** Every tracked feature file the harness renders, project-relative. */
  readonly featureFiles: ReadonlySet<string>;
}

/** The credibility of a concern grounded in `path`, a candidate path, or in nothing. */
export function groundCredibility(path: string | null, provenance: GroundProvenance): Exclude<CheckFindingReportCredibility, 'objective'> {
  if (path === null) return 'ungrounded';
  if (posix.basename(path).endsWith('.principles.md')) return 'human-reviewed';
  if (path === `plans/${provenance.planId}/plan.md`) return 'human-reviewed';
  if (provenance.featureFiles.has(path)) return 'human-reviewed';
  return 'agent-generated';
}

/**
 * The candidate's own module tree, read from the `module.ramify` files its
 * commit holds where Ramify's layout allows them: the root, and each
 * `subs/<name>/` of a module. A declaration elsewhere declares nothing. Each
 * module is named by its declared-name path, as the architect view names it,
 * and owns its `src/` and its two declaration files.
 */
export async function candidateModuleIndex(source: CandidateSource, projectRoot: string, snapshot: CandidateSnapshot): Promise<ArchitectIndex> {
  const modules = new Map<string, ModuleEntry>();
  const declared = (dir: string) => snapshot.entries.get(dir === '' ? 'module.ramify' : `${dir}/module.ramify`)?.kind === 'file';
  const visit = async (dir: string, parent: string | null): Promise<string | null> => {
    const text = await source.readBlob(projectRoot, snapshot.commit, dir === '' ? 'module.ramify' : `${dir}/module.ramify`);
    const name = /^module\s+("[^"]*"|\S+)/mu.exec(text)?.[1]?.replace(/^"|"$/gu, '');
    if (name === undefined) return null;
    const module = parent === null ? name : `${parent}/${name}`;
    const prefix = dir === '' ? 'subs/' : `${dir}/subs/`;
    const children: string[] = [];
    const childDirs = [...snapshot.directories].filter(path => path.startsWith(prefix) && !path.slice(prefix.length).includes('/')).sort();
    for (const child of childDirs) {
      if (!declared(child)) continue;
      const named = await visit(child, module);
      if (named !== null) children.push(named);
    }
    modules.set(module, { module, dir, parent, children, tags: [], areas: ['src'] });
    return module;
  };
  if (declared('')) await visit('', null);
  return { revision: snapshot.tree, input: `candidate ${snapshot.commit}`, modules, symbols: new Map() };
}

/**
 * The modules a concern concerns: the owner of each location on the
 * candidate's module tree, once each in location order. A location no
 * module's own contents hold, such as a file an `outside-modules` scope
 * reached, has no other owner and concerns the work item's module.
 */
export function concernModules(index: ArchitectIndex | null, locations: readonly CheckFindingLocation[], workItemModule: string | null): string[] {
  const owners = [...new Set(locations.flatMap(location => ownerOf(index, location.path) ?? workItemModule ?? []))];
  if (owners.length > 0) return owners;
  return workItemModule === null ? [] : [workItemModule];
}
