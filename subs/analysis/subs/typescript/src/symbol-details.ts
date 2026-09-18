import { relative, resolve } from 'node:path';
import { SignatureKind, SymbolFlags, type Project, type Symbol as CompilerSymbol } from 'typescript/unstable/sync';
import { ModifierFlags, SyntaxKind, isExportAssignment, isIdentifier, isStringLiteral, isModuleDeclaration, type Node } from 'typescript/unstable/ast';
import { originalKey } from '../../model/src/identity.js';
import type { OriginalId, SourceArea } from '../../model/src/interfaces/model.js';
import type { ProjectInventory } from '../../project/src/interfaces/project.js';
import type { SymbolDetail, SymbolDetailLimits, SymbolDetailRequest } from './interfaces/source.js';
import { SourceFailure, encode, freezeData } from './wire.js';

/** The inventory and source areas a defining-file export is resolved against. */
export interface DeclarationInputs { readonly inventory: ProjectInventory; readonly areas: readonly SourceArea[] }

const order = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
const decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Back off one byte at a time until the slice decodes cleanly, so a truncated
 * signature, documentation string or test title never splits a multi-byte code
 * point or emits a replacement character. No byte-safe UTF-8 truncation helper
 * existed anywhere in `subs/` before this file (confirmed by the iteration 1 probe).
 */
export function truncateUtf8(text: string, maxBytes: number): { readonly text: string; readonly truncated: boolean } {
  const full = Buffer.from(text, 'utf8');
  if (full.length <= maxBytes) return { text, truncated: false };
  for (let end = maxBytes; end >= 0; end--) {
    try { return { text: decoder.decode(full.subarray(0, end)), truncated: true }; }
    catch { /* Mid-code-point; try one byte shorter. */ }
  }
  return { text: '', truncated: true };
}

/** The first paragraph before a blank line, with internal whitespace normalized
 * to single spaces. `undefined` for empty or whitespace-only documentation, so
 * a missing comment is an ordinary omission, never an empty placeholder. */
function firstParagraph(documentation: string): string | undefined {
  const trimmed = documentation.trim();
  if (!trimmed) return undefined;
  const [first] = trimmed.split(/\r?\n\s*\r?\n/);
  return first!.replace(/\s+/g, ' ').trim();
}

/** The same declaration-name/namespace-prefix computation the catalog uses to
 * bind an original identity, duplicated here (not imported) because it is
 * private to the catalog's builder. Keep both in step if either changes. */
function binding(node: Node, symbol: CompilerSymbol): string {
  const parts: string[] = [];
  if (isExportAssignment(node)) parts.push('#default');
  else if ('name' in node && node.name && (isIdentifier(node.name as Node) || isStringLiteral(node.name as Node))) {
    parts.push((node.name as { readonly text: string }).text);
  } else parts.push(symbol.name === 'default' ? '#default' : symbol.name);
  for (let parent = node.parent; parent.kind !== SyntaxKind.SourceFile; parent = parent.parent) {
    if (isModuleDeclaration(parent)) parts.unshift(parent.name.text);
  }
  return parts.join('/');
}

/** A member's own first declaration, and the modifier/optionality facts read
 * directly off it: `modifierFlags` (a plain bitmask field on every modifiable
 * node, not a method) and whether its name carries a `?` postfix token. */
function memberFacts(project: Project, symbol: CompilerSymbol): { readonly flags: number; readonly optional: boolean } {
  const declaration = symbol.declarations[0]?.resolve(project);
  const flags = declaration ? (declaration as unknown as { readonly modifierFlags?: number }).modifierFlags ?? 0 : 0;
  const postfixKind = declaration
    ? (declaration as unknown as { readonly postfixToken?: { readonly kind: number } }).postfixToken?.kind : undefined;
  return { flags, optional: postfixKind === SyntaxKind.QuestionToken };
}

function isPrivateMember(project: Project, symbol: CompilerSymbol): boolean {
  // An ECMAScript `#name` private field's symbol name is not simply
  // `#`-prefixed: the checker mangles it to a per-class-unique form such as
  // `__#1@#name`, so a substring test (not `startsWith`) is required.
  if (symbol.name.includes('#')) return true;
  return (memberFacts(project, symbol).flags & ModifierFlags.Private) !== 0;
}

