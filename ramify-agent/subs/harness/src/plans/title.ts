const fence = /^ {0,3}(`{3,}|~{3,})/;
const atxHeading = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;

/**
 * The text of the first ATX heading (`#` to `######`) outside fenced code
 * blocks, with inline Markdown left as written. `undefined` when there is
 * none, or when it is empty.
 */
export function planTitle(markdown: string): string | undefined {
  let open: string | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = fence.exec(line)?.[1];
    if (open) {
      if (marker && marker[0] === open[0] && marker.length >= open.length && line.trim() === marker) open = undefined;
      continue;
    }
    if (marker) { open = marker; continue; }
    const heading = atxHeading.exec(line);
    if (heading) {
      const text = heading[1]?.trim();
      return text ? text : undefined;
    }
  }
  return undefined;
}
