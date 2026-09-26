import { describe, expect, test } from 'vitest';
import {
  acceptElements, createPackage, openElementCatalog, type SubmittedElement,
} from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { documentManifestSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { contextSelectorMessage, workOrientationMessage } from '../context-selection/prompts.js';
import {
  contextSelectorSubmissionSchema, orientationPacket, workOrientationSubmissionSchema,
} from '../context-selection/submissions.js';

const hash = 'a'.repeat(64);
const document = (id: string, path: string, kind: 'plan' | 'principle') => ({
  id, path, kind, sha256: hash, bytes: 1, storedAt: `input/documents/${id}.bin`, revision: { commit: null, dirty: null },
});
const manifest = documentManifestSchema.parse({
  schema: 'ramify-agent.document-manifest/1', root: 'doc-001',
  documents: [document('doc-001', 'plans/sample/plan.md', 'plan'), document('doc-002', 'docs/source.principles.md', 'principle')],
  missing: [], principlesScan: { status: 'complete', unreadable: [] },
});
const element = (key: string, kind: SubmittedElement['kind'], documentId: string, text: string): SubmittedElement =>
  ({ key, kind, document: documentId, text, conditions: [], uncertainty: '' });
const accepted = acceptElements(openElementCatalog(hash, manifest), [
  element('timeout', 'non-functional', 'doc-001', 'Keep the timeout.'),
  element('bounded', 'fixed', 'doc-002', 'Use bounded work.'),
  element('cache', 'recommendation', 'doc-002', 'A cache could help.'),
  element('today', 'context', 'doc-001', 'Today the service has no timeout.'),
  element('request', 'functional', 'doc-001', 'Serve with a timeout.'),
]);
if (!accepted.ok) throw new Error(accepted.errors.join('\n'));
const catalog = accepted.catalog;

describe('context selection submissions', () => {
  test('orientation is assignment-free and its packet preserves the full local briefing', () => {
    const submission = { focus: 'The service timeout', currentUnderstanding: 'The module has a warm path.', questions: ['Does the limit cover retries?'] };
    expect(workOrientationSubmissionSchema.safeParse(submission).success).toBe(true);
    expect(workOrientationSubmissionSchema.safeParse({ ...submission, assignment: { goal: 'skip selection' } }).success).toBe(false);
    const briefing = 'Work item wi-001\nGoal: preserve timeout\nPlan line: exact condition';
    const packet = orientationPacket({ workItem: 'wi-001', briefing, submission });
    expect(packet).toEqual(orientationPacket({ workItem: 'wi-001', briefing, submission }));
    expect(packet.text).toContain(briefing);
    expect(packet.text).toContain('Does the limit cover retries?');
    expect(workOrientationMessage(briefing)).toContain('Do not assign an iteration');
  });

  test('selector submits IDs and judgments only; identity and package belong to the harness', () => {
    const submitted = { selected: [{ id: 'nfr-001', reason: 'The assigned service has a timeout', conditions: [], uncertainty: '' }] };
    expect(contextSelectorSubmissionSchema.safeParse(submitted).success).toBe(true);
    expect(contextSelectorSubmissionSchema.safeParse({ ...submitted, package: { hash: '0'.repeat(64) } }).success).toBe(false);
    for (const removed of ['examined', 'unavailable']) expect(contextSelectorSubmissionSchema.safeParse({ ...submitted, [removed]: [] }).success).toBe(false);
    expect(contextSelectorSubmissionSchema.safeParse({ selected: [{ ...submitted.selected[0]!, passage: { document: 'doc-001', quote: 'Keep the timeout.' } }] }).success).toBe(false);
  });

  test('the selector message renders every non-functional, fixed and recommendation element through the package creator, and no functional or context element', () => {
    const message = contextSelectorMessage('The parent packet', catalog);
    expect(message.startsWith('The parent packet')).toBe(true);
    const rendered = createPackage({ catalog, planDeviations: [], elements: ['nfr-001', 'fix-001', 'rec-001'], deviations: [] });
    if ('unavailable' in rendered) throw new Error('fixture did not render');
    expect(message).toContain(rendered.text.trimEnd());
    for (const text of ['Keep the timeout.', 'Use bounded work.', 'A cache could help.', '### nfr-001', '### fix-001', '### rec-001']) expect(message).toContain(text);
    expect(message).not.toMatch(/(^|[^n])fr-001|ctx-001/);
    for (const text of ['Serve with a timeout.', 'Today the service has no timeout.', '## Functional requirements', '## Context']) expect(message).not.toContain(text);
    expect(message).toContain('answer with IDs only');
  });

  test('a catalog without selectable elements says so', () => {
    const only = acceptElements(openElementCatalog(hash, manifest), [element('request', 'functional', 'doc-001', 'Serve with a timeout.')]);
    if (!only.ok) throw new Error(only.errors.join('\n'));
    const message = contextSelectorMessage('The parent packet', only.catalog);
    expect(message).toContain('The catalog holds no non-functional, fixed or recommendation element.');
    expect(message).not.toContain('Serve with a timeout.');
  });
});
