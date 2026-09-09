import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { parseDescription } from '../../subs/analysis/subs/descriptions/src/parse.js';
import { linkDescriptions } from '../../subs/analysis/subs/descriptions/src/link.js';
import { buildModel, createDefaultTagRegistry, deriveSourceAreas, explainImport } from '../../subs/analysis/subs/model/src/index.js';
import type { ImportDecision, ModelResult } from '../../subs/analysis/subs/model/src/index.js';
import { readProject } from '../../subs/analysis/subs/project/src/read-project.js';
import { createSourceAnalysis } from '../../subs/analysis/subs/typescript/src/source-analysis.js';
import type { SourceAccess, SourceAnalysis } from '../../subs/analysis/subs/typescript/src/interfaces/source.js';
import { repositoryRoot } from './plan.js';
import { validationInputs } from './linking-expectations.js';
import type { Assertions } from './runner.js';

function valid<T>(result: ModelResult<T>): T {
  if (result.status !== 'valid') throw new Error(JSON.stringify(result));
  return result.value;
}
export const staticForms = new Set(['import', 'import-type', 'inline-type-import', 'named-export', 'type-export', 'inline-type-export', 'side-effect-import']);

/** I9 stage evidence binds the published acquisition, source and model provider
 * operations on ONE captured view. The completed analysis session arrives in I12. */
export async function staticProject(root: string) {
  const inputs = validationInputs(root);
  const registry = createDefaultTagRegistry();
  const acquired = await readProject({ request: inputs.project, parse: parseDescription, limits: inputs.limits.acquisition });
  if (acquired.status !== 'acquired') throw new Error(JSON.stringify(acquired));
  let source: SourceAnalysis | undefined;
  try {
    const inventory = acquired.view.inventory;
    const areas = inventory.modules.flatMap(module => valid(deriveSourceAreas(registry, module.id,
      module.areas.find(area => area.kind === 'ordinary')!.root, module.headerTags)));
    source = await createSourceAnalysis({ view: acquired.view, inventory, areas, limits: inputs.limits.source });
    const catalog = await source.catalog();
    const linked = linkDescriptions({ registry, inventory, catalog });
    if (linked.status !== 'valid') throw new Error(JSON.stringify(linked));
    const model = valid(buildModel(linked.modelInput));
    const observed = await source.accesses();
    const decisions: { access: SourceAccess; decision: ImportDecision }[] = [];
    for (const access of observed.accesses) {
      if (!staticForms.has(access.form) || access.target.kind !== 'application') continue;
      const target = access.target.origin;
      for (const selection of access.selections) {
        if (selection.status !== 'resolved' || !selection.original) continue;
        decisions.push({ access, decision: explainImport(model, { importer: access.importer, location: selection.location,
          target, forwarding: selection.forwarding, selection: { original: selection.original, request: selection.request } }) });
      }
      if (!access.selections.length && access.form === 'side-effect-import') decisions.push({ access, decision: explainImport(model,
        { importer: access.importer, location: access.location, target, forwarding: [], selection: null }) });
    }
    const seal = await acquired.view.seal();
    if (seal.status !== 'coherent') throw new Error(JSON.stringify(seal));
    return { inventory, catalog, linked, model, ...observed, decisions };
  } finally {
    try { await source?.dispose(); } finally { await acquired.view.dispose(); }
  }
}
export type StaticProject = Awaited<ReturnType<typeof staticProject>>;

export async function compilerValid(root: string, assertions: Assertions): Promise<void> {
  try {
    const result = await promisify(execFile)(process.execPath,
      [join(repositoryRoot, 'node_modules/typescript/lib/tsc.js'), '--noEmit', '--project', join(root, 'tsconfig.json')],
      { cwd: root, timeout: 30_000, maxBuffer: 1024 * 1024 });
    assertions.equal('source fixture remains valid TypeScript', [result.stdout, result.stderr], ['', '']);
  } catch (error) {
    throw new Error(`Source fixture compiler failure: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function completeStatic(result: StaticProject, assertions: Assertions): void {
  const application = result.accesses.filter(access => staticForms.has(access.form) && access.target.kind === 'application');
  assertions.ok('static application occurrences were executed', application.length > 0);
  assertions.equal('every static application selection is resolved', application.flatMap(access => access.selections)
    .filter(selection => selection.status !== 'resolved'), []);
  assertions.equal('static application coverage is complete', application.flatMap(access => access.coverageIds), []);
  assertions.equal('no static target silently unresolved', result.accesses.filter(access => staticForms.has(access.form)
    && access.target.kind !== 'application' && access.target.kind !== 'external'), []);
  assertions.equal('every static application binding and symbol-free target receives a model decision',
    result.decisions.length, application.reduce((count, access) => count + Math.max(1, access.selections.length), 0));
}
export function cleanStatic(result: StaticProject, assertions: Assertions): void {
  completeStatic(result, assertions);
  assertions.equal('all authored static application imports allowed', result.decisions.filter(item => item.decision.status !== 'allowed'), []);
}

export function selected(result: StaticProject, assertions: Assertions, importer: string, binding: string) {
  const found = result.decisions.filter(item => item.access.importer.file === importer && item.decision.original?.id.binding === binding);
  assertions.equal(`${importer}#${binding}: one executed selection`, found.length, 1);
  return found[0]!;
}

export function expectedDecision(assertions: Assertions, selected: { access: SourceAccess; decision: ImportDecision }, expected: {
  readonly importer: string; readonly owner: string; readonly file: string; readonly binding: string;
  readonly target: string; readonly status: ImportDecision['status']; readonly reason: ImportDecision['reason'];
  readonly request?: 'value' | 'type-only'; readonly tags: readonly string[]; readonly profile: readonly string[];
  readonly hops?: readonly string[]; readonly failedTag?: string;
}): void {
  const { access, decision } = selected;
  assertions.equal('located importer and ordinary area', [decision.question.importer.file, decision.question.importer.area.kind,
    decision.question.importer.area.profile], [expected.importer, 'ordinary', expected.profile]);
  assertions.equal('canonical original and defining area', [decision.original?.id, decision.original?.origin.area.owner, decision.original?.tags],
    [{ kind: 'code', owner: expected.owner, file: expected.file, binding: expected.binding }, expected.owner, expected.tags]);
  assertions.equal('accessed source retained separately', decision.question.target.file, expected.target);
  assertions.equal('independently expected decision', [decision.status, decision.reason, decision.question.selection?.request],
    [expected.status, expected.reason, expected.request ?? 'value']);
  assertions.ok('useful source and declaration locations', decision.question.location.file === expected.importer
    && decision.question.location.line > 0 && decision.question.location.column > 0
    && decision.original!.declarations.every(at => at.file.length > 0 && !at.file.startsWith('/') && at.line > 0));
  assertions.ok('source origin evidence retains accessed and defining source', decision.checkedOrigins.some(origin => origin.file === expected.target)
    && decision.checkedOrigins.some(origin => origin.file === decision.original!.origin.file));
  assertions.equal('selection has complete coverage', access.coverageIds, []);
  if (expected.hops) {
    assertions.ok('expected exposure path with declaration locations', decision.visibility?.paths.some(path =>
      JSON.stringify(path.map(hop => hop.module)) === JSON.stringify(expected.hops)
      && path.every(hop => hop.evidence.length && hop.evidence.every(at => at.file.endsWith('module.ramify') && at.line > 0))));
  }
  if (expected.failedTag) assertions.ok('exact failed tag requirement after visibility', decision.visibility?.visible
    && decision.requirements.some(item => item.tag === expected.failedTag && !item.satisfied));
}
