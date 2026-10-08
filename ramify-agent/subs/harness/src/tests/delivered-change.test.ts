import { describe, expect, test } from 'vitest';
import type { ChangedFile, ChangeHistory, LineCommit, LineRange } from '../../subs/evidence/src/git.js';
import { cachedChangeHistory, deliveredChange, type DeliveredChangeRequest } from '../kpi/delivered.js';
import type { LineEventSummary } from '../run/records.js';

/*
 * The change weight `w_e` is each writer's share of the delivered change,
 * the run base to its last accepted commit. Git's answers are scripted: an
 * unscripted call fails, and nothing here reproduces Git's behavior.
 */

const base = 'b'.repeat(40);
const harnessCommit = 'h'.repeat(40);
const first = '1'.repeat(40);
const second = '2'.repeat(40);
const final = '3'.repeat(40);

interface Script {
  readonly commits?: string[];
  readonly files?: ChangedFile[];
  readonly origins?: Record<string, LineCommit[]>;
  readonly seen?: Record<string, LineCommit[]>;
  readonly fail?: string;
}

/** A history that answers what it was given and refuses every other question. */
function scripted(script: Script): ChangeHistory & { readonly calls: string[] } {
  const calls: string[] = [];
  const answer = <T>(name: string, value: T | undefined): Promise<T> => {
    calls.push(name);
    if (script.fail !== undefined) return Promise.reject(new Error(script.fail));
    if (value === undefined) return Promise.reject(new Error(`unscripted ${name}`));
    return Promise.resolve(value);
  };
  return {
    calls,
    commitsBetween: async (root, from, to) => answer(`commits ${from}..${to}`, root === '/project' && from === base ? script.commits : undefined),
    changedFiles: async (root, from, to) => answer(`files ${from}..${to}`, root === '/project' ? script.files : undefined),
    lineOrigins: async (_root, _from, _to, path) => answer(`origins ${path}`, script.origins?.[path]),
    lineLastSeen: async (_root, _from, _to, path) => answer(`seen ${path}`, script.seen?.[path]),
  };
}

const lines = (commit: string, ...numbers: number[]): LineCommit[] => numbers.map(line => ({ line, commit, boundary: false }));
const range = (start: number, count: number): LineRange => [start, count];
const file = (path: string, added: LineRange[], deleted: LineRange[] = [], before: string | null = path): ChangedFile =>
  ({ before, after: path, binary: false, added, deleted });

function summary(invocation: string, paths: Array<[string, number, number]>): LineEventSummary {
  return {
    schema: 'ramify-agent.line-events/1', invocation,
    paths: paths.map(([path, added, deleted]) => ({ path, owner: 'p/a', added, deleted, binary: false, bytes: null })),
    unmapped: { paths: 0, added: 0, deleted: 0 }, coverage: 'complete', gaps: [],
  };
}

function request(extra: Partial<DeliveredChangeRequest> = {}): DeliveredChangeRequest {
  return {
    projectRoot: '/project', base, final,
    writers: new Map([[first, ['inv-0007']], [second, ['inv-0009']]]),
    harness: new Set([harnessCommit]), harnessPaths: new Set(['features/x.feature']),
    recorded: new Map(), ...extra,
  };
}

