/** A test project's root description. Phase 3 changes the default spelling. */
export function rootDescription(name: string, rest = '', spelling: 'module' | 'root module' = 'module'): string {
  return `ramify 1\n${spelling} ${name}\n${rest}`;
}
