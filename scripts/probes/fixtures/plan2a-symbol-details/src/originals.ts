/** Adds two values of the same kind together.
 *
 * This second paragraph, with its own    irregular   whitespace, must never
 * appear in a first-paragraph extraction.
 */
export function add(a: number, b: number): number;
export function add(a: string, b: string): string;
export function add(a: number | string, b: number | string): number | string {
  return (a as number) + (b as number);
}

/** A minimal widget with one rendering method. */
export class Widget {
  constructor(public readonly id: string) {}
  render(): string { return this.id; }
}

/** A shape that can report its own area. */
export interface Shape {
  readonly kind: string;
  area(): number;
}

/** An identifier is either numeric or textual. */
export type Id = string | number;

/** The fixed total used by every probe request. */
export const total: number = 42;

/** Primary colors used by the probe fixture. */
export enum Color { Red, Green, Blue }

/** 日本語のドキュメント文字列で、複数バイト文字が境界で分割されないことを確認するために十分な長さを持つ説明文です。これはさらに長くするための追加の文章です。 */
export const unicodeDoc: string = 'x';

// No documentation comment at all: the details entry must omit `documentation`,
// never emit a placeholder.
export const undocumented: number = 7;

/** The default export greets a name. */
export default function defaultGreeter(name: string): string { return `Hello, ${name}`; }

/** A namespace export: a declaration kind this probe does not attempt to
 * render as a signature, standing in for I2A-04:isolated-unavailable's
 * "unsupported-declaration" reason. */
export namespace Grouped { export const hidden = 1; }
