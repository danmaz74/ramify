export interface Shape { readonly size: number }

export class RuntimeClass { readonly size = 1 }

export interface Merged { readonly size: number }
export const Merged = { size: 2 };

export const privateExport = 3;
export default function defaultValue(): number { return 4; }
