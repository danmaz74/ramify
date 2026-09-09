import type { ModulePurpose } from './interfaces/project.js';

function plain(text: string): string {
  return text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1').replace(/<https?:\/\/([^>]+)>/g, 'https://$1')
    .replace(/<[^>]*>/g, '').replace(/`+([^`]+)`+/g, '$1').replace(/(\*\*|__|~~|\*|_)(.*?)\1/g, '$2')
    .replace(/\\([\\`*{}\[\]()#+.!_>-])/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}
/** Only an unindented paragraph block can supply an owner's purpose. */
export function readPurpose(readme: string, text: string | undefined): ModulePurpose {
  if (text === undefined) return { state: 'missing-file', readme };
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  let fence: string | undefined;
  let html = false;
  let excludedBlock = false;
  for (let index = 0; index < lines.length;) {
    const line = lines[index]!;
    const start = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = undefined;
      index++; continue;
    }
    if (start) { fence = start; index++; continue; }
    if (html) { if (!line.trim() || line.includes('-->')) html = false; index++; continue; }
    if (!line.trim()) { excludedBlock = false; index++; continue; }
    if (/^ {0,3}</.test(line)) { html = !line.includes('-->'); index++; continue; }
    if (/^ {0,3}#{1,6}(?:[ \t]|$)/.test(line)) { excludedBlock = false; index++; continue; }
    if (/^(?: {0,3}(?:>|[-+*]\s|\d+[.)]\s|\[[^\]]+\]:)| {4}|\t|\s*[-*_]{3,}\s*$|\s*\|)/.test(line)) {
      excludedBlock = true; index++; continue;
    }
    if (excludedBlock) { index++; continue; }
    if (index + 1 < lines.length && /^ {0,3}(?:=+|-+)\s*$/.test(lines[index + 1]!)) {
      index += 2; continue;
    }
    if (index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1]!)) {
      excludedBlock = true; index += 2; continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index]!.trim() && !/^ {0,3}(?:#{1,6}(?:[ \t]|$)|>|[-+*]\s|\d+[.)]\s|`{3,}|~{3,}|<)/.test(lines[index]!)) {
      paragraph.push(lines[index++]!);
    }
    const summary = plain(paragraph.join(' '));
    if (summary) return { state: 'present', readme, paragraph: summary };
    index++;
  }
  return { state: 'no-paragraph', readme };
}
