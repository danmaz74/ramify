/** Why a project-relative path is syntactically invalid; reads nothing. */
export function projectPathProblem(path: string): string | null {
  if (typeof path !== 'string' || path === '') return `Path ${JSON.stringify(String(path))} is empty`;
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return `Path ${JSON.stringify(path)} is absolute`;
  if (path.includes('\\')) return `Path ${JSON.stringify(path)} contains a backslash`;
  const segments = path === '.' ? [] : path.split('/');
  let leading = 0;
  while (leading < segments.length && segments[leading] === '..') leading++;
  for (const segment of segments.slice(leading)) {
    if (segment === '' || segment === '.' || segment === '..') return `Path ${JSON.stringify(path)} has an empty, "." or interior ".." segment`;
  }
  return null;
}