/** Render one static or instance member as a body-free line: a method (or
 * overloaded method) as one `name(params): Return;` per signature, a data
 * property or accessor as `name: Type;`. Modifier keywords are emitted in
 * `protected static abstract readonly` order, matching conventional
 * declaration style; `static` is supplied by the caller (which collection a
 * member came from) rather than re-read off the declaration.
 *
 * An accessor pair is rendered as a property, never as `get`/`set` syntax:
 * a getter with no matching setter renders `readonly name: Type;`, since
 * nothing can write it; a getter with a setter (or a setter alone) renders
 * `name: Type;`, since the member is writable. This mirrors the writability
 * a consumer actually observes and needs no second, accessor-only shape. */
function renderMember(project: Project, member: CompilerSymbol, isStatic: boolean): string {
  const { checker, emitter } = project;
  const { flags, optional } = memberFacts(project, member);
  const prefix: string[] = [];
  if (flags & ModifierFlags.Protected) prefix.push('protected');
  if (isStatic) prefix.push('static');
  if (flags & ModifierFlags.Abstract) prefix.push('abstract');

  const type = checker.getTypeOfSymbol(member);
  const isAccessor = (member.flags & (SymbolFlags.GetAccessor | SymbolFlags.SetAccessor)) !== 0;
  const callSignatures = !isAccessor && type ? checker.getSignaturesOfType(type, SignatureKind.Call) : [];
  if (callSignatures.length) {
    return callSignatures.map(signature => {
      const node = checker.signatureToSignatureDeclaration(signature, SyntaxKind.MethodSignature, undefined, undefined);
      const printed = node ? emitter.printNode(node) : '(): unknown;';
      return [...prefix, `${member.name}${printed}`].join(' ');
    }).join(' ');
  }
  const readonly = (flags & ModifierFlags.Readonly) !== 0
    || (isAccessor && (member.flags & SymbolFlags.SetAccessor) === 0);
  if (readonly) prefix.push('readonly');
  // Without `exactOptionalPropertyTypes`, `getTypeOfSymbol` on an optional
  // property includes a synthetic `| undefined` the `?` postfix already
  // conveys (present even when the property carries its own annotation).
  // Printing the property's own type-annotation node instead avoids
  // reproducing that redundant union member; only an optional property with
  // no explicit annotation falls back to the checker's (undefined-including)
  // inferred type.
  const annotation = !isAccessor
    ? (member.declarations[0]?.resolve(project) as unknown as { readonly type?: Node } | undefined)?.type : undefined;
  const typeNode = annotation ?? (type ? checker.typeToTypeNode(type, undefined, 0) : undefined);
  const typeText = typeNode ? emitter.printNode(typeNode, { preserveSourceNewlines: false }).trim() : 'unknown';
  const name = `${member.name}${optional ? '?' : ''}`;
  return [...prefix, `${name}: ${typeText};`].join(' ');
}

/** The class header up to (not including) the member body: an optional
 * `abstract` keyword, `class <exportName>`, the declaration's own type
 * parameters, and its `extends`/`implements` heritage clauses. Type
 * parameters and heritage clauses are printed directly from the real
 * declaration node (`preserveSourceNewlines: false` for determinism): both
 * are body-free by construction, so no checker-side reconstruction is
 * needed, and the printed text matches the declaration exactly. */
function renderClassHeader(project: Project, primary: Node, exportName: string): string {
  const { emitter } = project;
  const node = primary as unknown as {
    readonly modifierFlags?: number;
    readonly typeParameters?: readonly Node[];
    readonly heritageClauses?: readonly Node[];
  };
  const abstractPrefix = ((node.modifierFlags ?? 0) & ModifierFlags.Abstract) ? 'abstract ' : '';
  const typeParameters = node.typeParameters?.length
    ? `<${node.typeParameters.map(tp => emitter.printNode(tp, { preserveSourceNewlines: false }).trim()).join(', ')}>` : '';
  const heritage = node.heritageClauses?.length
    ? ` ${node.heritageClauses.map(clause => emitter.printNode(clause, { preserveSourceNewlines: false }).trim()).join(' ')}` : '';
  return `${abstractPrefix}class ${exportName}${typeParameters}${heritage}`;
}

