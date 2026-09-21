import { createHash } from 'node:crypto';
import { listCompanionViolations, originalKey } from '../subs/model/src/index.js';
import type { CompanionViolation, Model, Original, SourceLocation } from '../subs/model/src/interfaces/model.js';
import type { SourceLimit } from '../subs/typescript/src/interfaces/source.js';
import type { AnalysisDiagnostic } from './interfaces/analysis.js';
import { byteOrder } from './report.js';

/** The decide stage's signature-companion outputs over one model. */
export interface CompanionOutputs {
  /** One `exposed-without-companion` finding per violation, in the rule's order. */
  readonly diagnostics: readonly AnalysisDiagnostic[];
  /** `signature-inferred` and `signature-unresolved` notes of exposed originals, in located order. */
  readonly coverage: readonly SourceLimit[];
}

export const noCompanionOutputs: CompanionOutputs = Object.freeze({ diagnostics: Object.freeze([]), coverage: Object.freeze([]) });

const at = (location: SourceLocation): string => `${location.file}:${location.line}:${location.column}`;
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const tagList = (tags: readonly string[]): string => `[${tags.join(', ')}]`;

function message(violation: CompanionViolation, naming: SourceLocation | undefined): string {
  const symbol = `\`${violation.original.binding}\``, companion = `\`${violation.companion.binding}\``;
  const where = naming ? ` (${at(naming)})` : '';
  if (violation.reason === 'not-visible') {
    return `${symbol} is exposed to ${violation.destination} without ${companion}, which its signature names${where}. `
      + `Expose ${companion} to ${violation.destination}, or remove it from the signature.`;
  }
  const tags = tagList(violation.tags);
  return `${symbol} is exposed without the required-importer tags ${tags} of ${companion}, which its signature names${where}. `
    + `Tag the exposure of ${symbol} ${tags}, or remove ${companion} from the signature.`;
}

/** Whether some effective exposure of the original makes it visible in another module. */
function exposedOriginals(model: Model): Set<string> {
  const roots = new Set(model.modules.filter(module => module.parent === null).map(module => module.id));
  const exposed = new Set<string>();
  for (const exposure of model.exposures) {
    if (!exposure.effective) continue;
    if (exposure.destinations.includes('descendants') || (exposure.destinations.includes('parent') && !roots.has(exposure.module))) {
      exposed.add(originalKey(exposure.original));
    }
  }
  return exposed;
}

function note(code: 'signature-inferred' | 'signature-unresolved', location: SourceLocation, text: string): SourceLimit {
  const value = { code, location, message: text, related: [] as SourceLocation[] };
  return { id: `companion-limit/1:${hash(value)}`, ...value };
}

/**
 * The signature-companion findings and coverage notes of one model: a pure
 * function of the model's exposures, tags and companion facts, so a fresh
 * batch pass and a retained revision over equal models give equal outputs,
 * identities included. The findings never change an import decision. The
 * result is not frozen; retained facts freeze it with the rest.
 */
export function companionOutputs(model: Model): CompanionOutputs {
  const originals = new Map<string, Original>(model.originals.map(original => [originalKey(original.id), original]));
  const diagnostics = new Map<string, AnalysisDiagnostic>();
  for (const violation of listCompanionViolations(model)) {
    const companions = originals.get(originalKey(violation.original))?.companions;
    const index = companions?.named.findIndex(id => originalKey(id) === originalKey(violation.companion)) ?? -1;
    const naming = index >= 0 ? companions!.evidence[index] : undefined;
    const value = { category: 'exposure' as const, code: 'exposed-without-companion' as const, message: message(violation, naming),
      location: violation.statement, related: naming ? [naming] : [], importer: null, original: violation.original, accessId: null };
    const id = `companion-diagnostic/1:${hash(value)}`;
    if (!diagnostics.has(id)) diagnostics.set(id, { id, ...value });
  }
  const coverage = new Map<string, SourceLimit>();
  const exposed = exposedOriginals(model);
  for (const original of model.originals) {
    const key = originalKey(original.id);
    const declaration = original.declarations[0];
    if (!exposed.has(key) || !declaration) continue;
    const { inferred, unresolved } = original.companions;
    const name = `\`${original.id.binding}\``;
    if (inferred) {
      const item = note('signature-inferred', declaration, `${name} is exposed and its declared signature leaves a type to inference; `
        + 'the companions of an inferred type are not verified');
      coverage.set(item.id, item);
    }
    if (unresolved > 0) {
      const item = note('signature-unresolved', declaration, `${name} is exposed and ${unresolved} reference${unresolved === 1 ? '' : 's'} `
        + `in its declared signature resolve${unresolved === 1 ? 's' : ''} to no single project original; their companions are not verified`);
      coverage.set(item.id, item);
    }
  }
  const located = (a: SourceLimit, b: SourceLimit): number => byteOrder(a.location.file, b.location.file)
    || a.location.start - b.location.start || byteOrder(a.code, b.code) || byteOrder(a.id, b.id);
  return { diagnostics: [...diagnostics.values()], coverage: [...coverage.values()].sort(located) };
}
