import { describe, expect, test } from 'vitest';
import { gateViewSchema, runEventPageSchema, runQueryLimits, runSnapshotSchema } from '../interfaces/protocol/runs.js';
import { eventPage } from '../projections/events.js';
import { ProjectionError, runView } from '../projections/inputs.js';
import { snapshotOf } from '../projections/snapshot.js';
import { boundedTail, gateOf } from '../projections/work.js';
import type { GateAttempt } from '../checks/records.js';
import { at, constructedRun, hash, item, registered, reviews, type Line } from './helpers/constructed.js';

/*
 * The projections over constructed runs: the event page's limit and cursor,
 * the gate's bounded tail, the notices a person reads first, and a record
 * of an unsupported version, which is a failure with evidence.
 */

describe('the event page', () => {
  test('at most 500 events a page, with the cursor and whether more follow', () => {
    const lines: Line[] = [{ type: 'job-started', data: {} }];
    for (let index = 0; index < 1199; index += 1) lines.push({ type: 'hypotheses-delivered', data: { workItem: 'wi-001', refs: [] } });
    const view = runView(constructedRun(lines));

    const first = runEventPageSchema.parse(eventPage(view, 0));
    expect(first.events).toHaveLength(runQueryLimits.events);
    expect(first.events[0]!.sequence).toBe(1);
    expect(first).toMatchObject({ cursor: 500, more: true });
    expect(first.run.version).toBe(1200);

    const second = eventPage(view, first.cursor);
    expect(second.events.map(event => event.sequence)).toEqual(Array.from({ length: 500 }, (_, index) => 501 + index));
    expect(second).toMatchObject({ cursor: 1000, more: true });

    const last = eventPage(view, second.cursor);
    expect(last.events).toHaveLength(200);
    expect(last).toMatchObject({ cursor: 1200, more: false });

    // Past the end the cursor stays where it was asked, as Plan 1's did.
    expect(eventPage(view, 1200)).toMatchObject({ events: [], cursor: 1200, more: false });
    expect(eventPage(view, 5000)).toMatchObject({ events: [], cursor: 5000, more: false });
  });
});

describe('a gate attempt', () => {
  function attempt(tail: string): GateAttempt {
    return {
      schema: 'ramify-agent.gate-attempt/1', id: 'ga-0001', checkpoint: 'final', subject: {}, proposedBy: null,
      repairRound: 0, infrastructureAttempt: 0, head: 'abc', commit: null, guardedChanges: [],
      commands: [{
        kind: 'tests', command: { argv: ['npm', 'test'], cwd: '/p', env: { SECRET: 'not for the client' }, timeoutMs: 1000 },
        startedAt: '2026-09-21T08:00:00.000Z', elapsedMs: 5, exitCode: 0, outcome: 'passed', runnerError: null,
        output: { path: 'gates/ga-0001/tests.log', bytes: 40_000, truncated: false, tail },
      }],
      verdict: 'passed', cause: null, next: 'accept',
    };
  }

  test('its output tail is bounded at 8 KiB, at a character boundary, and its environment is withheld', () => {
    // A tail longer than the bound, ending in multi-byte characters.
    const tail = `${'a'.repeat(10_000)}${'é'.repeat(3000)}done`;
    const view = runView(constructedRun([{ type: 'gate-attempted', data: {}, records: [{ path: 'gates/ga-0001/attempt.json', body: attempt(tail) }] }]));
    const gate = gateViewSchema.parse(gateOf(view, 'ga-0001'));
    const shown = gate.commands[0]!.output.tail;
    expect(Buffer.byteLength(shown, 'utf8')).toBeLessThanOrEqual(runQueryLimits.outputTailBytes);
    expect(Buffer.byteLength(shown, 'utf8')).toBeGreaterThan(runQueryLimits.outputTailBytes - 4);
    expect(shown.endsWith('done')).toBe(true);
    expect(shown).not.toContain('�');
    expect(tail.endsWith(shown)).toBe(true);
    expect(JSON.stringify(gate)).not.toContain('SECRET');
    expect(gate.commands[0]!.output).toMatchObject({ path: 'gates/ga-0001/tests.log', bytes: 40_000, truncated: false });
    expect(boundedTail('short')).toBe('short');
  });

  test('an unknown attempt is not-found', () => {
    const view = runView(constructedRun([{ type: 'job-started', data: {} }]));
    expect(() => gateOf(view, 'ga-0009')).toThrow(ProjectionError);
  });
});

