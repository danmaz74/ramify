import { ModifierFlags, SyntaxKind, isArrowFunction, isBindingElement, isClassDeclaration, isClassExpression,
  isComputedPropertyName, isConstructSignatureDeclaration, isConstructorDeclaration, isCallSignatureDeclaration,
  isEnumDeclaration, isExportAssignment, isExpressionWithTypeArguments, isFunctionDeclaration, isFunctionExpression,
  isGetAccessorDeclaration, isIdentifier, isImportTypeNode, isIndexSignatureDeclaration, isInterfaceDeclaration,
  isLiteralTypeNode, isMethodDeclaration, isMethodSignatureDeclaration, isModuleDeclaration, isParenthesizedExpression,
  isPrivateIdentifier, isPropertyAccessExpression, isPropertyDeclaration, isPropertySignatureDeclaration, isQualifiedName,
  isSetAccessorDeclaration, isSourceFile, isStringLiteral, isTypeAliasDeclaration, isTypeQueryNode, isTypeReferenceNode,
  isVariableDeclaration, type Identifier, type Node, type NodeArray, type ParameterDeclaration, type StringLiteral,
  type TypeParameterDeclaration } from 'typescript/unstable/ast';

/** One name a declared signature spells: an entity name, a `typeof` query, a
 * heritage expression or an `import("…")` type. */
export interface SignatureReference {
  /** The naming node, reported as the companion's evidence. */
  readonly node: Node;
  /** The spelled identifiers, leftmost first. An `import("…")` type lists its qualifier only. */
  readonly names: readonly Identifier[];
  /** The module specifier of an `import("…")` type; null for every other reference. */
  readonly specifier: StringLiteral | null;
}
export interface SignatureHarvest {
  readonly references: readonly SignatureReference[];
  /** Some read position has no annotation, so TypeScript infers its type. */
  readonly inferred: boolean;
}

interface State { readonly references: SignatureReference[]; inferred: boolean }
type Signature = Node & { readonly typeParameters?: NodeArray<TypeParameterDeclaration>;
  readonly parameters: NodeArray<ParameterDeclaration>; readonly type?: Node; readonly body?: Node };

const nameText = (node: Node): string => {
  const name = (node as { name?: Node }).name;
  if (!name) return `#${node.kind}`;
  return isIdentifier(name) || isStringLiteral(name) || isPrivateIdentifier(name) ? `=${(name as { text: string }).text}` : `@${name.pos}`;
};
const modifiers = (node: Node): ModifierFlags => (node as { modifierFlags?: ModifierFlags }).modifierFlags ?? ModifierFlags.None;
const hidden = (node: Node): boolean => {
  const name = (node as { name?: Node }).name;
  return (modifiers(node) & ModifierFlags.Private) !== 0 || (name !== undefined && isPrivateIdentifier(name));
};

/** An overloaded callable's implementation is not part of its declared contract. */
function implementation(node: Signature, siblings: readonly Node[]): boolean {
  if (!node.body) return false;
  const statics = modifiers(node) & ModifierFlags.Static;
  return siblings.some(other => other !== node && other.kind === node.kind && !(other as Signature).body
    && nameText(other) === nameText(node) && (modifiers(other) & ModifierFlags.Static) === statics);
}

/** The identifiers of an entity name or entity-name expression, or null for any other expression. */
function chain(node: Node): Identifier[] | null {
  if (isIdentifier(node)) return [node];
  if (isQualifiedName(node)) { const left = chain(node.left); return left && [...left, node.right]; }
  if (isPropertyAccessExpression(node) && isIdentifier(node.name)) {
    const left = chain(node.expression); return left && [...left, node.name];
  }
  return null;
}

function type(node: Node | undefined, state: State): void {
  if (!node) return;
  const visit = (current: Node): void => {
    if (isTypeReferenceNode(current)) {
      entity(current.typeName, state);
      current.typeArguments?.forEach(visit); return;
    }
    if (isExpressionWithTypeArguments(current)) {
      entity(current.expression, state);
      current.typeArguments?.forEach(visit); return;
    }
    if (isTypeQueryNode(current)) {
      entity(current.exprName, state);
      current.typeArguments?.forEach(visit); return;
    }
    if (isImportTypeNode(current)) {
      const literal = isLiteralTypeNode(current.argument) && isStringLiteral(current.argument.literal) ? current.argument.literal : null;
      const names = current.qualifier ? chain(current.qualifier) : [];
      if (!literal || !names) state.inferred = true;
      else state.references.push({ node: current, names, specifier: literal });
      current.typeArguments?.forEach(visit); return;
    }
    // A computed member name is a value expression, not a declared type.
    if (isComputedPropertyName(current)) return;
    current.forEachChild(child => { visit(child); });
  };
  visit(node);
}

