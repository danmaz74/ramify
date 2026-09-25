import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { documentManifestSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis } from './helpers/analysis.js';
import { submit } from './helpers/iterations.js';
import { installTestRunner, onlyRun, openRuns, runEventsOnDisk, startRun } from './helpers/runs.js';
import { unchangedGit } from './helpers/unchanged-run.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

test('a required missing companion cannot produce accepted analysis', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  await writeFile(join(fixture.root, 'plans/review-notes/plan.md'), '# Request\n\n[Required guide](must-exist.md)\n');
  const opened = await openRuns(fixture.root, { git: unchangedGit(fixture.root, []), script: spec => {
    if (spec.role !== 'initial-architect') return [];
    const captured = /captured file (.+\/input\/plan\.md)/u.exec(spec.prompt)?.[1];
    if (!captured) throw new Error('Captured plan missing');
    const directory = dirname(dirname(captured));
    const manifest = documentManifestSchema.parse(JSON.parse(readFileSync(join(directory, 'input/documents.json'), 'utf8')));
    const root = manifest.documents.find(item => item.id === manifest.root)!;
    const gap = manifest.missing.find(item => item.target.endsWith('must-exist.md'))!;
    return submit({ ...analysis([]), incorporation: {
      documents: [{ document: root.id, scenarios: true, governing: [{ document: root.id, sha256: root.sha256,
        start: 0, end: Buffer.byteLength('# Request'), quote: '# Request' }], uncertainty: '' }],
      missing: [{ from: gap.from, target: gap.target, source: gap.source, judgment: 'required',
        reason: 'This guide is required by the request.' }],
    } });
  } });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('review-notes'));
  await opened.service.settled('review-notes', receipt.jobId);
  const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
  expect(events.filter(event => event.type === 'analysis-accepted')).toHaveLength(0);
  expect(onlyRun(opened.service, 'review-notes').state).toBe('failed');
  expect(opened.agent?.sessions.some(session => session.verdicts.some(verdict =>
    JSON.stringify(verdict).includes('Required document')))).toBe(true);
}, 30_000);
