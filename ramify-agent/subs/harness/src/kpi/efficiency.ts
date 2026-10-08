import { explorationDetails, observedElapsedMs, type ExplorationObservation } from './exploration.js';

export interface InvocationTiming {
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly milestone: 'first-designated-submission' | 'first-engineering-action' | null;
  readonly milestoneAt: string | null;
  readonly elapsedMs: number | null;
  readonly toMilestoneMs: number | null;
  readonly modelElapsedMs: number | null;
  readonly toolElapsedMs: number | null;
  readonly checkElapsedMs: number | null;
  readonly coverage: readonly string[];
}

export interface RecordedCharge {
  readonly model: string;
  readonly currency: 'USD';
  readonly source: 'provider-recorded' | 'estimated-from-recorded-rates';
  readonly newInputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly outputTokens: number | null;
  readonly ratesPerMillion: { readonly newInput: number | null; readonly cachedInput: number | null; readonly cacheWrite: number | null; readonly output: number | null };
  readonly newInput: number | null;
  readonly cachedInput: number | null;
  readonly cacheWrite: number | null;
  readonly output: number | null;
  readonly total: number | null;
  readonly coverage: readonly string[];
}

type ChargeInput = Pick<RecordedCharge, 'model' | 'newInputTokens' | 'cachedInputTokens' | 'cacheWriteTokens' | 'outputTokens' | 'ratesPerMillion'>;
const valid = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0;

/** Uses caller-recorded rates only. A provider-recorded charge can be retained verbatim instead. */
export function estimateRecordedCharge(input: ChargeInput): RecordedCharge {
  const coverage: string[] = [];
  const amount = (name: keyof RecordedCharge['ratesPerMillion'], tokens: number | null): number | null => {
    const rate = input.ratesPerMillion[name];
    if (!valid(tokens) || !valid(rate)) { coverage.push(`${name}: recorded usage or rate unavailable`); return null; }
    return tokens * rate / 1_000_000;
  };
  const newInput = amount('newInput', input.newInputTokens);
  const cachedInput = amount('cachedInput', input.cachedInputTokens);
  const cacheWrite = amount('cacheWrite', input.cacheWriteTokens);
  const output = amount('output', input.outputTokens);
  const amounts = [newInput, cachedInput, cacheWrite, output];
  return { ...input, currency: 'USD', source: 'estimated-from-recorded-rates', newInput, cachedInput, cacheWrite, output,
    total: amounts.every(valid) ? amounts.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null, coverage };
}

/** Wall duration comes from the invocation boundaries, never the sum of parallel calls. */
export function invocationTiming(input: Pick<InvocationTiming, 'startedAt' | 'endedAt' | 'milestone' | 'milestoneAt'> & {
  readonly modelElapsedMs?: number | null;
  readonly checkElapsedMs?: number | null;
  readonly exploration?: readonly ExplorationObservation[];
  readonly coverage?: readonly string[];
}): InvocationTiming {
  const coverage = new Set(input.coverage ?? []);
  const difference = (end: string | null, label: string): number | null => {
    if (end === null) { coverage.add(`${label}: endpoint unknown`); return null; }
    const value = Date.parse(end) - Date.parse(input.startedAt);
    if (!Number.isFinite(value) || value < 0) { coverage.add(`${label}: invalid boundaries`); return null; }
    return value;
  };
  const elapsedMs = difference(input.endedAt, 'wall duration');
  const toMilestoneMs = input.milestone === null ? null : difference(input.milestoneAt, 'milestone duration');
  if (input.milestone === null) coverage.add('no explicit milestone recorded');
  if (elapsedMs !== null && toMilestoneMs !== null && toMilestoneMs > elapsedMs) coverage.add('milestone lies outside invocation boundaries');
  const details = input.exploration === undefined ? null : explorationDetails(input.exploration);
  const exploration = details?.metrics ?? null;
  const completeToolDuration = details !== null && details.observations.every(observation => observedElapsedMs(observation) !== null) && !exploration!.coverage.some(reason => reason.includes('conflicting observations'));
  if (details !== null && !completeToolDuration) coverage.add(`tool duration: known subtotal ${exploration!.toolElapsedMs} ms; total unknown`);
  for (const reason of exploration?.coverage ?? []) coverage.add(reason);
  const duration = (value: number | null | undefined, name: string) => {
    if (!valid(value ?? null)) { coverage.add(`${name}: duration unknown`); return null; }
    return value!;
  };
  if (exploration === null) coverage.add('tool duration: observations unavailable');
  return { startedAt: input.startedAt, endedAt: input.endedAt, milestone: input.milestone, milestoneAt: input.milestoneAt,
    elapsedMs, toMilestoneMs: elapsedMs !== null && toMilestoneMs !== null && toMilestoneMs > elapsedMs ? null : toMilestoneMs,
    modelElapsedMs: duration(input.modelElapsedMs, 'model'), toolElapsedMs: completeToolDuration ? exploration!.toolElapsedMs : null,
    checkElapsedMs: duration(input.checkElapsedMs, 'check'), coverage: [...coverage] };
}
