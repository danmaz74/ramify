import { resolve } from 'node:path';
import type { Project } from 'typescript/unstable/sync';
import { isBindingElement, isBlock, isCallExpression, isCaseClause, isCatchClause, isClassDeclaration, isDefaultClause,
  isEnumDeclaration, isForInStatement, isForOfStatement, isForStatement, isFunctionDeclaration, isFunctionExpression,
  isFunctionLikeDeclaration, isIdentifier, isModuleBlock, isModuleDeclaration, isNoSubstitutionTemplateLiteral,
  isPropertyAccessExpression, isSourceFile, isStringLiteral, isTaggedTemplateExpression, isVariableDeclarationList,
  isVariableStatement, type BindingName, type CallExpression, type Node, type SourceFile, type Statement } from 'typescript/unstable/ast';
import type { TestFileTitles, TestSuiteTitles, TestTitleLimits } from './interfaces/source.js';
import { truncateUtf8 } from './symbol-details.js';
import { SourceFailure, encode, freezeData } from './wire.js';

let runs = 0;
/** `describeTestTitles` calls in this process, the witness that only an explicit request reads test titles. */
export function testTitleRuns(): number { return runs; }

type Role = 'describe' | 'it' | 'test';
const roles: ReadonlySet<string> = new Set<Role>(['describe', 'it', 'test']);
/** `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs` and `.cjs`. */
const scriptFile = /\.(?:[jt]sx?|[cm][jt]s)$/;
const DYNAMIC = '(dynamic)';