describe('the delivered change counts each line once, in its delivered form', () => {
  test('a line a later writer rewrote counts for the later writer only, a deleted base line for the writer that removed it', async () => {
    // inv-0007 wrote lines 1-4 in `first`; inv-0009 rewrote lines 3-4 in
    // `second`, and deleted base line 9 that `first` still held.
    const history = scripted({
      commits: [harnessCommit, first, second, final],
      files: [file('subs/a/src/a.ts', [range(1, 4)], [range(9, 1)])],
      origins: { 'subs/a/src/a.ts': [...lines(first, 1, 2), ...lines(second, 3, 4)] },
      seen: { 'subs/a/src/a.ts': lines(first, 9) },
    });
    const delivered = await deliveredChange(history, request({ writers: new Map([[first, ['inv-0007']], [second, ['inv-0009']], [final, []]]) }));
    expect(delivered).toMatchObject({ state: 'measured', base, final, harness: 0, binaryPaths: [] });
    if (delivered.state !== 'measured') return;
    expect([...delivered.weights]).toEqual([['inv-0007', 2], ['inv-0009', 3]]);
    expect([...delivered.unattributed]).toEqual([]);
  });

  test('the harness commits and paths are weighted to no writer, and a binary path carries no lines', async () => {
    const history = scripted({
      commits: [harnessCommit, first, final],
      files: [
        file('.gitignore', [range(5, 1)]),
        file('features/x.feature', [range(1, 30)], [range(1, 2)]),
        { before: null, after: 'subs/a/logo.png', binary: true, added: [], deleted: [] },
        file('subs/a/src/a.ts', [range(1, 3)], [], null),
      ],
      origins: { '.gitignore': lines(harnessCommit, 5), 'subs/a/src/a.ts': lines(first, 1, 2, 3) },
    });
    const delivered = await deliveredChange(history, request());
    if (delivered.state !== 'measured') throw new Error(delivered.reason);
    expect([...delivered.weights]).toEqual([['inv-0007', 3]]);
    // One .gitignore line in the scratch commit and the feature file's 32.
    expect(delivered.harness).toBe(33);
    expect(delivered.binaryPaths).toEqual(['subs/a/logo.png']);
    expect(history.calls).not.toContain('origins features/x.feature');
  });

  test('a commit two writers share is split per path by their recorded increases; a line no writer can be named for stays unattributed', async () => {
    const history = scripted({
      commits: [first, final],
      files: [file('subs/a/src/a.ts', [range(1, 8)]), file('subs/a/src/b.ts', [range(1, 2)]), file('subs/a/src/c.ts', [range(1, 1)])],
      origins: {
        'subs/a/src/a.ts': lines(first, 1, 2, 3, 4, 5, 6, 7, 8),
        'subs/a/src/b.ts': lines(first, 1, 2),
        'subs/a/src/c.ts': [{ line: 1, commit: base, boundary: true }],
      },
    });
    const delivered = await deliveredChange(history, request({
      writers: new Map([[first, ['inv-0007', 'inv-0008']]]),
      recorded: new Map([
        ['inv-0007', summary('inv-0007', [['subs/a/src/a.ts', 9, 0]])],
        ['inv-0008', summary('inv-0008', [['subs/a/src/a.ts', 3, 0]])],
      ]),
    }));
    if (delivered.state !== 'measured') throw new Error(delivered.reason);
    // a.ts: 8 lines split 9:3; b.ts: neither recorded a line there.
    expect([...delivered.weights]).toEqual([['inv-0007', 6], ['inv-0008', 2]]);
    expect([...delivered.unattributed]).toEqual([
      ['Git blames an added line on the base or earlier', 1],
      [`commit ${first.slice(0, 12)} holds the work of inv-0007, inv-0008, and none recorded a line added in subs/a/src/b.ts`, 2],
    ]);
  });

  test('a shared commit whose writers\' line events cannot be read, and a commit no writer is recorded for, stay unattributed', async () => {
    const history = scripted({
      commits: [first, second, final],
      files: [file('subs/a/src/a.ts', [range(1, 3)])],
      origins: { 'subs/a/src/a.ts': [...lines(first, 1, 2), ...lines(second, 3)] },
    });
    const delivered = await deliveredChange(history, request({
      writers: new Map([[first, ['inv-0007', 'inv-0008']]]),
      recorded: new Map([['inv-0007', null], ['inv-0008', summary('inv-0008', [])]]),
    }));
    if (delivered.state !== 'measured') throw new Error(delivered.reason);
    expect([...delivered.weights]).toEqual([]);
    expect([...delivered.unattributed]).toEqual([
      [`commit ${first.slice(0, 12)} holds the work of inv-0007, inv-0008, and the line events of inv-0007 cannot be read`, 2],
      [`commit ${second.slice(0, 12)} holds no recorded writer's work`, 1],
    ]);
  });

  test('no accepted commit is not-applicable, and a Git that cannot answer is unavailable, never zero', async () => {
    const unasked = scripted({});
    expect(await deliveredChange(unasked, request({ final: base }))).toEqual({ state: 'not-applicable', reason: 'No commit was accepted after the run base' });
    expect(await deliveredChange(unasked, request({ writers: new Map() }))).toMatchObject({ state: 'not-applicable' });
    expect(unasked.calls).toEqual([]);
    expect(await deliveredChange(scripted({ fail: 'git exited 128' }), request())).toEqual({
      state: 'unavailable', reason: 'The delivered change could not be read from Git: git exited 128',
    });
  });

  test('a kept history asks Git once per question, and keeps no failure', async () => {
    const history = scripted({ commits: [first, final], files: [file('subs/a/src/a.ts', [range(1, 1)])], origins: { 'subs/a/src/a.ts': lines(first, 1) } });
    const kept = cachedChangeHistory(history);
    const once = await deliveredChange(kept, request());
    const twice = await deliveredChange(kept, request());
    expect(twice).toEqual(once);
    expect(history.calls).toEqual([`commits ${base}..${final}`, `files ${base}..${final}`, 'origins subs/a/src/a.ts']);

    const failing = scripted({});
    const keptFailing = cachedChangeHistory(failing);
    await expect(keptFailing.commitsBetween('/project', base, final)).rejects.toThrow('unscripted');
    await expect(keptFailing.commitsBetween('/project', base, final)).rejects.toThrow('unscripted');
    expect(failing.calls).toHaveLength(2);
  });
});
