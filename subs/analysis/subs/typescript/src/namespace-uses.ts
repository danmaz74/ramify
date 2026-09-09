import type { Project } from 'typescript/unstable/sync';
import { isIdentifier, isPropertyAccessExpression, isElementAccessExpression, isStringLiteral,
  isQualifiedName, isParenthesizedExpression, isVariableDeclaration, isObjectBindingPattern,
  isComputedPropertyName, isShorthandPropertyAssignment, isExportSpecifier, isExportDeclaration, type Node, type Identifier, type BindingName, type SourceFile } from 'typescript/unstable/ast';
import type { SourceAccess } from './interfaces/source.js';

type Form = SourceAccess['selectionForm'];
export interface NamespaceSink {
  /** A module namespace has constituents but no new owned wrapper original. */
  namespace(path: readonly string[]): boolean;
  original(path: readonly string[]): boolean;
  exported(path: readonly string[]): boolean;
  select(node: Node, path: readonly string[], form: Form, local: string | null): void;
  unknown(node: Node, code: 'unknown-key' | 'namespace-escape'): void;
}

/** Index lexical references by compiler symbol, never by identifier spelling.
 * No symbol or AST node crosses the helper's lifetime. */
export class NamespaceUses {
  private readonly references = new Map<number, Identifier[]>();
  constructor(private readonly project: Project, source: SourceFile) {
    const visit = (node: Node): void => {
      if (isIdentifier(node)) {
        const symbol = isShorthandPropertyAssignment(node.parent) && node.parent.name === node
          ? project.checker.getShorthandAssignmentValueSymbol(node.parent)
          : isExportSpecifier(node.parent) && isExportDeclaration(node.parent.parent.parent) && !node.parent.parent.parent.moduleSpecifier
            && (node.parent.propertyName ?? node.parent.name) === node
            ? project.checker.getExportSpecifierLocalTargetSymbol(node.parent)
          : project.checker.getSymbolAtLocation(node);
        if (symbol) {
          const nodes = this.references.get(symbol.id) ?? [];
          nodes.push(node); this.references.set(symbol.id, nodes);
        }
      }
      node.forEachChild(child => { visit(child); });
    };
    visit(source);
  }

  binding(name: BindingName, sink: NamespaceSink, path: readonly string[] = [], then = false): void {
    if (isObjectBindingPattern(name)) {
      for (const element of name.elements) {
        if (!element.name) { sink.unknown(element, 'namespace-escape'); continue; }
        if (element.dotDotDotToken) { sink.unknown(element, 'namespace-escape'); continue; }
        let key: string | undefined;
        const property = element.propertyName ?? element.name;
        if (isIdentifier(property) || isStringLiteral(property)) key = property.text;
        else if (isComputedPropertyName(property) && isStringLiteral(property.expression)) key = property.expression.text;
        if (key === undefined) { sink.unknown(element, 'unknown-key'); continue; }
        const selected = [...path, key];
        if (path.length && sink.original(path) && !sink.exported(selected)) {
          sink.select(element, path, then ? 'then-destructure' : 'destructure', isIdentifier(element.name) ? element.name.text : null);
        } else if (sink.namespace(selected) && (isObjectBindingPattern(element.name) || !sink.original(selected))) this.binding(element.name, sink, selected, then);
        else sink.select(element, selected, then ? 'then-destructure' : 'destructure', isIdentifier(element.name) ? element.name.text : null);
      }
    } else if (isIdentifier(name)) {
      const symbol = this.project.checker.getSymbolAtLocation(name);
      if (!symbol) { sink.unknown(name, 'namespace-escape'); return; }
      for (const reference of this.references.get(symbol.id) ?? []) {
        if (reference === name) continue;
        this.expression(reference, sink, path, then);
      }
    } else sink.unknown(name, 'namespace-escape');
  }

  expression(node: Node, sink: NamespaceSink, path: readonly string[] = [], then = false): void {
    while (isParenthesizedExpression(node.parent) && node.parent.expression === node) node = node.parent;
    const parent = node.parent;
    let selected: readonly string[] | undefined;
    let form: Form = then ? 'then-member' : 'direct-member';
    if (isPropertyAccessExpression(parent) && parent.expression === node) selected = [...path, parent.name.text];
    else if (isQualifiedName(parent) && parent.left === node) { selected = [...path, parent.right.text]; form = 'qualified-type'; }
    else if (isElementAccessExpression(parent) && parent.expression === node) {
      if (isStringLiteral(parent.argumentExpression)) {
        selected = [...path, parent.argumentExpression.text]; form = then ? 'then-member' : 'literal-key';
      } else { sink.unknown(parent, 'unknown-key'); return; }
    }
    if (selected) {
      // A merged function/namespace has both exports and ordinary function
      // properties. Only actual namespace exports extend the original path.
      if (path.length && sink.original(path) && !sink.exported(selected)) sink.select(node, path, form, null);
      else if (sink.namespace(selected)) this.expression(parent, sink, selected, then);
      else sink.select(parent, selected, form, null);
    } else if (isVariableDeclaration(parent) && parent.initializer === node && isObjectBindingPattern(parent.name)) {
      this.binding(parent.name, sink, path, then);
    } else if (path.length && sink.original(path)) {
      sink.select(node, path, then ? 'then-member' : 'direct-member', null);
    } else sink.unknown(node, 'namespace-escape');
  }
}