/**
 * Extract just the `(params)` text from a printed construct signature such
 * as `new (owner: string): Shape<T>;` or, for a generic class, `new <T
 * extends Base = Base>(owner: string): Shape<T>;` — the class's own type
 * parameters are repeated on every construct signature the checker
 * synthesizes, but they already appear once on the class header
 * (`renderClassHeader`), so they are stripped here rather than repeated on
 * the constructor line. Falls back to `()` when the printed text does not
 * have the expected shape. Bracket-depth counting (not a regex) skips past
 * the optional `<...>` clause so a nested generic constraint such as `<T
 * extends Base<X>>` is not truncated at its first `>`.
 */
function constructorParameterList(printed: string): string {
  const withoutNew = printed.replace(/^(?:abstract )?new /, '');
  let afterGenerics = withoutNew;
  if (withoutNew.startsWith('<')) {
    let depth = 0;
    for (let i = 0; i < withoutNew.length; i++) {
      if (withoutNew[i] === '<') depth++;
      else if (withoutNew[i] === '>' && --depth === 0) { afterGenerics = withoutNew.slice(i + 1); break; }
    }
  }
  const match = /^(\(.*\)): .+;$/.exec(afterGenerics);
  return match ? match[1]! : '()';
}

/**
 * Render a body-free `class Name { ... }` declaration from the checker's own
 * facts, since printing the real `ClassDeclaration` node includes every
 * method and constructor body (the iteration 1 probe's confirmed gap):
 *
 * - The header (`renderClassHeader`) carries `abstract`, the declaration's
 *   own type parameters, and its `extends`/`implements` heritage clauses,
 *   printed verbatim from the declaration node.
 * - Constructor overloads come from the static side's construct signatures
 *   (`getSignaturesOfType(Construct)`), rendered via `signatureToSignatureDeclaration`
 *   with `ConstructSignature` (which prints as `new (params): ReturnType;`)
 *   and reshaped into `constructor(params);` by dropping the `new ` prefix
 *   and the return-type annotation, which a constructor never spells.
 * - Static members come next, from `getPropertiesOfType` on the class
 *   symbol's own type (the static side; also where construct signatures
 *   come from), excluding the implicit `prototype` property.
 * - Instance members come from `getPropertiesOfType(getDeclaredTypeOfSymbol(...))`,
 *   which already flattens inherited members.
 * - In both member groups, a member is omitted when its name starts with `#`
 *   (an ECMAScript private field) or its first declaration carries the
 *   `private` modifier; a `protected` member is kept and tagged. Kept
 *   members are ordered by name in byte order within their group, statics
 *   before instance members, for determinism. See `renderMember` for the
 *   per-member shape (methods with overloads, properties, accessors,
 *   `readonly`/`?`/`static`/`protected`/`abstract`).
 */
function renderClass(project: Project, primary: Node, target: CompilerSymbol, exportName: string): string {
  const { checker, emitter } = project;
  const memberLines: string[] = [];
  const staticType = checker.getTypeOfSymbol(target);
  const constructSignatures = staticType ? checker.getSignaturesOfType(staticType, SignatureKind.Construct) : [];
  for (const signature of constructSignatures) {
    const node = checker.signatureToSignatureDeclaration(signature, SyntaxKind.ConstructSignature, undefined, undefined);
    const printed = node ? emitter.printNode(node) : null;
    memberLines.push(printed ? `constructor${constructorParameterList(printed)};` : 'constructor();');
  }
  const staticMembers = staticType
    ? [...checker.getPropertiesOfType(staticType)]
      .filter(symbol => symbol.name !== 'prototype' && !isPrivateMember(project, symbol))
      .sort((a, b) => order(a.name, b.name))
    : [];
  for (const member of staticMembers) memberLines.push(renderMember(project, member, true));
  const instanceType = checker.getDeclaredTypeOfSymbol(target);
  const members = [...checker.getPropertiesOfType(instanceType)]
    .filter(symbol => !isPrivateMember(project, symbol))
    .sort((a, b) => order(a.name, b.name));
  for (const member of members) memberLines.push(renderMember(project, member, false));
  const body = memberLines.length ? ` ${memberLines.join(' ')} ` : '';
  return `${renderClassHeader(project, primary, exportName)} {${body}}`;
}

