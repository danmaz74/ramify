import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import type { Catalog, DocumentManifest } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { contextSelectorMessage, workOrientationMessage } from '../context-selection/prompts.js';
import {
  contextSelectorSubmissionSchema, orientationPacket, prepareContextSelection,
  workOrientationSubmissionSchema,
} from '../context-selection/submissions.js';

const source = new TextEncoder().encode('Keep the timeout.\n');
const digest = createHash('sha256').update(source).digest('hex');
const manifest: DocumentManifest = {
  schema: 'ramify-agent.document-manifest/1', root: 'doc-001',
  documents: [{ id: 'doc-001', path: 'plans/sample/plan.md', kind: 'plan', sha256: digest, bytes: source.length, storedAt: 'input/plan.md', revision: { commit: null, dirty: null } }],
  missing: [], principlesScan: { status: 'empty', unreadable: [] },
};
const passage = { document: 'doc-001', sha256: digest, start: 0, end: 17, quote: 'Keep the timeout.' };
const catalog: Catalog = {
  schema: 'ramify-agent.nonfunctional-catalog/1', manifestHash: 'a'.repeat(64),
  items: [{ id: 'nfr-001', classification: 'non-functional-requirement', passage, conditions: [], uncertainty: '' }],
};
const identity = { workItem: 'wi-001', orientationInvocation: 'inv-001', orientationPoint: 'point-1', selectorInvocation: 'inv-002', degraded: false };

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

  test('selector submits judgments only; the harness adds identity and package hash', () => {
    const submitted = {
      examined: ['nfr-001'],
      selected: [{ item: 'nfr-001', passage, reason: 'The assigned service has a timeout', conditions: [], uncertainty: '' }],
      unavailable: [],
    };
    expect(contextSelectorSubmissionSchema.safeParse(submitted).success).toBe(true);
    expect(contextSelectorSubmissionSchema.safeParse({ ...submitted, packageHash: '0'.repeat(64) }).success).toBe(false);
    const prepared = prepareContextSelection(submitted, identity, catalog, manifest, new Map([['doc-001', source]]));
    expect(prepared.status).toBe('available');
    if (prepared.status !== 'available') return;
    expect(prepared.selection).toMatchObject({ ...identity, packageHash: prepared.package.hash });
    expect(prepared.package.text).toContain('Keep the timeout.');
    expect(contextSelectorMessage('The parent packet', catalog, manifest, '/run')).toContain('The parent packet');
    expect(contextSelectorMessage('The parent packet', catalog, manifest, '/run')).toContain('nfr-001');
    const principleManifest: DocumentManifest = { ...manifest, documents: [...manifest.documents, {
      id: 'doc-002', path: 'docs/source.principles.md', kind: 'principle', sha256: digest,
      bytes: source.length, storedAt: 'input/documents/doc-002.bin', revision: { commit: 'b'.repeat(40), dirty: false },
    }], principlesScan: { status: 'complete', unreadable: [] } };
    const selectorPrompt = contextSelectorMessage('The parent packet', catalog, principleManifest, '/run');
    expect(selectorPrompt).toContain('/run/input/documents/doc-002.bin');
    expect(selectorPrompt).toContain(digest);
  });

  test('invalid citation and unavailable bytes cannot become a complete package', () => {
    const selected = { examined: ['nfr-001'], selected: [{ item: 'nfr-001', passage, reason: 'Relevant', conditions: [], uncertainty: '' }], unavailable: [] };
    expect(prepareContextSelection(selected, identity, catalog, manifest, new Map())).toMatchObject({ status: 'unavailable' });
    expect(prepareContextSelection({ ...selected, selected: [{ ...selected.selected[0]!, passage: { ...passage, quote: 'Other quote' } }] }, identity, catalog, manifest, new Map([['doc-001', source]])).status).toBe('unavailable');
  });
});
