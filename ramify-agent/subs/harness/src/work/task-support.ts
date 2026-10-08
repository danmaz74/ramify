import type { HarnessTaskBrief } from '../run/session-operations.js';

/** Remove separately delivered structural blocks while preserving quoted and embedded literals. */
export function taskSupportSections(prompt: string, separatelyDelivered: readonly string[]): HarnessTaskBrief['sections'] {
  const remaining = prompt.split('\n');
  for (const text of [...new Set(separatelyDelivered.map(text => text.trimEnd()))].filter(text => text.trim().length > 0).sort((a, b) => b.length - a.length)) {
    const block = text.split('\n');
    let fence: { marker: string; width: number } | undefined;
    for (let index = 0; index < remaining.length; index++) {
      const line = remaining[index]!;
      // Literal support is not a separately delivered renderer block, even
      // when its entire quoted line happens to equal a short goal.
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
      if (fence) {
        if (marker && marker[1]![0] === fence.marker && marker[1]!.length >= fence.width && marker[2]!.trim() === '') fence = undefined;
        continue;
      }
      if (block.every((part, offset) => remaining[index + offset] === part)) {
        remaining.splice(index, block.length); index -= 1; continue;
      }
      if (marker) fence = { marker: marker[1]![0]!, width: marker[1]!.length };
    }
  }
  const sections: Array<{ key: string; text: string }> = [];
  let heading = 'context'; let lines: string[] = [];
  const counts = new Map<string, number>();
  const flush = () => {
    const headingOnly = (lines[0]?.startsWith('# ') || lines[0]?.startsWith('## ')) && lines.slice(1).every(line => line.trim() === '');
    const text = lines.join('\n'); lines = [];
    if (!text.trim() || headingOnly) return;
    const count = counts.get(heading) ?? 0; counts.set(heading, count + 1);
    sections.push({ key: `support:${heading}:${count}`, text });
  };
  let groupingFence: { marker: string; width: number } | undefined;
  for (const line of remaining) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (groupingFence) {
      lines.push(line);
      if (marker && marker[1]![0] === groupingFence.marker && marker[1]!.length >= groupingFence.width && marker[2]!.trim() === '') groupingFence = undefined;
      continue;
    }
    if (marker) groupingFence = { marker: marker[1]![0]!, width: marker[1]!.length };
    // Markdown headings affect grouping only. Content is never selected by inferred meaning.
    if (line.startsWith('# ') || line.startsWith('## ')) { flush(); heading = line; }
    lines.push(line);
  }
  flush(); return sections;
}
