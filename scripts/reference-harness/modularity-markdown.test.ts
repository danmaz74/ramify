import { describe, expect, it } from 'vitest';
import { projectModularity } from '../../subs/analysis/src/index.js';
import type { CandidateOwnership, ModularityDocument, ModularityEvaluation } from '../../subs/analysis/src/index.js';
import { buildReport, dependencyReportSpec, graphSpec, paths } from '../../subs/analysis/src/tests/modularity-fixture.js';
import { renderMarkdown } from '../probes/modularity/markdown.js';

const report = buildReport(graphSpec);
const evaluate = (ownership?: CandidateOwnership): ModularityEvaluation => {
  const outcome = projectModularity({ revision: 'batch:input-1', report, ownership, limits: { maxBoundaryChanges: 10, maxReportBytes: 1 << 24 } });
  if (outcome.status !== 'projected') throw new Error(JSON.stringify(outcome));
  return { modularity: outcome.report, changeAffinity: null };
};
const merge: CandidateOwnership = { id: 'merge-widgets', files: [{ path: paths.button, owner: 'app/ui' }],
  modules: evaluate().modularity.modules.filter(module => module.id !== 'app/ui/widgets') };
const document = (candidates: readonly ModularityEvaluation[]): ModularityDocument => ({ schemaVersion: 'ramify.modularity-document/1',
  repository: { commit: 'c'.repeat(40), clean: true }, declared: evaluate(), candidates });
const row = (markdown: string, name: string, after = '') =>
  markdown.slice(markdown.indexOf(after)).split('\n').find(line => line.startsWith(`| ${name} |`));

describe('modularity Markdown', () => {
  it('renders a declared-only document without a comparison', () => {
    const markdown = renderMarkdown(document([]), { title: 'Baseline' });
    expect(markdown).toContain('\n## Summary and coverage\n');
    expect(markdown).toContain('\n## Ranked evidence\n');
    expect(markdown).not.toContain('Comparison');
    expect(markdown).toContain('\n## Dependency diagram facts\n');
    expect(markdown).toContain('| Documentation files | Documentation bytes |');
    expect(row(markdown, '`app/core`', '## Context size: production')).toContain('| 2 | 30 B |');
    expect(row(markdown, 'production', '## Dependency diagram facts')).toContain('unavailable (not-requested)');
  });

  it('renders dependency diagram facts and both endpoint projections', () => {
    const diagramReport = buildReport(dependencyReportSpec);
    const outcome = projectModularity({ revision: 'batch:input-1', report: diagramReport, limits: { maxBoundaryChanges: 10, maxReportBytes: 1 << 24 } });
    if (outcome.status !== 'projected') throw new Error(JSON.stringify(outcome));
    const markdown = renderMarkdown({ ...document([]), declared: { modularity: outcome.report, changeAffinity: null } }, { title: 'Diagram' });
    expect(row(markdown, 'production', '## Dependency diagram facts'))
      .toMatch(/^\| production \| partial: 1 unknown, 2 unattributed, 2 limits \| 6 \| 3 \| 2 \| 3\/5\/1 \| 1\/3 \| 1\/1 \| 1\/1 \| [0-9,]+ \|$/);
    const imported = markdown.slice(markdown.indexOf('### Production imported-module links'), markdown.indexOf('### Production original-owner links'));
    expect(imported.split('\n').filter(line => line.startsWith('| `'))).toEqual([
      '| `a` | `a/b` | 2 | 2 | denied |', '| `a` | `a/c` | 0 | 2 | limited |', '| `a` | `a/core` | 0 | 1 | allowed |']);
    expect(row(markdown, '`a`', '### Production original-owner links')).toBe('| `a` | `a/core` | 3 | 2 | denied |');
  });

  it('compares each candidate with declared ownership measure by measure and nests every evaluation', () => {
    const markdown = renderMarkdown(document([evaluate(merge)]), { title: 'Comparison' });
    expect(row(markdown, 'Production runtime cycle components')).toBe('| Production runtime cycle components | lower | 1 | 0 (improves) |');
    expect(row(markdown, 'Production exact locality (all loads)')).toBe('| Production exact locality (all loads) | higher | 1/7 (14.3%) | 3/7 (42.9%) (improves) |');
    expect(row(markdown, 'Production owners with source files')).toBe('| Production owners with source files | none | 4 | 3 (differs) |');
    expect(row(markdown, 'Production behavioral dependencies')).toContain('(not comparable)');
    expect(row(markdown, 'Boundary changes (both filters)')).toBe('| Boundary changes (both filters) | none | not applicable | 2 |');
    expect(markdown).toContain('| improves | Production exact locality (all loads);');
    expect(markdown).toContain('| `app/ui/widgets` | provider owners | 1 | absent | not comparable |');
    expect(markdown).toContain('\n## Declared ownership\n\n### Summary and coverage\n');
    expect(markdown).toContain('\n## Candidate `merge-widgets`\n\n### Summary and coverage\n');
    expect(markdown).toContain('\n### Boundary changes\n');
    expect(markdown).toContain('unavailable (candidate-documentation)');
    expect(markdown.indexOf('## Comparison')).toBeLessThan(markdown.indexOf('## Declared ownership'));
  });
});