describe('the snapshot a person reads', () => {
  test('module notices come first, each saying which decision proposed it or that none did, then every cycle', () => {
    const lines: Line[] = [
      { type: 'job-started', data: {} },
      {
        type: 'analysis-accepted', data: { invocation: 'inv-0001', entries: 2, hypotheses: 0, registry: 2, workItems: 2 },
        records: [
          { path: at('registry', 'a'), body: registered('a') },
          { path: 'work-items/wi-001/item.json', body: item('wi-001', { entry: 'a' }) },
        ],
      },
      { type: 'dependency-cycle-detected', data: { members: ['a', 'b'], requirements: ['rq-001'], workItems: ['wi-001', 'wi-002'], closedBy: 'wi-001', detection: 1 } },
      {
        type: 'iteration-closed',
        data: {
          workItem: 'wi-001', iteration: 'wi-001.i01', outcome: 'accepted', gate: 'ga-0002', commit: 'c0ffee1234567890',
          notices: [
            { kind: 'module-created', module: `${reviews}/notes`, declaration: 'subs/notes/module.ramify', commit: 'c0ffee1234567890', iteration: 'wi-001.i01', decision: null },
            { kind: 'module-created', module: `${reviews}/drafts`, declaration: 'subs/drafts/module.ramify', commit: 'c0ffee1234567890', iteration: 'wi-001.i01', decision: { id: 'gd-001', revision: 1, hash } },
          ],
        },
      },
      { type: 'dependency-cycle-detected', data: { members: ['c', 'd'], requirements: ['rq-002'], workItems: ['wi-001'], closedBy: 'wi-001', detection: 1 } },
      { type: 'work-item-completed', data: { workItem: 'wi-001', gate: 'ga-0003' } },
    ];
    const snapshot = runSnapshotSchema.parse(snapshotOf(runView(constructedRun(lines))));
    expect(snapshot.notices.map(notice => [notice.kind, notice.sequence])).toEqual([
      ['module-created', 4], ['module-created', 4], ['dependency-cycle', 3], ['dependency-cycle', 5],
    ]);
    expect(snapshot.notices[0]!.summary).toContain('No placement decision proposed it.');
    expect(snapshot.notices[1]!.summary).toContain('Proposed by placement decision gd-001.');
    // Both cycles stay after they were resolved: the work item that closed
    // them completed and neither recurred.
    expect(snapshot.notices.filter(notice => notice.kind === 'dependency-cycle').map(notice => notice.kind === 'dependency-cycle' && [notice.cycle, notice.resolved]))
      .toEqual([[['a', 'b'], true], [['c', 'd'], true]]);

    // A cycle detected again is not resolved, and the notice of each
    // detection stays.
    const recurred = snapshotOf(runView(constructedRun([
      ...lines.slice(0, 3),
      { type: 'dependency-cycle-detected', data: { members: ['a', 'b'], requirements: ['rq-001'], workItems: ['wi-001'], closedBy: 'wi-001', detection: 2 } },
    ])));
    expect(recurred.notices.map(notice => notice.kind === 'dependency-cycle' && notice.resolved)).toEqual([false, false]);
    expect(recurred.notices[0]!.summary).toContain('not resolved');
  });

  test('a yielded work item is a wait, named with the provider it waits for', () => {
    const snapshot = snapshotOf(runView(constructedRun([
      { type: 'job-started', data: {} },
      { type: 'work-item-yielded', data: { workItem: 'wi-001', requirements: ['rq-001'], invocation: 'inv-0003' } },
    ])));
    expect(snapshot.waits).toEqual([{ workItem: 'wi-001', requirements: ['rq-001'], reason: 'wi-001 waits for provider work (rq-001)' }]);
    expect(snapshot.current).toEqual({ waitingFor: 'wi-001 waits for provider work (rq-001)' });
  });
});

describe('a record of an unsupported version', () => {
  test('is a failure with evidence, never an absent record', () => {
    const run = constructedRun([
      { type: 'job-started', data: {} },
      { type: 'analysis-accepted', data: {}, records: [{ path: 'work-items/wi-001/item.json', body: { ...item('wi-001', { entry: 'a' }), schema: 'ramify-agent.work-item/2' } }] },
    ]);
    let caught: unknown;
    try {
      runView(run);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProjectionError);
    const error = caught as ProjectionError;
    expect(error.code).toBe('unsupported-version');
    expect(error.message).toContain('ramify-agent.work-item/2');
    expect(error.message).toContain('ramify-agent.work-item/1');
    expect(error.evidence).toEqual([
      'plans/review-notes/.harness/jobs/20260921T080000Z-c0ffee/work-items/wi-001/item.json',
      'declares ramify-agent.work-item/2',
      'committed by event 2 (analysis-accepted)',
    ]);
  });
});
