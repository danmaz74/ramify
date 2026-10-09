import { exactInputHash, type DeliveredInput } from './delivered-manifest.js';

export interface InstructionBlock {
  readonly key: string;
  readonly body: string;
  readonly kind: DeliveredInput['kind'];
  readonly source: string | null;
  readonly revision: string | null;
  readonly sources?: DeliveredInput['sources'];
}

function requireKey(key: string): void {
  if (!key.trim() || /[\r\n]/u.test(key)) throw new Error('A block requires a nonempty single-line key');
}

/** These exact bytes define set equality and selected-procedure identity. */
export function renderBlockSet(key: string, body: string): string {
  requireKey(key);
  return `# Block ${key}\nCurrent value; replaces any earlier value for this key.\n${body}`;
}

export function renderBlockRemoval(key: string): string {
  requireKey(key);
  return `# Block ${key}\nWithdrawn; this block no longer applies.\n`;
}

/** Provenance remains the input that was actually delivered at the selected point. */
export function effectiveBlocks(history: readonly DeliveredInput[]): ReadonlyMap<string, DeliveredInput> {
  const effective = new Map<string, DeliveredInput>();
  for (const input of history) {
    if (!input.block) continue;
    requireKey(input.block.key);
    if (input.block.effect === 'remove') effective.delete(input.block.key);
    else effective.set(input.block.key, input);
  }
  return effective;
}

/** Missing desired keys do not imply withdrawal; callers declare removals explicitly. */
export function resolveBlockAdditions(input: {
  readonly inherited: readonly DeliveredInput[];
  readonly desired: readonly InstructionBlock[];
  readonly withdraw?: readonly string[];
}): readonly DeliveredInput[] {
  const desired = new Set<string>();
  for (const block of input.desired) {
    requireKey(block.key);
    if (desired.has(block.key)) throw new Error(`Duplicate desired block ${block.key}`);
    desired.add(block.key);
  }
  const removals = new Set(input.withdraw ?? []);
  for (const key of removals) {
    requireKey(key);
    if (desired.has(key)) throw new Error(`Block ${key} cannot be both set and withdrawn`);
  }
  const effective = effectiveBlocks(input.inherited);
  return [
    ...input.desired.flatMap(block => {
      const text = renderBlockSet(block.key, block.body);
      const prior = effective.get(block.key);
      if (prior && exactInputHash(prior.text) === exactInputHash(text)) return [];
      return [{ key: block.key, kind: block.kind, text, source: block.source, revision: block.revision,
        ...(block.sources ? { sources: block.sources } : {}), block: { key: block.key, effect: 'set' as const } }];
    }),
    ...[...removals].flatMap(key => {
      const prior = effective.get(key);
      return prior ? [{ key, kind: prior.kind, text: renderBlockRemoval(key), source: null, revision: null,
        block: { key, effect: 'remove' as const } }] : [];
    }),
  ];
}
