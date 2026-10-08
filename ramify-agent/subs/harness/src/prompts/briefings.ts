import { exactInputHash, type DeliveredInput } from './delivered-manifest.js';

export interface BriefingRevision {
  readonly revision: string;
  /** In delivery order, with stable section keys. */
  readonly sections: readonly { readonly key: string; readonly text: string; readonly source?: string | null }[];
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
    if (new Set(brief.sections.map(section => section.key)).size !== brief.sections.length) throw new Error(`Duplicate section in briefing ${brief.revision}`);
    const prior = revisions.get(brief.revision);
    if (prior && exactInputHash(JSON.stringify(prior)) !== exactInputHash(JSON.stringify(brief))) throw new Error(`Conflicting briefing revision ${brief.revision}`);
    revisions.set(brief.revision, brief);
  }
  const inherited = input.inheritedRevision === null ? undefined : revisions.get(input.inheritedRevision);
  if (input.mode !== 'fresh' && input.inheritedRevision !== null && !inherited) return { kind: 'unavailable', reason: `Unknown inherited briefing revision ${input.inheritedRevision}; explicit fresh recovery is required` };
  if (input.mode === 'continue' && !inherited) return { kind: 'unavailable', reason: 'Continuation requires a known inherited briefing revision' };
  const timeline = [...revisions.values()];
  const currentIndex = timeline.findIndex(brief => brief.revision === input.current.revision);
  const inheritedIndex = inherited ? timeline.findIndex(brief => brief.revision === inherited.revision) : -1;
  if (inheritedIndex > currentIndex) return { kind: 'unavailable', reason: `Inherited revision ${input.inheritedRevision} is not an ancestor of ${input.current.revision}` };
  const old = input.mode === 'fresh' ? [] : inherited?.sections ?? [];
  if (old.some(section => !input.current.sections.some(current => current.key === section.key))) return { kind: 'unavailable', reason: 'Removed briefing sections require an explicit replacement update' };
  let previous = old;
  const updates = input.mode === 'fork' ? timeline.slice(inheritedIndex + 1, currentIndex + 1) : [input.current];
  const additions = updates.flatMap(brief => {
    const changed = brief.sections.filter(section => !previous.some(prior => prior.key === section.key && prior.text === section.text && (prior.source ?? null) === (section.source ?? null)))
      .map(section => ({ key: `brief:${section.key}`, kind: 'brief' as const, text: section.text, source: section.source ?? null, revision: brief.revision }));
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
