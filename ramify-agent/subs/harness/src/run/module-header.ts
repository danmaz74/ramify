/** The name and tags declared by a module header, with either root spelling. */
export function parseModuleHeader(text: string): { name: string; tags: string[] } | null {
  const match = /^(?:root[ \t]+)?module[ \t]+("(?:\\.|[^"\\])*"|\S+)(?:[ \t]+tagged[ \t]+\[([^\]\r\n]*)\])?/mu.exec(text);
  if (match === null) return null;
  const written = match[1]!;
  let name = written;
  if (written.startsWith('"')) {
    try {
      name = JSON.parse(written) as string;
    } catch {
      return null;
    }
  }
  return {
    name,
    tags: (match[2] ?? '').split(',').map(tag => tag.trim()).filter(Boolean),
  };
}
