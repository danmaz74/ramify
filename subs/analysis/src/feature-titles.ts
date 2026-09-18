import type { TestTitleLimits } from '../subs/typescript/src/interfaces/source.js';

/** A Gherkin file's feature title and its scenario titles in source order. */
export interface FeatureTitles { readonly feature: string | null; readonly scenarios: readonly string[] }

const featureKeyword = 'Feature:';
/** English scenario keywords; `Examples:` and `Scenarios:` name example tables, not scenarios. */
const scenarioKeywords = ['Scenario Outline:', 'Scenario Template:', 'Scenario:', 'Example:'];

/** Cut `text` to at most `maxBytes` UTF-8 bytes on a code point boundary, with a trailing `…`. */
function cutTitle(text: string, maxBytes: number): { readonly text: string; readonly cut: boolean } {
  if (Buffer.byteLength(text) <= maxBytes) return { text, cut: false };
  let bytes = 0, end = 0;
  for (const character of text) {
    const size = Buffer.byteLength(character);
    if (bytes + size > maxBytes) break;
    bytes += size; end += character.length;
  }
  return { text: `${text.slice(0, end)}…`, cut: true };
}

/**
 * Read a `.feature` file's titles as plain text, running nothing. A line whose
 * first non-blank text is `Feature:` gives the feature title, the first one
 * only; `Scenario:`, `Example:`, `Scenario Outline:` and `Scenario Template:`
 * give scenario titles. Keywords are English only. Titles are trimmed; one
 * longer than `maxTitleBytes` is cut on a character boundary with a trailing
 * `…` and counted in `cut`. Lines inside a `"""` or ```` ``` ```` doc string
 * are text, not keywords.
 */
export function readFeatureTitles(text: string, limits: TestTitleLimits): FeatureTitles & { readonly cut: number } {
  if (![limits.maxTitleBytes, limits.maxTitlesPerRecord, limits.maxResultBytes].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new RangeError('Test title limits must be positive safe integers');
  }
  let feature: string | null = null, cut = 0, docString: string | null = null;
  const scenarios: string[] = [];
  const bounded = (title: string): string => {
    const result = cutTitle(title.trim(), limits.maxTitleBytes);
    if (result.cut) cut++;
    return result.text;
  };
  for (const line of text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)) {
    const content = line.trimStart();
    const fence = content.startsWith('"""') ? '"""' : content.startsWith('```') ? '```' : null;
    if (fence && (docString === null || docString === fence)) { docString = docString === null ? fence : null; continue; }
    if (docString !== null) continue;
    if (content.startsWith(featureKeyword)) {
      if (feature === null) feature = bounded(content.slice(featureKeyword.length));
      continue;
    }
    const keyword = scenarioKeywords.find(candidate => content.startsWith(candidate));
    if (keyword) scenarios.push(bounded(content.slice(keyword.length)));
  }
  return { feature, scenarios, cut };
}