/** `const name: Type`, reconstructed from the checker's type rather than the
 * real `VariableDeclaration`, which would carry the initializer. Always
 * rendered with `const` regardless of the source's own `let`/`var`/`const`
 * keyword: an import consumer never observes that keyword.
 *
 * Verified against real `.d.ts` emission (coordinator follow-up, iteration 4):
 * `checker.getTypeOfSymbol` already matches it without adjustment.
 * `export const value = 1;` renders `const value: 1` because a `const`
 * binding's own narrow literal type *is* what `.d.ts` emission keeps for
 * `const` — it only widens `let`/`var`. An unannotated `let`/`var` with a
 * literal initializer is not a further case to handle here: the checker
 * itself already returns the widened base type for a mutable binding (a
 * `let`/`var` is fresh-literal-widened during ordinary type inference, since
 * a later assignment could change the value), so `getTypeOfSymbol` returns
 * `string` for `export let value = 'x';` with no extra widening call needed.
 * An explicitly annotated or `as const` export is unaffected either way. */
function renderVariable(project: Project, target: CompilerSymbol, exportName: string): string {
  const { checker, emitter } = project;
  const type = checker.getTypeOfSymbol(target);
  const typeNode = type ? checker.typeToTypeNode(type, undefined, 0) : undefined;
  return `const ${exportName}: ${typeNode ? emitter.printNode(typeNode) : 'unknown'}`;
}

/** A function's overloads, in declaration order, excluding the implementation
 * signature (`getSignaturesOfType` already excludes it). Each overload is a
 * synthetic, body-free call-signature node rendered as `(params): Return;`
 * and prefixed with `function <exportName>`. */
function renderFunction(project: Project, target: CompilerSymbol, exportName: string, overloadLimit: number):
  { readonly text: string; readonly overloadsAvailable: number; readonly overloadsRetained: number } {
  const { checker, emitter } = project;
  const type = checker.getTypeOfSymbol(target);
  const signatures = type ? checker.getSignaturesOfType(type, SignatureKind.Call) : [];
  const overloadsAvailable = Math.max(signatures.length, 1);
  const retained = signatures.slice(0, Math.max(1, overloadLimit));
  const lines = retained.map(signature => {
    const node = checker.signatureToSignatureDeclaration(signature, SyntaxKind.CallSignature, undefined, undefined);
    return `function ${exportName}${node ? emitter.printNode(node) : '(): unknown;'}`;
  });
  return { text: lines.length ? lines.join('\n') : `function ${exportName}(): unknown;`,
    overloadsAvailable, overloadsRetained: Math.max(retained.length, 1) };
}

/** A direct print of an interface, type-alias or enum declaration: none of
 * these three kinds carries an implementation body in TypeScript syntax, so
 * the real node is already body-free. Only the leading `export`/`export
 * default` keywords are stripped; when the declaration's own identifier
 * differs from the catalog's defining-file export name (possible only for a
 * default export), the first occurrence of that identifier is replaced with
 * the export name. */
function renderDirect(project: Project, node: Node, exportName: string): string {
  const printed = project.emitter.printNode(node, { preserveSourceNewlines: false });
  const stripped = printed.replace(/^export\s+default\s+/, '').replace(/^export\s+/, '');
  const declaredName = 'name' in node && node.name && 'text' in (node.name as { text?: unknown })
    ? (node.name as { readonly text: string }).text : undefined;
  return declaredName && declaredName !== exportName ? stripped.replace(declaredName, exportName) : stripped;
}

/** The lookups `resolveDeclaration` needs, built once per call from its inputs. */
export interface DeclarationContext {
  readonly root: string;
  /** Each owner's ordinary source root, project-relative. */
  readonly ordinaryRoots: ReadonlyMap<string, string>;
  readonly pathOwners: ReadonlyMap<string, { readonly owner: string; readonly kind: 'source' | 'resource' }>;
}

