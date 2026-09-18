import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import type { Project, Symbol as CompilerSymbol } from 'typescript/unstable/sync';
import { SyntaxKind, isAsExpression, isBindingElement, isCallExpression, isDecorator, isElementAccessExpression,
  isExportAssignment, isExportDeclaration, isExportSpecifier, isHeritageClause, isIdentifier, isImportClause,
  isImportDeclaration, isImportSpecifier, isInterfaceDeclaration, isJsxOpeningElement, isJsxSelfClosingElement,
  isNewExpression, isNonNullExpression, isObjectBindingPattern, isParenthesizedExpression, isPropertyAccessExpression,
  isSatisfiesExpression, isShorthandPropertyAssignment, isTaggedTemplateExpression,
  type Identifier, type Node, type SourceFile } from 'typescript/unstable/ast';
import { originalKey } from '../../model/src/identity.js';
import type { OriginalId, SourceLocation, SourceOrigin } from '../../model/src/interfaces/model.js';
import { BehaviorShapes } from './behavior-shapes.js';
import type { BehaviorClassification, BehaviorEvidence, BehaviorLimit, DependencyBehaviorAccessFact, DependencyBehaviorFact,
  DependencyBehaviorFacts } from './interfaces/dependency-behavior.js';
import type { AccessSelection, SourceAccess, WrittenForm } from './interfaces/source.js';
import { SourceFailure, freezeData, type HelperInputs } from './wire.js';

const order = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
const evidenceOrder: readonly BehaviorEvidence[] = ['call', 'construction', 'callable-reference', 'data', 'type', 'forwarding'];
const forwardingForms: ReadonlySet<WrittenForm> = new Set(['named-export', 'type-export', 'inline-type-export',
  'star-export', 'type-star-export', 'namespace-export', 'type-namespace-export']);
const typeForms: ReadonlySet<WrittenForm> = new Set(['import-type-query', 'jsdoc-import-type']);
/** Aggregation precedence: behavioral evidence settles a unit, then any unknown constituent. */
const precedence: readonly BehaviorClassification[] = ['behavioral', 'unknown', 'non-behavioral', 'unused'];

let runs = 0;
/** Classifier runs in this process, the witness that only an explicit request classifies. */
export function behaviorRuns(): number { return runs; }

type Use = 'call' | 'construction' | 'read';
/** Mutable evidence of one original through one access: one import path. */
interface PathDraft {
  readonly evidence: Set<BehaviorEvidence>;
  readonly limitIds: Set<string>;
}
interface FactDraft {
  readonly consumer: SourceOrigin;
  readonly original: OriginalId;
  readonly paths: Map<string, PathDraft>;
}
interface Item { readonly access: SourceAccess; readonly selection: AccessSelection; readonly path: PathDraft }

/** Skip wrappers that do not change which value an expression denotes. */
function outer(node: Node): Node {
  let current = node;
  for (let parent = current.parent; parent; parent = current.parent) {
    const wraps = isParenthesizedExpression(parent) || isNonNullExpression(parent)
      || (isAsExpression(parent) || isSatisfiesExpression(parent) || parent.kind === SyntaxKind.TypeAssertionExpression)
        && (parent as Node & { readonly expression: Node }).expression === current;
    if (!wraps) break;
    current = parent;
  }
  return current;
}

function invoked(node: Node): Use | undefined {
  const parent = node.parent;
  if (!parent) return undefined;
  if (isCallExpression(parent) && parent.expression === node || isTaggedTemplateExpression(parent) && parent.tag === node
    || isDecorator(parent) && parent.expression === node
    || (isJsxOpeningElement(parent) || isJsxSelfClosingElement(parent)) && parent.tagName === node) return 'call';
  if (isNewExpression(parent) && parent.expression === node) return 'construction';
  return undefined;
}

/** A direct invocation of the reference, or of one of its first-level members. */
function useOf(node: Node): Use {
  const self = outer(node);
  const direct = invoked(self);
  if (direct) return direct;
  const parent = self.parent;
  if (parent && (isPropertyAccessExpression(parent) || isElementAccessExpression(parent)) && parent.expression === self) {
    return invoked(outer(parent)) ?? 'read';
  }
  return 'read';
}

