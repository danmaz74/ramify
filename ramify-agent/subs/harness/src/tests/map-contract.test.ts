import { describe, expect, test } from 'vitest';
import {
  implementationMapSchema,
  inputManifestSchema,
  isWithin,
  validateMapSubmission,
  type MapSubmission,
} from '../interfaces/map.js';

function submission(): MapSubmission {
  return {
    summary: { change: 'Reviewers can attach notes to a review run.', preserves: ['Runs stay immutable once closed.'] },
    modulesTouched: [
      { module: 'app/review', weight: 'heavy', why: 'Owns review runs.' },
      { module: 'app/ui', weight: 'light', why: 'Shows the notes.' },
      { module: 'app/review/notes', weight: 'heavy', why: 'Stores notes.', proposed: { parent: 'app/review', purpose: 'Reviewer notes.', tags: [] } },
    ],
    reuse: [{
      capability: 'Load a run',
      symbols: [{ name: 'loadRun', owner: 'app/review' }],
      requester: { module: 'app/ui', area: 'src' },
      availability: { status: 'unknown', reason: 'The API view of app/ui was not materialized.' },
    }],
    newCapabilities: [{ capability: 'Add a note', goal: 'A reviewer adds a note to an open run.', owner: 'app/review/notes', consumers: ['app/ui'] }],
    seams: [{ capability: 'Add a note', owner: 'app/review/notes', consumer: 'app/ui' }],
    entryPoint: { module: 'app/ui', acceptance: 'A note added in the run view is shown after reload.' },
    workItems: [{ title: 'Notes storage', subtreeRoot: 'app/review', capabilities: ['Add a note'] }],
    assumptions: { assumed: ['Notes are plain text.'], notFound: [], coverageLimits: [] },
    evidence: [{ claim: 'app/review owns runs.', citations: [{ kind: 'view-record', path: '.ramify-architect/app/review/module.json' }] }],
  };
}

describe('validateMapSubmission', () => {
  test('accepts a complete submission', () => {
    const result = validateMapSubmission(submission());
    expect(result).toEqual({ ok: true, value: submission() });
  });

  test('rejects unknown fields, missing sections and bad values, naming their paths', () => {
    const extra = { ...submission(), notes: 'x' };
    expect(validateMapSubmission(extra)).toMatchObject({ ok: false });
    const { seams: _seams, ...missing } = submission();
    const result = validateMapSubmission(missing);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some(error => error.startsWith('seams:'))).toBe(true);
    const bad = submission();
    (bad.modulesTouched[0] as { weight: string }).weight = 'medium';
    const badResult = validateMapSubmission(bad);
    expect(badResult.ok).toBe(false);
    if (!badResult.ok) expect(badResult.errors[0]).toMatch(/^modulesTouched\.0\.weight: /);
    expect(validateMapSubmission('a closing message')).toMatchObject({ ok: false });
  });

  test('an unavailable reuse needs its exposure declarations', () => {
    const map = submission();
    map.reuse[0]!.availability = { status: 'unavailable', exposures: [] };
    expect(validateMapSubmission(map).ok).toBe(false);
    map.reuse[0]!.availability = { status: 'unavailable', exposures: [{ module: 'app/review', declaration: 'expose-src loadRun from "load.ts" to parent' }] };
    expect(validateMapSubmission(map).ok).toBe(true);
  });

  test('checks internal consistency', () => {
    const map = submission();
    map.entryPoint.module = 'app/elsewhere';
    map.modulesTouched.push({ module: 'app/ui', weight: 'light', why: 'Again.' });
    map.modulesTouched[2]!.proposed!.parent = 'app/ui';
    map.seams.push({ capability: 'Add a note', owner: 'app/review', consumer: 'app/review/notes' });
    const result = validateMapSubmission(map);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      'modulesTouched.2.proposed.parent: "app/review/notes" is not beneath "app/ui"',
      'modulesTouched.3.module: "app/ui" is listed more than once',
      'entryPoint.module: "app/elsewhere" is not among the modules touched',
      'seams.1: "app/review" and "app/review/notes" are in the same branch',
    ]);
  });
});

test('branches compare whole path segments', () => {
  expect(isWithin('app/review/notes', 'app/review')).toBe(true);
  expect(isWithin('app/review', 'app/review')).toBe(true);
  expect(isWithin('app/reviewer', 'app/review')).toBe(false);
});

describe('a saved revision', () => {
  const manifest = {
    planHash: 'a'.repeat(64),
    source: { commit: 'abc123', dirty: true },
    versions: { architectPrompt: null, procedure: null, skill: null, ramify: '0.0.0' },
    architectView: { status: 'placeholder' },
  };

  test('carries its identity and the submission', () => {
    const saved = { schema: 'ramify-agent.implementation-map/1', identity: { planId: 'p', revision: 1, jobId: 'j', manifest }, ...submission() };
    expect(implementationMapSchema.parse(saved)).toEqual(saved);
    expect(implementationMapSchema.safeParse({ ...saved, identity: { ...saved.identity, revision: 0 } }).success).toBe(false);
  });

  test('the manifest marks a placeholder view and accepts a materialized one', () => {
    expect(inputManifestSchema.parse(manifest)).toEqual(manifest);
    const materialized = { ...manifest, source: null, architectView: { status: 'materialized', revision: 'rev/1', input: 'input/1:x', coverageLimits: [] } };
    expect(inputManifestSchema.parse(materialized)).toEqual(materialized);
    expect(inputManifestSchema.safeParse({ ...manifest, planHash: 'nope' }).success).toBe(false);
  });
});
