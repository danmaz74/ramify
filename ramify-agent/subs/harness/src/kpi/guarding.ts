import type { Observation } from '../run/observations.js';

/*
 * What was guarded, and what was only observed.
 *
 * The MVP guards `edit` and `write` and does not guard the shell. An
 * evaluation that reported "no blocked write" without saying which tools
 * were guarded would read as proof that every write respected its scope,
 * which it is not. This projection is what keeps that honest: it names the
 * tools the guard judged, the tools that mutated without passing it, and
 * the coverage gaps that qualify the counts.
 *
 * It is a pure function of one invocation's observation log. It writes
 * nothing, as every projection of this harness.
 */

export type GuardVerdictCounts = Record<'allowed' | 'blocked-scope' | 'blocked-unresolved', number>;

export interface GuardingReport {
  /** The tools whose mutating calls the guard judged. */
  readonly guarded: readonly string[];
  /** The tools that mutated without passing the guard. */
  readonly unguarded: readonly string[];
  readonly verdicts: GuardVerdictCounts;
  /** Mutations observed, and how many of them name the paths of one call. */
  readonly mutations: { readonly observed: number; readonly attributable: number };
  /** Modules this invocation read outside its scope, each counted once. */
  readonly excursions: readonly string[];
  readonly gaps: ReadonlyArray<{ readonly kind: string; readonly count: number }>;
  /**
   * Whether the guarded calls account for every mutation. False while an
   * unguarded writer exists, and then no count of blocked calls is evidence
   * about what respected a scope.
   */
  readonly complete: boolean;
  /** The one sentence an evaluation must carry beside the counts. */
  readonly statement: string;
}

/** What one invocation's observations say about guarding. */
export function guardingReport(observations: readonly Observation[]): GuardingReport {
  const verdicts: GuardVerdictCounts = { allowed: 0, 'blocked-scope': 0, 'blocked-unresolved': 0 };
  const guarded = new Set<string>();
  const toolOfCall = new Map<string, string>();
  const mutatingCalls = new Set<string>();
  const excursions = new Set<string>();
  const gaps = new Map<string, number>();
  let observed = 0;
  let attributable = 0;

  for (const line of observations) {
    switch (line.type) {
      case 'guard':
        guarded.add(line.data.tool);
        verdicts[line.data.verdict] += 1;
        break;
      case 'activity':
        if (line.data.activity.kind === 'tool' || line.data.activity.kind === 'tool-error') {
          toolOfCall.set(line.data.activity.callId, line.data.activity.tool);
        }
        break;
      case 'mutation':
        observed += 1;
        if (line.data.attributable) attributable += 1;
        if (line.data.callId !== null) mutatingCalls.add(line.data.callId);
        break;
      case 'excursion':
        excursions.add(line.data.module);
        break;
      case 'coverage-gap':
        gaps.set(line.data.kind, (gaps.get(line.data.kind) ?? 0) + 1);
        break;
      default:
        break;
    }
  }

  const unguarded = new Set<string>();
  for (const call of mutatingCalls) {
    const tool = toolOfCall.get(call);
    if (tool !== undefined && !guarded.has(tool)) unguarded.add(tool);
  }

  const complete = unguarded.size === 0 && !gaps.has('unguarded-shell');
  return {
    guarded: [...guarded].sort(),
    unguarded: [...unguarded].sort(),
    verdicts,
    mutations: { observed, attributable },
    excursions: [...excursions].sort(),
    gaps: [...gaps].map(([kind, count]) => ({ kind, count })).sort((a, b) => (a.kind < b.kind ? -1 : 1)),
    complete,
    statement: complete
      ? `Every observed mutation passed the guard (${[...guarded].sort().join(', ') || 'no tool'}).`
      : `Guarded: ${[...guarded].sort().join(', ') || 'no tool'}. Not guarded: ${[...unguarded].sort().join(', ') || 'the shell'}. `
        + 'A count of blocked calls is not evidence that every write respected its scope; what an unguarded tool wrote is seen only in the tree afterwards.',
  };
}