function positionOf(node: Node): 'value' | 'type' | 'forwarding' {
  for (let parent = node.parent; parent && parent.kind !== SyntaxKind.SourceFile; parent = parent.parent) {
    if (isExportSpecifier(parent)) return 'forwarding';
    if (isExportAssignment(parent) && outer(node) === parent.expression) return 'forwarding';
    if (parent.kind >= SyntaxKind.FirstTypeNode && parent.kind <= SyntaxKind.LastTypeNode
      || parent.kind >= SyntaxKind.FirstJSDocNode && parent.kind <= SyntaxKind.LastJSDocNode) return 'type';
    if (isHeritageClause(parent)) {
      return parent.token === SyntaxKind.ImplementsKeyword || isInterfaceDeclaration(parent.parent) ? 'type' : 'value';
    }
  }
  return 'value';
}

function insideImport(node: Node): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (isImportDeclaration(parent)) return true;
    if (parent.kind === SyntaxKind.SourceFile) return false;
  }
  return false;
}

/** Nodes whose exact span is `[start, end)`, outermost first. */
function spanned(source: SourceFile, start: number, end: number): Node[] {
  const found: Node[] = [];
  const visit = (node: Node): void => {
    if (node.getStart() === start && node.end === end) found.push(node);
    node.forEachChild(child => { if (child.pos <= start && child.end >= end) visit(child); });
  };
  visit(source);
  return found;
}

/** One access fact; the limits of an access that behavioral evidence settled cannot change it. */
function accessFact(accessId: string, path: PathDraft): DependencyBehaviorAccessFact {
  const evidence = evidenceOrder.filter(kind => path.evidence.has(kind));
  const behavioral = evidence.some(kind => kind === 'call' || kind === 'construction' || kind === 'callable-reference');
  const classification: BehaviorClassification = behavioral ? 'behavioral' : path.limitIds.size ? 'unknown' : evidence.length ? 'non-behavioral' : 'unused';
  return { accessId, classification, evidence, limitIds: classification === 'unknown' ? [...path.limitIds].sort(order) : [] };
}

/** The aggregate of one (consumer file, original) over its access facts, by the fixed precedence. */
function aggregateFact(consumer: SourceOrigin, original: OriginalId, accesses: readonly DependencyBehaviorAccessFact[]): DependencyBehaviorFact {
  const classification = precedence.find(candidate => accesses.some(item => item.classification === candidate))!;
  return { consumer, original, accessIds: accesses.map(item => item.accessId), accesses, classification,
    evidence: classification === 'unknown' ? [] : evidenceOrder.filter(kind => accesses.some(item => item.evidence.includes(kind))),
    limitIds: classification === 'unknown' ? [...new Set(accesses.flatMap(item => item.limitIds))].sort(order) : [] };
}

/**
 * Classify every resolved application selection of the supplied accesses while
 * the compiler is alive. One access fact per distinct (consumer file, original,
 * access), aggregated into one fact per (consumer file, original); no compiler
 * value leaves this call. Isolated failures become limits and `unknown` facts;
 * only a work limit or cancellation propagates.
 */
