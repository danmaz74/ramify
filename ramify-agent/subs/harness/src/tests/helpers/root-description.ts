/** A test project's root description. Unmarked roots are explicit negative controls. */
export function rootDescription(name: string, rest = '', spelling: 'module' | 'root module' = 'root module'): string {
  return `ramify 1\n${spelling} ${name}\n${rest}`;
}
