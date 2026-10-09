import { exactInputHash, type DeliveredInput } from './delivered-manifest.js';

export interface BriefingRevision {
  /** Occurrence identity. Legacy records used their content hash here. */
  readonly revision: string;
  readonly contentHash?: string;
  /** In delivery order, with stable section keys. */
  readonly sections: readonly { readonly key: string; readonly text: string; readonly source?: string | null; readonly effect?: 'set' | 'remove' }[];
}

/** Canonical structured bodies, before model-visible block framing. */
export function briefingContentHash(sections: BriefingRevision['sections']): string {
  return exactInputHash(JSON.stringify(sections.map(section => ({ key: section.key, text: section.text, source: section.source ?? null, ...(section.effect ? { effect: section.effect } : {}) }))));
}

/** Capture this value in an immutable intent; retries use the retained occurrence. */
export function createBriefingOccurrence(input: {
  readonly previous: BriefingRevision | null;
  readonly operationId: string;
  readonly sections: BriefingRevision['sections'];
}): BriefingRevision {
  if (!input.operationId.trim()) throw new Error('Briefing occurrence requires a durable operation identity');
  const contentHash = briefingContentHash(input.sections);
  if (input.previous && briefingContentHash(input.previous.sections) === contentHash) return input.previous;
  return { revision: exactInputHash(JSON.stringify([input.previous?.revision ?? null, input.operationId, contentHash])), contentHash, sections: input.sections };
}

export type BriefingDelivery = {
  readonly kind: 'available';
  readonly mode: 'full' | 'delta' | 'post-fork';
  readonly basedOnRevision: string | null;
  readonly revision: string;
  readonly additions: readonly DeliveredInput[];
  /** Validation input only; unchanged sections are never automatically delivered again. */
  readonly currentSections: BriefingRevision['sections'];
} | { readonly kind: 'unavailable'; readonly reason: string };

/** Revisions are immutable identities. Unknown ancestry cannot be called a delta. */
export function buildBriefingDelivery(input: {
  readonly mode: 'fresh' | 'continue' | 'fork';
  readonly current: BriefingRevision;
  readonly inheritedRevision: string | null;
  readonly history: readonly BriefingRevision[];
}): BriefingDelivery {
  const revisions = new Map<string, BriefingRevision>();
  for (const brief of [...input.history, input.current]) {
    if (!brief.revision) throw new Error('Briefing revision is required');
    if (brief.contentHash !== undefined && brief.contentHash !== briefingContentHash(brief.sections)) throw new Error(`Invalid briefing content hash ${brief.revision}`);
    if (new Set(brief.sections.map(section => section.key)).size !== brief.sections.length) throw new Error(`Duplicate section in briefing ${brief.revision}`);
    const prior = revisions.get(brief.revision);
    if (prior && exactInputHash(JSON.stringify(prior)) !== exactInputHash(JSON.stringify(brief))) throw new Error(`Conflicting briefing revision ${brief.revision}`);
    revisions.set(brief.revision, brief);
  }
  const inherited = input.inheritedRevision === null ? undefined : revisions.get(input.inheritedRevision);
  if (input.mode !== 'fresh' && input.inheritedRevision !== null && !inherited) return { kind: 'unavailable', reason: `Unknown inherited briefing revision ${input.inheritedRevision}; explicit fresh recovery is required` };
  if (input.mode === 'continue' && !inherited) return { kind: 'unavailable', reason: 'Continuation requires a known inherited briefing revision' };
  // Preserve retained occurrence order, including legacy repeated content entries.
  const timeline = [...input.history];
  if (!timeline.some(brief => brief.revision === input.current.revision)) timeline.push(input.current);
  const order = timeline.map(brief => brief.revision);
  const currentIndex = order.lastIndexOf(input.current.revision);
  const inheritedIndex = inherited ? order.lastIndexOf(inherited.revision) : -1;
  if (inheritedIndex > currentIndex) return { kind: 'unavailable', reason: `Inherited revision ${input.inheritedRevision} is not an ancestor of ${input.current.revision}` };
  const old = input.mode === 'fresh' ? [] : inherited?.sections ?? [];
  if (old.some(section => !input.current.sections.some(current => current.key === section.key))) return { kind: 'unavailable', reason: 'Removed briefing sections require an explicit replacement update' };
  let previous = old;
  const updates = input.mode === 'fork' ? timeline.slice(inheritedIndex + 1, currentIndex + 1) : [input.current];
  const additions = updates.flatMap(brief => {
    const changed = brief.sections.filter(section => !previous.some(prior => prior.key === section.key && prior.text === section.text && (prior.source ?? null) === (section.source ?? null) && (prior.effect ?? 'set') === (section.effect ?? 'set')))
      .map(section => ({ key: `brief:${section.key}`, kind: 'brief' as const, text: section.text, source: section.source ?? null, revision: brief.revision, ...(section.effect ? { block: { key: `brief:${section.key}`, effect: section.effect } } : {}) }));
    previous = brief.sections;
    return changed;
  });
  return { kind: 'available', mode: input.mode === 'fresh' ? 'full' : input.mode === 'fork' ? 'post-fork' : 'delta', basedOnRevision: input.mode === 'fresh' ? null : input.inheritedRevision, revision: input.current.revision, additions, currentSections: input.current.sections };
}

/** Canonical goal/requirement sections for task packets: construct them once, then revision-diff. */
export function taskBriefingRevision(input: {
  readonly revision: string;
  readonly goal: string;
  readonly requirements: readonly string[];
  readonly sections: BriefingRevision['sections'];
}): BriefingRevision {
  if (input.sections.some(section => section.key === 'goal' || section.key === 'requirements')) throw new Error('Goal and requirements are reserved task briefing sections');
  return { revision: input.revision, sections: [
    { key: 'goal', text: `# Goal\n${input.goal}` },
    { key: 'requirements', text: `# Requirements\n${input.requirements.map(text => `- ${text}`).join('\n')}` },
    ...input.sections,
  ] };
}

/** Idempotent append identity includes the revision and exact section bytes. */
export function briefingAdditionKey(input: DeliveredInput): string {
  return `${input.key}:${input.revision}:${exactInputHash(input.text)}`;
}
