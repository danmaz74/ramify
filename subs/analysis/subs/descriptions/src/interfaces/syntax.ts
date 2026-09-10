export interface TextSpan {
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly column: number;
}
export interface DescriptionToken {
  readonly kind: 'keyword' | 'name' | 'string' | 'punctuation' | 'comment';
  readonly raw: string;
  readonly decoded: string;
  readonly span: TextSpan;
}
export interface DescriptionIssue {
  readonly code: 'invalid-encoding' | 'bare-cr' | 'invalid-whitespace'
    | 'unterminated-string' | 'invalid-escape' | 'invalid-scalar'
    | 'invalid-name' | 'empty-name' | 'reserved-name' | 'missing-version'
    | 'unsupported-version' | 'missing-header' | 'duplicate-header'
    | 'invalid-order' | 'unknown-clause' | 'invalid-selection' | 'invalid-list'
    | 'invalid-destination' | 'duplicate-tag' | 'duplicate-destination'
    | 'invalid-tag-syntax' | 'unknown-statement' | 'test-profile-declaration'
    | 'missing-from' | 'missing-to' | 'trailing-token';
  readonly message: string;
  readonly file: string;
  readonly span: TextSpan;
}
export interface NamedSelection {
  readonly name: string;
  readonly alias: string;
  readonly span: TextSpan;
}
export type DescriptionSelection =
  | { readonly kind: 'named'; readonly names: readonly NamedSelection[] }
  | { readonly kind: 'wildcard'; readonly span: TextSpan };
export interface DescriptionStatement {
  readonly index: number;
  readonly kind: 'expose-src' | 'expose-test' | 'expose-sub';
  readonly span: TextSpan;
  readonly selection: DescriptionSelection;
  readonly from: { readonly value: string; readonly span: TextSpan };
  readonly tags: { readonly values: readonly string[];
    readonly span: TextSpan } | null;
  readonly destinations: readonly ('parent' | 'descendants')[];
}
export interface DescriptionDocument {
  readonly file: string;
  readonly version: 1;
  readonly module: { readonly name: string; readonly tags: readonly string[];
    readonly span: TextSpan };
  readonly tokens: readonly DescriptionToken[];
  readonly statements: readonly DescriptionStatement[];
}
export type ParsedDescription =
  | { readonly status: 'valid'; readonly document: DescriptionDocument }
  | { readonly status: 'invalid'; readonly file: string;
      readonly tokens: readonly DescriptionToken[];
      readonly issues: readonly DescriptionIssue[] };
export type DescriptionParser = (file: string, text: string) => ParsedDescription;