export function classifyDependencyBehavior(project: Project, inputs: HelperInputs, accesses: readonly SourceAccess[]): DependencyBehaviorFacts {
  runs++;
  const root = inputs.inventory.scope.root;
  const facts = new Map<string, FactDraft>();
  const files = new Map<string, Item[]>();
  const limits = new Map<string, BehaviorLimit>();
  for (const access of accesses) {
    if (access.target.kind !== 'application') continue;
    for (const selection of access.selections) {
      if (selection.status !== 'resolved' || !selection.original) continue;
      const key = JSON.stringify([access.importer.file, originalKey(selection.original)]);
      let fact = facts.get(key);
      if (!fact) {
        fact = { consumer: access.importer, original: selection.original, paths: new Map() };
        facts.set(key, fact);
      }
      let path = fact.paths.get(access.id);
      if (!path) { path = { evidence: new Set(), limitIds: new Set() }; fact.paths.set(access.id, path); }
      const items = files.get(access.importer.file) ?? [];
      items.push({ access, selection, path }); files.set(access.importer.file, items);
    }
  }
  const limit = (code: BehaviorLimit['code'], location: SourceLocation | null, message: string): string => {
    const value = { code, location, message };
    const id = `behavior-limit/1:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
    if (!limits.has(id) && limits.size >= 100_000) throw new SourceFailure('resource-limit', 'Behavior limit record limit exceeded');
    limits.set(id, { id, ...value });
    return id;
  };
  const shapes = new BehaviorShapes(project);
  for (const [file, items] of [...files].sort(([a], [b]) => order(a, b))) {
    try {
      classifyFile(project, root, file, items, shapes, limit);
    } catch (error) {
      if (error instanceof SourceFailure && (error.code === 'resource-limit' || error.code === 'cancelled')) throw error;
      const id = limit('compiler-failure', { file, start: 0, end: 0, line: 1, column: 1 },
        `Behavior classification failed: ${error instanceof Error ? error.message : String(error)}`);
      for (const item of items) item.path.limitIds.add(id);
    }
  }
  const result: DependencyBehaviorFact[] = [...facts.values()].map(fact => aggregateFact(fact.consumer, fact.original,
    [...fact.paths].sort(([a], [b]) => order(a, b)).map(([accessId, path]) => accessFact(accessId, path))))
    .sort((a, b) => order(a.consumer.file, b.consumer.file) || order(a.original.file, b.original.file)
      || order(a.original.binding, b.original.binding) || order(a.original.kind, b.original.kind));
  // Limits of an access that behavioral evidence settled cannot change any classification.
  const named = new Set(result.flatMap(fact => fact.accesses.flatMap(item => item.limitIds)));
  return freezeData({ status: 'completed', facts: result,
    limits: [...limits.values()].filter(item => named.has(item.id)).sort((a, b) => order(a.id, b.id)) });
}

function classifyFile(project: Project, root: string, file: string, items: readonly Item[], shapes: BehaviorShapes,
  limit: (code: BehaviorLimit['code'], location: SourceLocation | null, message: string) => string): void {
  const { checker } = project;
  const source = project.program.getSourceFile(resolve(root, file));
  if (!source) {
    const id = limit('compiler-failure', { file, start: 0, end: 0, line: 1, column: 1 }, 'The configured compiler did not load the consumer file');
    for (const item of items) item.path.limitIds.add(id);
    return;
  }
  const location = (node: Node): SourceLocation => {
    const start = node.getStart(), point = source.getLineAndCharacterOfPosition(start);
    return { file: relative(root, source.fileName), start, end: node.end, line: point.line + 1, column: point.character + 1 };
  };
  const locals: { readonly identifier: Identifier; readonly path: PathDraft }[] = [];
  const values: { readonly node: Node; readonly use: Use; readonly path: PathDraft }[] = [];
  const reference = (node: Node, path: PathDraft): void => {
    const position = positionOf(node);
    if (position === 'value') values.push({ node, use: useOf(node), path });
    else path.evidence.add(position);
  };
  for (const { access, selection, path } of items) {
    if (forwardingForms.has(access.form)) { path.evidence.add('forwarding'); continue; }
    if (typeForms.has(access.form) || access.selectionForm === 'qualified-type') { path.evidence.add('type'); continue; }
    const nodes = spanned(source, selection.location.start, selection.location.end);
    const unsupported = (): void => {
      path.limitIds.add(limit('unsupported-syntax', selection.location, `No reference profile interprets the ${access.selectionForm} selection of ${selection.exportedName}`));
    };
    switch (access.selectionForm) {
      case 'named': case 'default': {
        const specifier = nodes.find(isImportSpecifier);
        const identifier = specifier?.name ?? nodes.find((node): node is Identifier => isIdentifier(node) && !!node.parent && isImportClause(node.parent));
        if (identifier) locals.push({ identifier, path }); else unsupported();
        break;
      }
      case 'destructure': case 'then-destructure': {
        const element = nodes.find(isBindingElement);
        if (element?.name && isIdentifier(element.name)) locals.push({ identifier: element.name, path });
        else {
          // A nested pattern reads the selected value without naming it.
          const pattern = element ?? nodes.find(isObjectBindingPattern);
          if (pattern) values.push({ node: pattern, use: 'read', path }); else unsupported();
        }
        break;
      }
      case 'direct-member': case 'literal-key': case 'then-member': {
        const expression = [...nodes].reverse().find(node => isPropertyAccessExpression(node) || isElementAccessExpression(node) || isIdentifier(node));
        if (expression) reference(expression, path); else unsupported();
        break;
      }
      default: unsupported();
    }
  }
  if (locals.length) {
    const symbols = checker.getSymbolAtLocation(locals.map(local => local.identifier));
    const wanted = new Map<number, PathDraft[]>();
    const declarations = new Set<Node>(locals.map(local => local.identifier));
    locals.forEach((local, index) => {
      const symbol = symbols[index];
      if (!symbol) {
        local.path.limitIds.add(limit('unresolved-symbol', location(local.identifier), `The compiler did not resolve the local binding ${local.identifier.text}`));
        return;
      }
      const list = wanted.get(symbol.id) ?? []; list.push(local.path); wanted.set(symbol.id, list);
    });
    const spellings = new Set(locals.map(local => local.identifier.text));
    const javascript = /\.[cm]?jsx?$/.test(source.fileName);
    const candidates: Identifier[] = [];
    const visited = new Set<string>();
    const visit = (node: Node): void => {
      const key = `${node.kind}:${node.pos}:${node.end}`;
      if (visited.has(key)) return;
      visited.add(key);
      // JSDoc types are compiler input only in JavaScript source.
      if (javascript) for (const doc of node.jsDoc ?? []) visit(doc);
      if (isIdentifier(node) && spellings.has(node.text) && !declarations.has(node) && !insideImport(node)) candidates.push(node);
      node.forEachChild(child => { visit(child); });
    };
    if (wanted.size) visit(source);
    const special = (node: Identifier): CompilerSymbol | undefined | null => {
      const parent = node.parent;
      if (isShorthandPropertyAssignment(parent) && parent.name === node) return checker.getShorthandAssignmentValueSymbol(parent);
      if (isExportSpecifier(parent) && isExportDeclaration(parent.parent.parent) && !parent.parent.parent.moduleSpecifier
        && (parent.propertyName ?? parent.name) === node) return checker.getExportSpecifierLocalTargetSymbol(parent);
      return null;
    };
    const symbolOf = new Map<Node, CompilerSymbol | undefined>();
    const plain: Identifier[] = [];
    for (const node of candidates) {
      const symbol = special(node);
      if (symbol === null) plain.push(node); else symbolOf.set(node, symbol);
    }
    const resolved = plain.length ? checker.getSymbolAtLocation(plain) : [];
    plain.forEach((node, index) => symbolOf.set(node, resolved[index]));
    for (const node of candidates) {
      const symbol = symbolOf.get(node);
      for (const path of symbol ? wanted.get(symbol.id) ?? [] : []) reference(node, path);
    }
  }
  if (values.length) {
    const types = checker.getTypeAtLocation(values.map(value => value.node));
    values.forEach((value, index) => {
      const type = types[index];
      const capability = type ? shapes.of(type) : undefined;
      if (!capability) {
        value.path.limitIds.add(limit('unresolved-symbol', location(value.node), 'The compiler did not resolve the type of this reference'));
      } else if (capability === 'unknown') {
        value.path.limitIds.add(limit('unclassified-capability', location(value.node), 'The referenced value has no classifiable type'));
      } else if (capability === 'data') value.path.evidence.add('data');
      else value.path.evidence.add(value.use === 'read' ? 'callable-reference' : value.use);
    });
  }
}
