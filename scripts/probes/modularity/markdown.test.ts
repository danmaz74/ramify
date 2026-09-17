import { describe, expect, it } from 'vitest';
import { projectModularity } from '../../../subs/analysis/src/index.js';
import type { CandidateOwnership, ModularityDocument, ModularityEvaluation } from '../../../subs/analysis/src/index.js';
import { buildReport, graphSpec, paths } from '../../../subs/analysis/src/tests/modularity-fixture.js';
import { renderMarkdown } from './markdown.js';

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
const row = (markdown: string, name: string) => markdown.split('\n').find(line => line.startsWith(`| ${name} |`));

describe('modularity Markdown', () => {
  it('renders a declared-only document without a comparison', () => {
    const markdown = renderMarkdown(document([]), { title: 'Baseline' });
    expect(markdown).toContain('\n## Summary and coverage\n');
    expect(markdown).toContain('\n## Ranked evidence\n');
    expect(markdown).not.toContain('Comparison');
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
    expect(markdown.indexOf('## Comparison')).toBeLessThan(markdown.indexOf('## Declared ownership'));
  });
});