/** A canonical project-relative path of a TypeScript or JavaScript file. */
function validFile(file: unknown): file is string {
  return typeof file === 'string' && file.length > 0 && !file.startsWith('/') && scriptFile.test(file)
    && !/[\u0000-\u001f\u007f\\]/u.test(file) && !/[\uD800-\uDFFF]/u.test(file)
    && file.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

/**
 * The name a suite or test callee starts from: `describe`, `describe` followed
 * by property accesses (`describe.skip`, `describe.only.each`), or a call or
 * tagged template of such a chain (`describe.each(table)`, `test.each\`…\``).
 */
function calleeRole(callee: Node): Role | undefined {
  let node = callee;
  if (isCallExpression(node)) node = node.expression;
  else if (isTaggedTemplateExpression(node)) node = node.tag;
  while (isPropertyAccessExpression(node)) node = node.expression;
  return isIdentifier(node) && roles.has(node.text) ? node.text as Role : undefined;
}

/** Names bound by declarations among `statements`; imports are not declarations of the file's own. */
function declared(statements: readonly Statement[], bind: (name: BindingName | undefined) => void): void {
  for (const statement of statements) {
    if (isFunctionDeclaration(statement) || isClassDeclaration(statement) || isEnumDeclaration(statement)) bind(statement.name);
    else if (isModuleDeclaration(statement)) { if (isIdentifier(statement.name)) bind(statement.name); }
    else if (isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) bind(declaration.name);
  }
}

/**
 * The names among `describe`, `it` and `test` that `node` binds for everything
 * inside it. The source file's own top-level declarations hide a name in the
 * whole file; a nested declaration, parameter, loop or catch variable hides it
 * only inside its own scope.
 */
function bound(node: Node): readonly string[] {
  const names: string[] = [];
  const bind = (name: BindingName | undefined): void => {
    if (!name) return;
    if (isIdentifier(name)) { if (roles.has(name.text)) names.push(name.text); return; }
    for (const element of name.elements) if (isBindingElement(element)) bind(element.name);
  };
  if (isSourceFile(node) || isBlock(node) || isModuleBlock(node) || isCaseClause(node) || isDefaultClause(node)) declared(node.statements, bind);
  else if (isForStatement(node) || isForInStatement(node) || isForOfStatement(node)) {
    if (node.initializer && isVariableDeclarationList(node.initializer)) for (const declaration of node.initializer.declarations) bind(declaration.name);
  } else if (isCatchClause(node)) bind(node.variableDeclaration?.name);
  else if (isFunctionLikeDeclaration(node)) {
    for (const parameter of node.parameters) bind(parameter.name);
    if (isFunctionExpression(node)) bind(node.name);
  }
  return names;
}

/** One suite, or the file itself as the pseudo-suite `[]`, while its file is read. */
interface Scope {
  readonly suite: readonly string[];
  readonly tests: string[];
  nested: number;
}

/**
 * Walk one file's syntax tree without recursion. A suite call opens a scope for
 * the arguments after its title; a test call is a leaf whose arguments are not
 * read. Scopes are created in source order of their suites, which is the
 * order of the result's entries.
 */
function readSourceFile(source: SourceFile, file: string, limits: TestTitleLimits): TestFileTitles {
  let dynamic = 0, cut = 0;
  const title = (call: CallExpression): string => {
    const first = call.arguments[0];
    if (!first || !(isStringLiteral(first) || isNoSubstitutionTemplateLiteral(first))) { dynamic++; return DYNAMIC; }
    const bounded = truncateUtf8(first.text, limits.maxTitleBytes);
    if (!bounded.truncated) return first.text;
    cut++;
    return `${bounded.text}…`;
  };
  const scopes: Scope[] = [{ suite: [], tests: [], nested: 0 }];
  interface Work { readonly node: Node; readonly scope: number; readonly hidden: ReadonlySet<string> }
  const work: Work[] = [{ node: source, scope: 0, hidden: new Set() }];
  const enqueue = (nodes: readonly Node[], scope: number, hidden: ReadonlySet<string>): void => {
    for (let index = nodes.length - 1; index >= 0; index--) work.push({ node: nodes[index]!, scope, hidden });
  };
  while (work.length) {
    const { node, scope, hidden } = work.pop()!;
    const role = isCallExpression(node) ? calleeRole(node.expression) : undefined;
    if (role && !hidden.has(role)) {
      const call = node as CallExpression;
      const parent = scopes[scope]!;
      if (role !== 'describe') { parent.tests.push(title(call)); continue; }
      parent.nested++;
      const opened = scopes.push({ suite: [...parent.suite, title(call)], tests: [], nested: 0 }) - 1;
      enqueue(call.arguments.slice(1), opened, hidden);
      continue;
    }
    const names = bound(node);
    const children: Node[] = [];
    node.forEachChild(child => { children.push(child); });
    enqueue(children, scope, names.length ? new Set([...hidden, ...names]) : hidden);
  }
  const suites: TestSuiteTitles[] = [];
  for (const [index, scope] of scopes.entries()) {
    for (let start = 0; start < scope.tests.length; start += limits.maxTitlesPerRecord) {
      suites.push({ suite: [...scope.suite], tests: scope.tests.slice(start, start + limits.maxTitlesPerRecord) });
    }
    // A suite with neither tests nor suites is still listed; the file itself is not.
    if (index > 0 && !scope.tests.length && !scope.nested) suites.push({ suite: [...scope.suite], tests: [] });
  }
  return { file, state: 'described', suites, dynamic, cut };
}

function readOne(project: Project, root: string, file: string, limits: TestTitleLimits): TestFileTitles {
  // A request to the server fails only when the server or its channel is gone; that propagates.
  const source = project.program.getSourceFile(resolve(root, file));
  if (!source) return { file, state: 'unavailable', reason: 'not-in-program' };
  // The tree is decoded locally; a failure to read it is this file's alone.
  try { return readSourceFile(source, file, limits); }
  catch (error) {
    if (error instanceof SourceFailure) throw error;
    return { file, state: 'unavailable', reason: 'compiler-failure' };
  }
}

/**
 * Read the suite and test titles of each requested project-relative TypeScript
 * or JavaScript file from the compiler program's syntax tree, statically and
 * without running anything. Pure and synchronous over an already-open
 * `Project`; one result per request, in request order. A suite is a call of
 * `describe`, a test a call of `it` or `test`, including their modifier and
 * table forms. A file's own top-level binding of one of these names hides its
 * calls in the whole file, and a nested binding hides them inside its scope. A
 * title that is not a string literal or a template literal without
 * substitutions is `(dynamic)`; a title longer than `maxTitleBytes` is cut on a
 * character boundary with a trailing `…`. A file outside the program is
 * `unavailable`. An invalid request or limits, a result above `maxResultBytes`
 * or cancellation throws `SourceFailure` with no partial result.
 */
export function describeTestTitles(project: Project, root: string, files: readonly string[], limits: TestTitleLimits,
  signal?: AbortSignal): readonly TestFileTitles[] {
  runs++;
  if (signal?.aborted) throw new SourceFailure('cancelled', 'Test titles were cancelled before execution');
  if (![limits.maxTitleBytes, limits.maxTitlesPerRecord, limits.maxResultBytes].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new SourceFailure('resource-limit', 'Test title limits must be positive safe integers');
  }
  for (const file of files) {
    if (!validFile(file)) throw new SourceFailure('protocol-error', 'Invalid test title file');
  }
  const output: TestFileTitles[] = [];
  // The encoded array: brackets, one comma between entries, and each entry.
  let bytes = 2;
  for (const file of files) {
    if (signal?.aborted) throw new SourceFailure('cancelled', 'Test titles were cancelled');
    const titles = readOne(project, root, file, limits);
    bytes += (output.length ? 1 : 0) + encode(titles, limits.maxResultBytes).length;
    if (bytes > limits.maxResultBytes) throw new SourceFailure('resource-limit', `Test titles exceed ${limits.maxResultBytes} encoded bytes`);
    output.push(titles);
  }
  if (signal?.aborted) throw new SourceFailure('cancelled', 'Test titles were cancelled');
  return freezeData(output);
}
