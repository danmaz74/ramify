import { createHash } from 'node:crypto';
import { isBuiltin } from 'node:module';
import { relative, resolve } from 'node:path';
import type { Project } from 'typescript/unstable/sync';
import { SyntaxKind, isCallExpression, isExportDeclaration, isImportDeclaration,
  isNamedExports, isNamedImports, isStringLiteral, isImportTypeNode, isLiteralTypeNode,
  isNamespaceImport, isAwaitExpression, isParenthesizedExpression, isPropertyAccessExpression,
  isVariableDeclaration, isExpressionStatement, isVoidExpression, isArrowFunction, isFunctionExpression,
  isQualifiedName, isIdentifier, type Node } from 'typescript/unstable/ast';
import { originalKey } from '../../model/src/identity.js';
import type { SourceLocation, SourceOrigin } from '../../model/src/interfaces/model.js';
import type { AccessSelection, CatalogExport, SourceAccess, SourceAnalysis, SourceCatalog, SourceLimit, SourceTarget, WrittenForm } from './interfaces/source.js';
import { NamespaceUses, type NamespaceSink } from './namespace-uses.js';
import { Resolution, type CatalogHost, type ResolvedModule } from './resolution.js';
import { SourceFailure, type HelperInputs } from './wire.js';

const order = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
const identity = (kind: string, value: unknown): string => `${kind}/1:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

/** Interpret the captured compiler program in its supervised lifetime. Catalog
 * selections supply originals, including local aliases and forwarding paths. */
export function collectAccesses(project: Project, inputs: HelperInputs, host: CatalogHost,
  catalog: SourceCatalog, runtime: ReadonlyMap<CatalogExport, boolean>): Awaited<ReturnType<SourceAnalysis['accesses']>> {
  const root = inputs.inventory.scope.root;
  const resolution = new Resolution(project, inputs.inventory, host);
  const files = new Map(catalog.files.map(file => [file.file, file]));
  const originals = new Map(catalog.originals.map(original => [originalKey(original.id), original]));
  const accesses: SourceAccess[] = [];
  const coverage = new Map<string, SourceLimit>();
  let selectionCount = 0;
  const origin = (file: string): SourceOrigin => {
    const entry = resolution.files.get(resolve(root, file));
    const area = entry && inputs.areas.find(area => area.owner === entry.owner && area.kind === entry.area);
    if (!entry || !area) throw new SourceFailure('unavailable', `Missing resolved source area for ${file}`);
    return { file: entry.path, area };
  };
  const location = (node: Node): SourceLocation => {
    const source = node.getSourceFile(), start = node.getStart();
    const point = source.getLineAndCharacterOfPosition(start);
    return { file: relative(root, source.fileName), start, end: node.end, line: point.line + 1, column: point.character + 1 };
  };
  const limit = (code: SourceLimit['code'], at: SourceLocation, message: string,
    related: readonly SourceLocation[] = []): string => {
    const value = { code, location: at, message, related };
    const id = identity('access-limit', value);
    if (!coverage.has(id) && coverage.size >= 100_000) throw new SourceFailure('resource-limit', 'Source coverage record limit exceeded');
    coverage.set(id, { id, ...value });
    return id;
  };
  const targetOf = (resolved: ResolvedModule, specifier: string): SourceTarget => {
    if (resolved.kind === 'application' && resolved.file) return { kind: 'application', origin: origin(resolved.file) };
    if (resolved.kind === 'outside-module' && resolved.file) return { kind: 'outside-module', file: resolved.file };
    if (resolved.kind === 'external') {
      const source = resolved.file ? project.program.getSourceFile(resolve(root, resolved.file)) : undefined;
      return { kind: 'external', name: specifier, resolvedFile: resolved.file ? relative(root, resolved.file) : null,
        resolution: isBuiltin(specifier) ? 'builtin' : source && project.program.isSourceFileDefaultLibrary(source) ? 'standard-library' : 'package' };
    }
    return { kind: 'unresolved' };
  };
  const lookup = (specifier: Node | undefined, path: readonly string[]) => {
    const resolved = specifier && isStringLiteral(specifier) ? resolution.module(specifier) : undefined;
    const file = resolved?.kind === 'application' && resolved.file ? files.get(resolved.file) : undefined;
    let entries = file?.exports;
    let entry: CatalogExport | undefined;
    const forwarding = new Map<string, SourceOrigin>();
    let complete = file?.state === 'complete';
    const issueIds = new Set(file?.issueIds ?? []);
    for (const name of path) {
      entry = entries?.find(item => item.name === name);
      for (const origin of entry?.forwarding ?? []) {
        forwarding.set(origin.file, origin);
        const forwarded = files.get(origin.file);
        complete &&= forwarded?.state === 'complete';
        forwarded?.issueIds.forEach(id => issueIds.add(id));
      }
      entries = entry?.namespace ?? undefined;
    }
    return { file, entry, complete, issueIds: [...issueIds], forwarding: [...forwarding.values()] };
  };
  const record = (node: Node, specifierNode: Node | undefined, form: WrittenForm,
    selectionForm: SourceAccess['selectionForm'], runtimeLoad: boolean,
    selection?: { node: Node; name: string; local: string | null; explicitType: boolean; path?: readonly string[]; runtimeOnly?: boolean },
    deferred?: { code: SourceLimit['code']; message: string }): void => {
    if (accesses.length >= inputs.limits.maxAccesses) throw new SourceFailure('resource-limit', 'Source access record limit exceeded');
    if (selection && ++selectionCount > inputs.limits.maxSelections) throw new SourceFailure('resource-limit', 'Source selection record limit exceeded');
    const at = location(node);
    const specifier = specifierNode && isStringLiteral(specifierNode) ? specifierNode.text : null;
    const resolved = specifierNode && specifier !== null ? resolution.module(specifierNode) : undefined;
    const target: SourceTarget = resolved && specifier !== null ? targetOf(resolved, specifier) : { kind: 'unresolved' };
    const coverageIds: string[] = [];
    if (target.kind === 'unresolved') coverageIds.push(limit(specifier === null ? 'nonliteral-target'
      : resolved?.kind === 'resource-target' ? 'resource-target' : 'unresolved-target',
    specifierNode ? location(specifierNode) : at, 'Cannot establish the accessed source or resource target'));
    if (target.kind === 'outside-module') coverageIds.push(limit('outside-module-target', at,
      `Accessed project file ${target.file} is outside every module source area`));
    if (deferred) coverageIds.push(limit(deferred.code, at, deferred.message));
    const selections: AccessSelection[] = [];
    if (selection) {
      const selectedAt = location(selection.node);
      const file = target.kind === 'application' ? files.get(target.origin.file) : undefined;
      const found = lookup(specifierNode, selection.path ?? [selection.name]);
      const entry = found.entry;
      const original = entry?.original ? originals.get(originalKey(entry.original)) : undefined;
      // A problem with another local binding does not prevent this selection
      // from resolving. Problems at the shared module target affect each one.
      const relevantLocations = specifierNode ? [selectedAt, location(specifierNode)] : [selectedAt];
      const blocked = catalog.coverage.filter(issue => issue.code === 'compiler-blocked'
        && relevantLocations.some(at => issue.location.file === at.file
          && issue.location.start < at.end && (issue.location.end > at.start
            || issue.location.start === issue.location.end && issue.location.start >= at.start)));
      const ambiguousResource = resolved?.resource && file?.state === 'ambiguous';
      const status: AccessSelection['status'] = original && (!selection.runtimeOnly || original.hasValue) && !blocked.length && !ambiguousResource ? 'resolved'
        : !entry && found.complete && !blocked.length ? 'missing-export' : 'unresolved';
      const request = selection.explicitType || status === 'resolved' && original && !original.hasValue && original.hasType
        ? 'type-only' : 'value';
      selections.push({ location: selectedAt, exportedName: selection.name, localName: selection.local,
        explicitType: selection.explicitType, request, status,
        original: status === 'resolved' ? original!.id : null, forwarding: found.forwarding });
      if (status === 'unresolved' && target.kind === 'application') coverageIds.push(limit(
        blocked.length ? 'compiler-blocked' : !entry && !found.complete ? 'incomplete-exports' : 'unresolved-original', selectedAt,
        `Cannot establish original for selected export ${selection.name}`,
        [...blocked.map(issue => issue.location), ...found.issueIds.flatMap(id => catalog.coverage.filter(issue => issue.id === id).map(issue => issue.location))]));
    }
    const value = { location: at, importer: origin(at.file), specifier, form, selectionForm, runtimeLoad,
      target, selections, coverageIds };
    // Source locations and selected names identify occurrences, never native IDs.
    accesses.push({ id: identity('access', [at, form, selectionForm, selections.map(item => [item.location, item.exportedName]),
      selection?.path ?? (selection ? [selection.name] : [])]), ...value });
  };
  for (const file of [...inputs.inventory.files].sort((a, b) => order(a.path, b.path))) {
    if (file.kind !== 'source') continue;
    const source = project.program.getSourceFile(resolve(root, file.path));
    if (!source) {
      limit('compiler-blocked', { file: file.path, start: 0, end: 0, line: 1, column: 1 }, 'Owned source was not loaded by the configured compiler');
      continue;
    }
    const uses = new NamespaceUses(project, source);
    const interpret = (node: Node, specifier: Node | undefined, form: WrittenForm, runtimeLoad: boolean, explicitType: boolean,
      runtimeOnly = false) => {
      let records = 0;
      const emit = (at: Node, path: readonly string[], selectionForm: SourceAccess['selectionForm'], local: string | null) => {
        records++;
        record(node, specifier, form, selectionForm, runtimeLoad,
          { node: at, name: path.join('.'), path, local, explicitType, runtimeOnly });
      };
      const unknown = (at: Node, code: SourceLimit['code'], message: string) => {
        records++;
        record(at, specifier, form, 'unknown', runtimeLoad, undefined, { code, message });
      };
      const sink: NamespaceSink = {
        namespace: path => !!lookup(specifier, path).entry?.namespace,
        original: path => !!lookup(specifier, path).entry?.original,
        exported: path => !!lookup(specifier, path).entry,
        select: emit,
        unknown: (at, code) => unknown(at, code, code === 'unknown-key' ? 'Namespace key is not a string literal'
          : 'Namespace flow is outside the bounded member selection profile'),
      };
      const whole = (path: readonly string[], selectionForm: SourceAccess['selectionForm'], excludeDefault = false, depth = 0): void => {
        if (depth > inputs.limits.maxForwardingDepth) throw new SourceFailure('resource-limit', 'Namespace selection depth limit exceeded');
        const found = lookup(specifier, path);
        const entries = path.length ? found.entry?.namespace : found.file?.exports;
        if (!entries) {
          // A proven external namespace is outside the application model.
          if (specifier && resolution.module(specifier).kind === 'external') {
            records++; record(node, specifier, form, selectionForm, runtimeLoad);
          } else unknown(node, 'incomplete-exports', 'Cannot enumerate the selected namespace');
          return;
        }
        if (!found.complete) {
          unknown(node, 'incomplete-exports', 'The selected namespace has an incomplete export description');
        }
        for (const entry of entries) {
          if (excludeDefault && entry.name === 'default') continue;
          if (runtimeOnly && runtime.get(entry) === false) continue;
          const next = [...path, entry.name];
          if (entry.namespace && !entry.original) whole(next, selectionForm, false, depth + 1);
          else {
            const original = entry.original && originals.get(originalKey(entry.original));
            if (runtimeOnly && original && !original.hasValue) continue;
            emit(node, next, selectionForm, null);
          }
        }
      };
      return { sink, whole, emit, finish: (selectionForm: SourceAccess['selectionForm'] = 'none') => {
        if (!records) record(node, specifier, form, selectionForm, runtimeLoad);
      } };
    };
    const visited = new Set<string>();
    const visit = (node: Node): void => {
      // The native AST can present the same attached JSDoc through more than
      // one wrapper. Source position and syntax kind identify the occurrence.
      const key = `${node.kind}:${node.pos}:${node.end}`;
      if (visited.has(key)) return;
      visited.add(key);
      // forEachChild excludes attached JSDoc; its parsed type AST is still
      // compiler input when allowJs/checkJs select this JavaScript source.
      for (const doc of (node as Node & { jsDoc?: readonly Node[] }).jsDoc ?? []) visit(doc);
      if (isImportDeclaration(node)) {
        const clause = node.importClause;
        if (!clause) record(node, node.moduleSpecifier, 'side-effect-import', 'none', true);
        else {
          const typeOnly = clause.phaseModifier === SyntaxKind.TypeKeyword;
          const named = (name: string, local: Node & { text: string }, at: Node, explicitType: boolean, selectionForm: 'named' | 'default') => {
            const form = typeOnly ? 'import-type' : explicitType ? 'inline-type-import' : 'import';
            const selected = lookup(node.moduleSpecifier, [name]).entry;
            if (selected?.namespace && !selected.original && isIdentifier(local)) {
              const interpretation = interpret(node, node.moduleSpecifier, form, !typeOnly, explicitType);
              uses.binding(local, interpretation.sink, [name]); interpretation.finish();
            } else record(node, node.moduleSpecifier, form, selectionForm, !typeOnly,
              { node: at, name, local: local.text, explicitType });
          };
          if (clause.name) named('default', clause.name, clause.name, typeOnly, 'default');
          if (clause.namedBindings && isNamedImports(clause.namedBindings)) {
            for (const binding of clause.namedBindings.elements) named((binding.propertyName ?? binding.name).text,
              binding.name, binding, typeOnly || binding.isTypeOnly, 'named');
            if (!clause.name && !clause.namedBindings.elements.length) record(node, node.moduleSpecifier, 'empty-import', 'none', !typeOnly);
          } else if (clause.namedBindings && isNamespaceImport(clause.namedBindings)) {
            const interpretation = interpret(node, node.moduleSpecifier, typeOnly ? 'type-namespace-import' : 'namespace-import', !typeOnly, typeOnly);
            uses.binding(clause.namedBindings.name, interpretation.sink); interpretation.finish();
          }
        }
        return;
      }
      if (isExportDeclaration(node) && node.moduleSpecifier) {
        if (node.exportClause && isNamedExports(node.exportClause)) {
          for (const binding of node.exportClause.elements) {
            const name = (binding.propertyName ?? binding.name).text;
            const form = node.isTypeOnly ? 'type-export' : binding.isTypeOnly ? 'inline-type-export' : 'named-export';
            const explicitType = !!(node.isTypeOnly || binding.isTypeOnly);
            const entry = lookup(node.moduleSpecifier, [name]).entry;
            if (entry?.namespace && !entry.original) {
              const interpretation = interpret(node, node.moduleSpecifier, form, !node.isTypeOnly, explicitType);
              interpretation.whole([name], 'whole-namespace'); interpretation.finish('whole-namespace');
            } else record(node, node.moduleSpecifier, form, 'named', !node.isTypeOnly,
              { node: binding, name, local: binding.name.text, explicitType });
          }
          if (!node.exportClause.elements.length) record(node, node.moduleSpecifier, 'empty-export', 'none', !node.isTypeOnly);
        } else {
          const selectionForm = node.exportClause ? 'whole-namespace' : 'whole-star';
          const interpretation = interpret(node, node.moduleSpecifier, node.exportClause ? node.isTypeOnly ? 'type-namespace-export' : 'namespace-export'
            : node.isTypeOnly ? 'type-star-export' : 'star-export', !node.isTypeOnly, !!node.isTypeOnly);
          interpretation.whole([], selectionForm, !node.exportClause); interpretation.finish(selectionForm);
        }
        return;
      }
      if (isCallExpression(node) && node.expression.kind === SyntaxKind.ImportKeyword) {
        let expression: Node = node;
        while (isParenthesizedExpression(expression.parent)) expression = expression.parent;
        const awaited = isAwaitExpression(expression.parent);
        if (awaited) expression = expression.parent;
        while (isParenthesizedExpression(expression.parent)) expression = expression.parent;
        const discarded = isExpressionStatement(expression.parent) || isVoidExpression(expression.parent);
        const interpretation = interpret(node, node.arguments[0], discarded ? 'discarded-import' : 'dynamic-import', true, false, true);
        if (!node.arguments[0] || !isStringLiteral(node.arguments[0])) interpretation.finish('unknown');
        else if (discarded) interpretation.finish();
        else if (isVariableDeclaration(expression.parent) && expression.parent.initializer === expression && awaited) {
          uses.binding(expression.parent.name, interpretation.sink); interpretation.finish();
        } else if (isPropertyAccessExpression(expression.parent) && expression.parent.expression === expression
          && expression.parent.name.text === 'then' && isCallExpression(expression.parent.parent)
          && expression.parent.parent.expression === expression.parent) {
          const callback = expression.parent.parent.arguments[0];
          if (callback && (isArrowFunction(callback) || isFunctionExpression(callback)) && callback.parameters.length <= 1
            && !callback.parameters[0]?.dotDotDotToken) {
            if (callback.parameters[0]) uses.binding(callback.parameters[0].name, interpretation.sink, [], true);
            interpretation.finish();
          } else interpretation.sink.unknown(expression.parent.parent, 'namespace-escape');
        } else if (awaited) {
          uses.expression(expression, interpretation.sink); interpretation.finish();
        } else interpretation.sink.unknown(expression, 'namespace-escape');
      } else if (isImportTypeNode(node)) {
        const specifier = isLiteralTypeNode(node.argument) ? node.argument.literal : undefined;
        let jsdoc = false;
        for (let parent: Node = node; parent && parent !== source; parent = parent.parent) {
          if (parent.kind >= SyntaxKind.FirstJSDocNode && parent.kind <= SyntaxKind.LastJSDocNode) { jsdoc = true; break; }
        }
        const interpretation = interpret(node, specifier, jsdoc ? 'jsdoc-import-type' : 'import-type-query', false, true, !!node.isTypeOf);
        const path: string[] = [];
        const qualifier = (name: Node): void => {
          if (isQualifiedName(name)) { qualifier(name.left); path.push(name.right.text); }
          else if (isIdentifier(name)) path.push(name.text);
        };
        if (node.qualifier) qualifier(node.qualifier);
        if (!path.length || lookup(specifier, path).entry?.namespace && !lookup(specifier, path).entry?.original) {
          interpretation.whole(path, 'whole-namespace'); interpretation.finish('whole-namespace');
        } else interpretation.emit(node.qualifier ?? node, path, 'qualified-type', null);
        // Generic arguments may contain independent import type expressions.
        node.typeArguments?.forEach(argument => visit(argument));
        return;
      }
      node.forEachChild(child => { visit(child); });
    };
    visit(source);
  }
  return { accesses: accesses.sort((a, b) => order(a.location.file, b.location.file) || a.location.start - b.location.start
      || (a.selections[0]?.location.start ?? 0) - (b.selections[0]?.location.start ?? 0) || order(a.id, b.id)),
    coverage: [...coverage.values()].sort((a, b) => order(a.location.file, b.location.file) || a.location.start - b.location.start || order(a.id, b.id)) };
}
