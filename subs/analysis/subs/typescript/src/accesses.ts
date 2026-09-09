import { createHash } from 'node:crypto';
import { isBuiltin } from 'node:module';
import { relative, resolve } from 'node:path';
import type { Project } from 'typescript/unstable/sync';
import { SyntaxKind, isCallExpression, isExportDeclaration, isImportDeclaration,
  isNamedExports, isNamedImports, isStringLiteral, isImportTypeNode, isLiteralTypeNode, type Node } from 'typescript/unstable/ast';
import { originalKey } from '../../model/src/identity.js';
import type { SourceLocation, SourceOrigin } from '../../model/src/interfaces/model.js';
import type { AccessSelection, SourceAccess, SourceAnalysis, SourceCatalog, SourceLimit, SourceTarget, WrittenForm } from './interfaces/source.js';
import { Resolution, type CatalogHost, type ResolvedModule } from './resolution.js';
import { SourceFailure, type HelperInputs } from './wire.js';

const order = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
const identity = (kind: string, value: unknown): string => `${kind}/1:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

/** Interpret the captured compiler program in its supervised lifetime. Catalog
 * selections supply originals, including local aliases and forwarding paths. */
export function collectAccesses(project: Project, inputs: HelperInputs, host: CatalogHost,
  catalog: SourceCatalog): Awaited<ReturnType<SourceAnalysis['accesses']>> {
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
  const record = (node: Node, specifierNode: Node | undefined, form: WrittenForm,
    selectionForm: SourceAccess['selectionForm'], runtimeLoad: boolean,
    selection?: { node: Node; name: string; local: string | null; explicitType: boolean },
    deferred?: string): void => {
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
    if (deferred) coverageIds.push(limit('unresolved-original', at, deferred));
    const selections: AccessSelection[] = [];
    if (selection) {
      const selectedAt = location(selection.node);
      const file = target.kind === 'application' ? files.get(target.origin.file) : undefined;
      const entry = file?.exports.find(entry => entry.name === selection.name);
      const original = entry?.original ? originals.get(originalKey(entry.original)) : undefined;
      // A problem with another local binding does not prevent this selection
      // from resolving. Problems at the shared module target affect each one.
      const relevantLocations = specifierNode ? [selectedAt, location(specifierNode)] : [selectedAt];
      const blocked = catalog.coverage.filter(issue => issue.code === 'compiler-blocked'
        && relevantLocations.some(at => issue.location.file === at.file
          && issue.location.start < at.end && (issue.location.end > at.start
            || issue.location.start === issue.location.end && issue.location.start >= at.start)));
      const ambiguousResource = resolved?.resource && file?.state === 'ambiguous';
      const status: AccessSelection['status'] = original && !blocked.length && !ambiguousResource ? 'resolved'
        : !entry && file?.state === 'complete' && !blocked.length ? 'missing-export' : 'unresolved';
      const request = selection.explicitType || status === 'resolved' && original && !original.hasValue && original.hasType
        ? 'type-only' : 'value';
      selections.push({ location: selectedAt, exportedName: selection.name, localName: selection.local,
        explicitType: selection.explicitType, request, status,
        original: status === 'resolved' ? original!.id : null, forwarding: entry?.forwarding ?? [] });
      if (status === 'unresolved' && target.kind === 'application') coverageIds.push(limit(
        blocked.length ? 'compiler-blocked' : 'unresolved-original', selectedAt,
        `Cannot establish original for selected export ${selection.name}`,
        [...blocked.map(issue => issue.location), ...(file?.issueIds.flatMap(id => catalog.coverage.filter(issue => issue.id === id).map(issue => issue.location)) ?? [])]));
    }
    const value = { location: at, importer: origin(at.file), specifier, form, selectionForm, runtimeLoad,
      target, selections, coverageIds };
    // Source locations and selected names identify occurrences, never native IDs.
    accesses.push({ id: identity('access', [at, form, selectionForm, selections.map(item => item.location)]), ...value });
  };
  for (const file of [...inputs.inventory.files].sort((a, b) => order(a.path, b.path))) {
    if (file.kind !== 'source') continue;
    const source = project.program.getSourceFile(resolve(root, file.path));
    if (!source) {
      limit('compiler-blocked', { file: file.path, start: 0, end: 0, line: 1, column: 1 }, 'Owned source was not loaded by the configured compiler');
      continue;
    }
    const visit = (node: Node): void => {
      if (isImportDeclaration(node)) {
        const clause = node.importClause;
        if (!clause) record(node, node.moduleSpecifier, 'side-effect-import', 'none', true);
        else {
          const typeOnly = clause.phaseModifier === SyntaxKind.TypeKeyword;
          if (clause.name) record(node, node.moduleSpecifier, typeOnly ? 'import-type' : 'import', 'default', !typeOnly,
            { node: clause.name, name: 'default', local: clause.name.text, explicitType: typeOnly });
          if (clause.namedBindings && isNamedImports(clause.namedBindings)) {
            for (const binding of clause.namedBindings.elements) record(node, node.moduleSpecifier,
              typeOnly ? 'import-type' : binding.isTypeOnly ? 'inline-type-import' : 'import', 'named', !typeOnly,
              { node: binding, name: (binding.propertyName ?? binding.name).text, local: binding.name.text,
                explicitType: (typeOnly || binding.isTypeOnly) });
            if (!clause.name && !clause.namedBindings.elements.length) record(node, node.moduleSpecifier, 'empty-import', 'none', !typeOnly,
              undefined, 'Empty import interpretation is unavailable in the static binding stage');
          } else if (clause.namedBindings) record(node, node.moduleSpecifier,
            typeOnly ? 'type-namespace-import' : 'namespace-import', 'unknown', !typeOnly,
            undefined, 'Namespace member interpretation is unavailable in the static binding stage');
        }
        return;
      }
      if (isExportDeclaration(node) && node.moduleSpecifier) {
        if (node.exportClause && isNamedExports(node.exportClause)) {
          for (const binding of node.exportClause.elements) record(node, node.moduleSpecifier,
            node.isTypeOnly ? 'type-export' : binding.isTypeOnly ? 'inline-type-export' : 'named-export', 'named', !node.isTypeOnly,
            { node: binding, name: (binding.propertyName ?? binding.name).text, local: binding.name.text,
              explicitType: !!(node.isTypeOnly || binding.isTypeOnly) });
          if (!node.exportClause.elements.length) record(node, node.moduleSpecifier, 'empty-export', 'none', !node.isTypeOnly,
            undefined, 'Empty export interpretation is unavailable in the static binding stage');
        } else record(node, node.moduleSpecifier, node.exportClause ? node.isTypeOnly ? 'type-namespace-export' : 'namespace-export'
          : node.isTypeOnly ? 'type-star-export' : 'star-export', node.exportClause ? 'whole-namespace' : 'whole-star', !node.isTypeOnly,
        undefined, 'Whole export interpretation is unavailable in the static binding stage');
        return;
      }
      if (isCallExpression(node) && node.expression.kind === SyntaxKind.ImportKeyword) {
        record(node, node.arguments[0], 'dynamic-import', 'unknown', true, undefined,
          'Dynamic member interpretation is unavailable in the static binding stage');
      } else if (isImportTypeNode(node)) {
        record(node, isLiteralTypeNode(node.argument) ? node.argument.literal : undefined, 'import-type-query', 'unknown', false, undefined,
          'Import type query interpretation is unavailable in the static binding stage');
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
