import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import type { Assertions } from './runner.js';
import { coreDescription, coreDirectory, vocabulary } from './fixtures/plan2/reference.js';

export type ReferenceEdit = 'remove-hop' | 'tag-change' | 'wildcard-add' | 'wildcard-remove'
  | 'foreign-wildcard-invalid' | 'readme-edit' | 'invalid-description';

const workspace = 'collection-review/workspace';
const core = `${workspace}/catalog/core`;
const vocabularyNames = ['Finding', 'InspectionReport', 'Observation', 'ObservationCallback', 'RecordId',
  'Revision', 'RevisionChain', 'RevisionScope', 'ReviewStatus', 'findingSchema', 'inspectionReportSchema',
  'observationSchema', 'recordIdSchema', 'reviewStatusSchema', 'revisionChainSchema', 'revisionSchema', 'revisionScopeSchema'].sort();
const baselineSummary = { complete: true, owners: 15, sourceFiles: 54, resources: 5, originals: 89,
  accesses: 294, allowed: 166, denied: 0, errors: 0, warnings: 2, coverageNotes: 0, external: 128 };

function wildcardPairs(report: AnalysisReport, owner: string) {
  const linked = report.snapshot?.linked;
  if (linked?.status !== 'valid') throw new Error('Expected valid expanded contracts');
  const matches = linked.selections.filter(s => s.module === owner && s.selector === 'wildcard'
    && s.provider === (owner === workspace ? `${workspace}/contracts` : vocabulary));
  if (matches.length !== 1) throw new Error('Expected exactly one C1 or W1 statement');
  return matches[0].pairs.filter(pair => pair.effective);
}

/** Report assertions shared by batch fixture tests and future quick handlers.
 * Callers must additionally assert freshness, reuse, events and publication. */
export function assertReferenceEditReport(edit: ReferenceEdit, baseline: AnalysisReport,
  report: AnalysisReport, assertions: Assertions): void {
  const equal = (name: string, actual: unknown, expected: unknown) => assertions.equal(`${edit}: ${name}`, actual, expected);
  const ok = (name: string, actual: unknown) => assertions.ok(`${edit}: ${name}`, actual);
  equal('independent reference baseline', baseline.summary, baselineSummary);
  ok('changed inputs cannot be answered by the baseline report', report.inputId !== baseline.inputId);
  const invalid = edit === 'foreign-wildcard-invalid' || edit === 'invalid-description';
  equal('expected execution', report.outcome.execution, invalid ? 'invalid' : 'completed');
  const decisions = report.snapshot?.results.flatMap(result => result.decisions) ?? [];
  if (invalid) {
    equal('invalid input provides no model', report.snapshot?.model, null);
    equal('invalid input provides no permissions', decisions, []);
    const code = edit === 'foreign-wildcard-invalid' ? 'foreign-original' : 'missing-file';
    const file = edit === 'foreign-wildcard-invalid'
      ? 'subs/workspace/subs/contracts/module.ramify' : coreDescription;
    ok('located declaration error', report.diagnostics.some(d => d.code === code && d.location?.file === file
      && d.location.line > 0 && d.location.column > 0));
    return;
  }
  if (edit === 'remove-hop') {
    equal('only root loses the catalog router', decisions.filter(d => d.status === 'denied').map(d =>
      [d.question.importer.file, d.original?.id.binding, d.reason]), [['src/assembly.ts', 'createCatalogRouter', 'not-visible']]);
    return;
  }
  if (edit === 'tag-change') {
    const before = baseline.snapshot!.model!.originals.filter(original => original.id.owner === core);
    const after = report.snapshot!.model!.originals.filter(original => original.id.owner === core);
    ok('core original control is nonempty', before.length > 0);
    equal('every core original gains ui including tests', after.map(o => [o.id, o.tags]),
      before.map(o => [o.id, [...o.tags, 'ui'].sort()]));
    for (const [file, binding] of [['router.ts', 'getRecord'], ['mcp.ts', 'inspect']]) {
      const matches = decisions.filter(d => d.question.importer.file === `subs/workspace/subs/catalog/src/${file}`
        && d.original?.id.owner === core && d.original.id.binding === binding);
      equal(`${binding} has one denied value access`, matches.map(d => [d.status, d.reason, d.question.selection?.request]),
        [['denied', 'required-importer-tag', 'value']]);
      ok(`${binding} fails the ui requirement`, matches[0].requirements.some(r => r.tag === 'ui' && !r.satisfied));
    }
    return;
  }
  if (edit === 'wildcard-add' || edit === 'wildcard-remove') {
    for (const owner of [`${workspace}/contracts`, workspace]) {
      equal(`${owner} baseline wildcard membership`, wildcardPairs(baseline, owner).map(p => p.name).sort(), vocabularyNames);
      const pairs = wildcardPairs(report, owner);
      equal(`${owner} changed wildcard membership`, pairs.map(p => p.name).sort(), edit === 'wildcard-add'
        ? [...vocabularyNames, 'ResidentVocabulary'].sort() : vocabularyNames.filter(name => name !== 'RecordId'));
      if (edit === 'wildcard-add') equal(`${owner} preserves the new original`,
        pairs.find(p => p.name === 'ResidentVocabulary')!.original,
        { kind: 'code', owner: `${workspace}/contracts`, file: 'interfaces/vocabulary.ts', binding: 'ResidentVocabulary' });
    }
    if (edit === 'wildcard-remove') {
      ok('removed type has a located consumer error', report.diagnostics.some(d => d.code === 'missing-export'
        && d.location?.file === `${coreDirectory}/src/catalog.ts` && d.location.line > 0 && d.location.column > 0));
      const access = report.snapshot!.accesses.find(a => a.importer.file === `${coreDirectory}/src/catalog.ts`
        && a.selections.some(s => s.exportedName === 'RecordId'));
      ok('consumer selection explicitly lost RecordId', access?.selections.some(s =>
        s.exportedName === 'RecordId' && s.status === 'missing-export'));
      equal('removed export is absent from the catalog', report.snapshot!.catalog!.files.find(f => f.file === vocabulary)!
        .exports.some(e => e.name === 'RecordId'), false);
    } else equal('added vocabulary is valid', report.diagnostics, []);
    return;
  }
  const purpose = report.snapshot!.inventory.modules.find(module => module.id === workspace)!.purpose;
  equal('README remains present', purpose.state, 'present');
  ok('README has the new paragraph', purpose.state === 'present'
    && purpose.paragraph.startsWith('Workspace is the browser shell for the current project.'));
  equal('README preserves all access results', report.snapshot!.results, baseline.snapshot!.results);
  equal('README preserves the expanded contracts', report.snapshot!.linked, baseline.snapshot!.linked);
  equal('README preserves diagnostics and coverage', [report.diagnostics, report.coverage], [[], []]);
}

export function assertRestoredReferenceReport(baseline: AnalysisReport, report: AnalysisReport, assertions: Assertions): void {
  assertions.equal('restored independent reference counts', report.summary, baselineSummary);
  assertions.equal('restoration returns the complete original report except runId',
    { ...report, runId: 'comparison' }, { ...baseline, runId: 'comparison' });
}