export function declarationContext(inputs: DeclarationInputs): DeclarationContext {
  const ordinaryRoots = new Map<string, string>();
  for (const area of inputs.areas) if (area.kind === 'ordinary') ordinaryRoots.set(area.owner, area.root);
  return { root: inputs.inventory.scope.root, ordinaryRoots,
    pathOwners: new Map(inputs.inventory.files.map(file => [file.path, { owner: file.owner, kind: file.kind }])) };
}

/** A requested code original's compiler symbol and primary declaration, or why the compiler gave none. */
export type ResolvedDeclaration =
  | { readonly status: 'resolved'; readonly target: CompilerSymbol; readonly primary: Node }
  | { readonly status: 'unavailable';
      readonly reason: 'missing-file' | 'missing-export' | 'identity-mismatch' | 'compiler-failure' };

/**
 * Resolve a code original's defining-file export to its compiler symbol and
 * primary declaration: the first declaration in byte order of file, then by
 * position. The primary must bind the same canonical original the catalog
 * computes, so a Ramify alias or an in-file forwarding re-export cannot
 * substitute a different declaration.
 */
export function resolveDeclaration(project: Project, context: DeclarationContext, request: SymbolDetailRequest): ResolvedDeclaration {
  const { checker } = project;
  const { root, ordinaryRoots, pathOwners } = context;
  const { original, exportName } = request;
  const unavailable = (reason: Extract<ResolvedDeclaration, { readonly status: 'unavailable' }>['reason']): ResolvedDeclaration =>
    ({ status: 'unavailable', reason });
  const ordinaryRoot = ordinaryRoots.get(original.owner);
  if (!ordinaryRoot) return unavailable('missing-file');
  const definingFile = resolve(root, ordinaryRoot, original.file);
  const sourceFile = project.program.getSourceFile(definingFile);
  if (!sourceFile) return unavailable('missing-file');
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return unavailable('missing-export');
  const exported = checker.getExportsOfModule(moduleSymbol).find(symbol => symbol.name === exportName);
  if (!exported) return unavailable('missing-export');
  const target = exported.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
  if (checker.isUnknownSymbol(target)) return unavailable('compiler-failure');
  const declarations = target.declarations.flatMap(handle => { const node = handle.resolve(project); return node ? [node] : []; });
  if (!declarations.length) return unavailable('compiler-failure');
  const sortedDeclarations = [...declarations].sort((a, b) =>
    order(relative(root, a.getSourceFile().fileName), relative(root, b.getSourceFile().fileName)) || a.getStart() - b.getStart());
  const primary = sortedDeclarations[0]!;

  const primaryPath = resolve(primary.getSourceFile().fileName);
  const owner = pathOwners.get(relative(root, primaryPath));
  if (!owner || owner.kind !== 'source') return unavailable('identity-mismatch');
  const primaryOrdinaryRoot = ordinaryRoots.get(owner.owner);
  if (!primaryOrdinaryRoot) return unavailable('identity-mismatch');
  const candidate: OriginalId = { kind: 'code', owner: owner.owner,
    file: relative(resolve(root, primaryOrdinaryRoot), primaryPath), binding: binding(primary, target) };
  if (originalKey(candidate) !== originalKey(original)) return unavailable('identity-mismatch');
  return { status: 'resolved', target, primary };
}