function entity(node: Node, state: State): void {
  const names = chain(node);
  // A heritage expression that is not a name, such as a mixin call, computes its type.
  if (!names) { state.inferred = true; return; }
  state.references.push({ node, names, specifier: null });
}

function typeParameters(parameters: NodeArray<TypeParameterDeclaration> | undefined, state: State): void {
  for (const parameter of parameters ?? []) { type(parameter.constraint, state); type(parameter.defaultType, state); }
}

/** Type parameters' constraints and defaults, parameter types and the return type.
 * Neither the body nor a parameter's default expression is read. */
function signature(node: Signature, state: State, returns = true): void {
  typeParameters(node.typeParameters, state);
  for (const parameter of node.parameters) {
    if (parameter.type) type(parameter.type, state);
    else state.inferred = true;
  }
  if (!returns) return;
  if (node.type) type(node.type, state);
  else state.inferred = true;
}

/** A directly assigned arrow function or function expression, ignoring parentheses. */
function callable(initializer: Node | undefined, state: State): boolean {
  let current = initializer;
  while (current && isParenthesizedExpression(current)) current = current.expression;
  if (!current || !(isArrowFunction(current) || isFunctionExpression(current))) return false;
  signature(current, state);
  return true;
}

/** A variable or property: its annotation defines the contract; without one a
 * directly assigned callable supplies it; any other initializer is inferred. */
function annotated(annotation: Node | undefined, initializer: Node | undefined, state: State): void {
  if (annotation) type(annotation, state);
  else if (!callable(initializer, state)) state.inferred = true;
}

function member(node: Node, siblings: readonly Node[], state: State): void {
  if (isPropertyDeclaration(node) || isPropertySignatureDeclaration(node)) annotated(node.type, node.initializer, state);
  else if (isMethodDeclaration(node) || isMethodSignatureDeclaration(node) || isCallSignatureDeclaration(node)
    || isConstructSignatureDeclaration(node)) { if (!implementation(node as Signature, siblings)) signature(node as Signature, state); }
  else if (isConstructorDeclaration(node)) {
    // Parameter properties, `private` ones included, are constructor parameters callers must satisfy.
    if (!implementation(node as Signature, siblings)) signature(node as Signature, state, false);
  } else if (isGetAccessorDeclaration(node)) {
    if (node.type) type(node.type, state); else state.inferred = true;
  } else if (isSetAccessorDeclaration(node)) signature(node as Signature, state, false);
  else if (isIndexSignatureDeclaration(node)) signature(node as Signature, state);
}

function declaration(node: Node, siblings: readonly Node[], state: State): void {
  if (isFunctionDeclaration(node)) { if (!implementation(node as Signature, siblings)) signature(node as Signature, state); }
  else if (isClassDeclaration(node) || isClassExpression(node)) {
    typeParameters(node.typeParameters, state);
    for (const clause of node.heritageClauses ?? []) for (const heritage of clause.types) type(heritage, state);
    for (const element of node.members) if (!hidden(element)) member(element, node.members, state);
  } else if (isInterfaceDeclaration(node)) {
    typeParameters(node.typeParameters, state);
    for (const clause of node.heritageClauses ?? []) for (const heritage of clause.types) type(heritage, state);
    for (const element of node.members) member(element, node.members, state);
  } else if (isTypeAliasDeclaration(node)) {
    typeParameters(node.typeParameters, state);
    type(node.type, state);
  } else if (isVariableDeclaration(node)) annotated(node.type, node.initializer, state);
  else if (isBindingElement(node)) {
    let current: Node = node;
    while (!isVariableDeclaration(current) && current.kind !== SyntaxKind.SourceFile) current = current.parent;
    // A destructured binding has no annotation of its own.
    if (isVariableDeclaration(current) && current.type) type(current.type, state); else state.inferred = true;
  } else if (isExportAssignment(node)) { if (!callable(node.expression, state)) state.inferred = true; }
  else if (isEnumDeclaration(node) || isModuleDeclaration(node) || isSourceFile(node)) return;
  else state.inferred = true;
}

/**
 * The names an original's declared signature spells, read from its declaration
 * nodes without type computation: the positions of the source interpretation
 * principles' harvesting table. Enums, namespaces and module sources name none.
 */
export function harvestSignature(declarations: readonly Node[]): SignatureHarvest {
  const state: State = { references: [], inferred: false };
  for (const node of declarations) declaration(node, declarations, state);
  return state;
}
