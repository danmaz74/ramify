import { createHash } from 'node:crypto';

/** One model-visible input, identified by the exact bytes actually supplied. */
export interface DeliveredInput {
  readonly key: string;
  readonly kind: 'role-instructions' | 'procedure' | 'brief' | 'environment' | 'task' | 'tool-declaration' | 'skill';
  readonly text: string;
  readonly source: string | null;
  readonly revision: string | null;
  /** Source files actually incorporated into this input, including embedded instructions. */
  readonly sources?: readonly { readonly path: string; readonly hash: string; readonly bytes: number }[];
  /** Logical effect, independent of this input's physical delivery identity. */
  readonly block?: { readonly key: string; readonly effect: 'set' | 'remove' };
}

export interface DeliveredManifestEntry {
  readonly key: string;
  readonly kind: DeliveredInput['kind'];
  readonly source: string | null;
  readonly revision: string | null;
  readonly hash: string;
  readonly bytes: number;
  readonly delivery: 'inherited' | 'appended';
  readonly sources: readonly { readonly path: string; readonly hash: string; readonly bytes: number }[];
  readonly block?: DeliveredInput['block'];
}

export interface DeliveredManifest {
  readonly schema: 'ramify-agent.delivered-inputs/1' | 'ramify-agent.delivered-inputs/2';
  readonly inheritedPoint: string | null;
  readonly entries: readonly DeliveredManifestEntry[];
  readonly currentMessage: { readonly hash: string; readonly bytes: number } | null;
  readonly hash: string;
}

export function exactInputHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Caller supplies the actual prefix at its named point, never all available packages. */
export function buildDeliveredManifest(input: {
  readonly inheritedPoint: string | null;
  readonly inherited: readonly DeliveredInput[];
  readonly appended: readonly DeliveredInput[];
  readonly currentMessage?: string;
  /** Explicit adoption by a writer; existing callers retain the legacy wire form. */
  readonly schema?: DeliveredManifest['schema'];
}): DeliveredManifest {
  if (input.inherited.length > 0 && !input.inheritedPoint) throw new Error('Inherited delivery requires its exact session point');
  const schema = input.schema ?? 'ramify-agent.delivered-inputs/1';
  if (schema === 'ramify-agent.delivered-inputs/1' && [...input.inherited, ...input.appended].some(item => item.block)) throw new Error('Block metadata requires delivered-inputs/2');
  const entries = (['inherited', 'appended'] as const).flatMap(delivery => input[delivery].map(item => ({
    key: item.key, kind: item.kind, source: item.source, revision: item.revision,
    hash: exactInputHash(item.text), bytes: Buffer.byteLength(item.text), delivery, sources: item.sources ?? [],
    ...(item.block ? { block: item.block } : {}),
  })));
  const currentMessage = input.currentMessage === undefined ? null : { hash: exactInputHash(input.currentMessage), bytes: Buffer.byteLength(input.currentMessage) };
  return { schema, inheritedPoint: input.inheritedPoint, entries, currentMessage,
    hash: exactInputHash(JSON.stringify({ inheritedPoint: input.inheritedPoint, entries, currentMessage })) };
}