function describeOne(project: Project, context: DeclarationContext, limits: SymbolDetailLimits, request: SymbolDetailRequest): SymbolDetail {
  const { checker } = project;
  const { original, exportName } = request;
  const unavailable = (reason: Extract<SymbolDetail, { readonly state: 'unavailable' }>['reason']): SymbolDetail =>
    ({ state: 'unavailable', original, exportName, reason });

  if (original.kind !== 'code') return unavailable('unsupported-declaration');
  const resolved = resolveDeclaration(project, context, request);
  if (resolved.status === 'unavailable') return unavailable(resolved.reason);
  const { target, primary } = resolved;

  let signatureText: string;
  let overloadsAvailable = 1, overloadsRetained = 1;
  let isFunction = false;
  if (primary.kind === SyntaxKind.FunctionDeclaration) {
    isFunction = true;
    const rendered = renderFunction(project, target, exportName, limits.maxOverloads);
    signatureText = rendered.text; overloadsAvailable = rendered.overloadsAvailable; overloadsRetained = rendered.overloadsRetained;
  } else if (primary.kind === SyntaxKind.ClassDeclaration) {
    signatureText = renderClass(project, primary, target, exportName);
  } else if (primary.kind === SyntaxKind.InterfaceDeclaration || primary.kind === SyntaxKind.EnumDeclaration
    || primary.kind === SyntaxKind.TypeAliasDeclaration) {
    signatureText = renderDirect(project, primary, exportName);
  } else if (primary.kind === SyntaxKind.VariableDeclaration) {
    signatureText = renderVariable(project, target, exportName);
  } else {
    return unavailable('unsupported-declaration');
  }

  const signatureBound = truncateUtf8(signatureText, limits.maxSignatureBytes);
  const documentationFull = checker.getDocumentationCommentOfSymbol(target);
  const paragraph = firstParagraph(documentationFull);
  const documentationBound = paragraph ? truncateUtf8(paragraph, limits.maxDocumentationBytes) : undefined;
  const truncated: ('signature' | 'documentation' | 'overloads')[] = [];
  if (signatureBound.truncated) truncated.push('signature');
  if (documentationBound?.truncated) truncated.push('documentation');
  if (isFunction && overloadsRetained < overloadsAvailable) truncated.push('overloads');

  const documentation = documentationBound?.text;
  if (truncated.length) {
    return { state: 'truncated', original, exportName, signature: signatureBound.text,
      ...(documentation !== undefined ? { documentation } : {}), truncated };
  }
  return { state: 'described', original, exportName, signature: signatureBound.text,
    ...(documentation !== undefined ? { documentation } : {}) };
}

/** `originalKey` rejects a non-canonical identity; export names are nonempty control-free text. */
export function validRequest(request: SymbolDetailRequest): boolean {
  if (typeof request.exportName !== 'string' || request.exportName === ''
    || /[\u0000-\u001f\u007f]/u.test(request.exportName) || /[\uD800-\uDFFF]/u.test(request.exportName)) return false;
  try {
    originalKey(request.original);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve each requested defining-file export to its compiler declaration and
 * render a bounded, body-free signature and first-documentation-paragraph.
 * Pure and synchronous over an already-open `Project`; accepts no filesystem
 * and retains no compiler state of its own. One result per unique
 * `(original, exportName)` request, in first-occurrence order. A structurally
 * invalid request or a total encoded result above `limits.maxResultBytes`
 * throws `SourceFailure`; an isolated valid-request failure is instead one
 * `unavailable` entry with a stable `reason`, never a thrown error.
 */
export function describeSymbolDetails(project: Project, inputs: DeclarationInputs, requests: readonly SymbolDetailRequest[],
  limits: SymbolDetailLimits, signal?: AbortSignal): readonly SymbolDetail[] {
  if (signal?.aborted) throw new SourceFailure('cancelled', 'Symbol details were cancelled before execution');
  if (![limits.maxSignatureBytes, limits.maxDocumentationBytes, limits.maxOverloads, limits.maxResultBytes]
    .every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new SourceFailure('resource-limit', 'Symbol detail limits must be positive safe integers');
  }
  for (const request of requests) {
    if (!validRequest(request)) throw new SourceFailure('protocol-error', 'Invalid symbol detail request');
  }

  const context = declarationContext(inputs);
  const results = new Map<string, SymbolDetail>();
  const keys: string[] = [];
  let processed = 0;
  for (const request of requests) {
    const key = `${originalKey(request.original)}\u0000${request.exportName}`;
    if (results.has(key)) continue;
    if (++processed % 25 === 0 && signal?.aborted) throw new SourceFailure('cancelled', 'Symbol details were cancelled');
    keys.push(key);
    results.set(key, describeOne(project, context, limits, request));
  }
  if (signal?.aborted) throw new SourceFailure('cancelled', 'Symbol details were cancelled');

  const output = keys.map(key => results.get(key)!);
  encode(output, limits.maxResultBytes);
  return freezeData(output);
}
