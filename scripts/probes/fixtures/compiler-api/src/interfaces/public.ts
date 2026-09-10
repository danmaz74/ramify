export interface Contract { readonly name: string }
export const ownValue = 1;
export { ownValue as ownAlias };
export default function defaultContract(): number { return ownValue; }

// A compiler export that no named Ramify selection would automatically expose.
export const unselectedExport = 2;
