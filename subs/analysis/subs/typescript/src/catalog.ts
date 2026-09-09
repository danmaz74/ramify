import { relative, resolve } from 'node:path';
import { SymbolFlags, type Project, type Symbol as CompilerSymbol } from 'typescript/unstable/sync';
import { SyntaxKind, isExportDeclaration, isExportSpecifier, isImportDeclaration,
  isImportSpecifier, isImportClause, isNamespaceImport,
  isModuleDeclaration, isIdentifier, isStringLiteral, isExportAssignment,
  type Node, type SourceFile } from 'typescript/unstable/ast';
import { originalKey } from '../../model/src/identity.js';
import type { OriginalId, SourceArea, SourceLocation, SourceOrigin } from '../../model/src/interfaces/model.js';
import type { InventoryFile, ProjectInventory } from '../../project/src/interfaces/project.js';
import type { CatalogOriginal, CatalogExport, FileExports, SourceCatalog, SourceLimit, SourceWorkLimits } from './interfaces/source.js';
import { Resolution, type CatalogHost } from './resolution.js';
import { SourceFailure } from './wire.js';

interface Inputs { readonly inventory: ProjectInventory; readonly areas: readonly SourceArea[]; readonly limits: SourceWorkLimits }
interface MutableFile { file: string; state: FileExports['state']; exports: CatalogExport[]; issueIds: string[]; descriptionFiles: string[] }
const order = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));

/** Called only in the supervised helper. The returned graph contains no native
 * compiler handles; every identity comes from declarations and captured owners. */
export function buildCatalog(project: Project, inputs: Inputs, host: CatalogHost): SourceCatalog {
  return new CatalogBuilder(project, inputs, host).build();
}

class CatalogBuilder {
  private readonly resolution: Resolution;
  private readonly originals = new Map<string, CatalogOriginal>();
  private readonly files = new Map<string, MutableFile>();
  private readonly active = new Set<string>();
  private readonly coverage: SourceLimit[] = [];
  private count = 0;
  private readonly resourceModules = new Map<string, CompilerSymbol[]>();
  private readonly bindingProblems = new Map<string, readonly SourceLocation[]>();
  private readonly root: string;
  constructor(private readonly project: Project, private readonly inputs: Inputs, private readonly host: CatalogHost) {
    this.root = inputs.inventory.scope.root;
    this.resolution = new Resolution(project, inputs.inventory, host);
  }
  private origin(file: string): SourceOrigin | null {
    const inventory = this.resolution.files.get(resolve(this.root, file));
    if (!inventory) return null;
    const area = this.inputs.areas.find(area => area.owner === inventory.owner && area.kind === inventory.area);
    if (!area) throw new Error(`Missing resolved source area for ${file}`);
    return { file: inventory.path, area: { ...area, profile: [...area.profile] } };
  }
  private location(node: Node): SourceLocation {
    const source = node.getSourceFile(), start = node.getStart();
    const point = source.getLineAndCharacterOfPosition(start);
    return { file: relative(this.root, source.fileName), start, end: node.end, line: point.line + 1, column: point.character + 1 };
  }
  private at(file: string): SourceLocation { return { file, start: 0, end: 0, line: 1, column: 1 }; }
  private limit(file: MutableFile, code: SourceLimit['code'], message: string, node?: Node,
    related: readonly SourceLocation[] = [], compilerCode?: number, precise?: SourceLocation): void {
    const location = precise ?? (node ? this.location(node) : this.at(file.file));
    // Synthetic witness names are implementation inputs, never report locations.
    const reported = resolve(this.root, location.file) === this.host.resourceWitness ? this.at(file.file) : location;
    const key = JSON.stringify([code, reported.file, reported.start, message]);
    let issue = this.coverage.find(issue => issue.id === key);
    if (!issue) {
      if (this.coverage.length >= 100_000) throw new SourceFailure('resource-limit', 'Source coverage record limit exceeded');
      issue = { id: key, code, message, location: reported, related, ...(compilerCode === undefined ? {} : { compilerCode }) };
      this.coverage.push(issue);
    }
    if (!file.issueIds.includes(key)) file.issueIds.push(key);
    if (code === 'ambiguous-original') file.state = 'ambiguous';
    else if (file.state === 'complete') file.state = 'incomplete';
  }
  private check(depth: number, record = false): void {
    if (depth > this.inputs.limits.maxForwardingDepth) throw new SourceFailure('resource-limit', 'Source forwarding depth limit exceeded');
    if (record && ++this.count > this.inputs.limits.maxExports) throw new SourceFailure('resource-limit', 'Source export record limit exceeded');
  }
  build(): SourceCatalog {
    // The compiler resolves resource descriptions both in actual source and in
    // an unexecuted witness, so unimported resource exports remain catalogued.
    const sourceFiles = [...this.inputs.inventory.files.filter(file => file.kind === 'source').map(file => resolve(this.root, file.path)), this.host.resourceWitness];
    for (const path of sourceFiles) {
      const source = this.project.program.getSourceFile(path);
      if (!source) continue;
      const visit = (node: Node): void => {
        if ((isImportDeclaration(node) || isExportDeclaration(node)) && node.moduleSpecifier) {
          const target = this.resolution.module(node.moduleSpecifier);
          if (target.resource && target.module) {
            const descriptions = this.resourceModules.get(target.resource.path) ?? [];
            if (!descriptions.some(symbol => symbol.id === target.module!.id)) descriptions.push(target.module);
            this.resourceModules.set(target.resource.path, descriptions);
          }
        }
        node.forEachChild(child => { visit(child); });
      };
      visit(source);
    }
    for (const file of [...this.inputs.inventory.files].sort((a, b) => order(a.path, b.path))) this.file(file.path, 0);
    // Native star enumeration may temporarily supply one conflicting winner.
    // Only originals retained by the validated export selections are facts.
    const retained = new Set<string>();
    const retain = (entry: CatalogExport): void => {
      if (entry.original) retained.add(originalKey(entry.original));
      entry.namespace?.forEach(retain);
    };
    for (const file of this.files.values()) file.exports.forEach(retain);
    return {
      originals: [...this.originals.values()].filter(original => retained.has(originalKey(original.id)))
        .sort((a, b) => order(originalKey(a.id), originalKey(b.id))),
      files: [...this.files.values()].sort((a, b) => order(a.file, b.file)).map(file => ({ ...file,
        exports: file.exports.sort((a, b) => order(a.name, b.name)), issueIds: file.issueIds.sort(order), descriptionFiles: file.descriptionFiles.sort(order) })),
      coverage: this.coverage.sort((a, b) => order(a.location.file, b.location.file) || a.location.start - b.location.start || order(a.id, b.id)),
    };
  }
  private file(path: string, depth: number): MutableFile {
    const previous = this.files.get(path);
    if (previous) return previous;
    this.check(depth);
    const file: MutableFile = { file: path, state: 'complete', exports: [], issueIds: [], descriptionFiles: [] };
    this.files.set(path, file); this.active.add(path);
    const inventory = this.resolution.files.get(resolve(this.root, path));
    if (!inventory) throw new Error(`Catalog requested non-owned file ${path}`);
    if (inventory.kind === 'resource') this.resource(file, inventory, depth);
    else {
      const source = this.project.program.getSourceFile(resolve(this.root, path));
      if (!source) this.limit(file, 'compiler-blocked', 'Owned source was not loaded by the configured compiler');
      else {
        // Parsing/binding is needed to establish declarations. Never request
        // semantic, global, suggestion or declaration-emit diagnostics.
        const bindingDiagnostics = this.project.program.getBindDiagnostics(source.fileName);
        this.bindingProblems.set(path, bindingDiagnostics.map(diagnostic => ({ ...this.at(path), start: diagnostic.pos, end: diagnostic.end })));
        for (const diagnostic of [...this.project.program.getSyntacticDiagnostics(source.fileName), ...bindingDiagnostics]) {
          const start = Math.max(0, diagnostic.pos);
          const point = source.getLineAndCharacterOfPosition(start);
          const location = { file: path, start, end: Math.max(start, diagnostic.end), line: point.line + 1, column: point.character + 1 };
          this.limit(file, 'compiler-blocked', `Compiler could not establish an unambiguous declaration (TS${diagnostic.code})`, undefined, [], diagnostic.code, location);
        }
        const module = this.project.checker.getSymbolAtLocation(source);
        if (module) {
          for (const symbol of this.project.checker.getExportsOfModule(module)) {
            this.check(depth, true); file.exports.push(this.export(symbol, symbol.name, file, depth + 1));
          }
          this.stars(source, file, depth + 1);
        } else if (source.externalModuleIndicator) this.limit(file, 'incomplete-exports', 'Compiler did not supply an export description for this module', source);
      }
    }
    this.active.delete(path);
    return file;
  }
  private resource(file: MutableFile, inventory: InventoryFile, depth: number): void {
    const modules = this.resourceModules.get(inventory.path) ?? [];
    if (!modules.length) { this.limit(file, 'resource-description', 'No effective compiler export description for the existing resource'); return; }
    const alternatives: CatalogExport[][] = [];
    for (const module of modules) {
      const names = [...this.project.checker.getExportsOfModule(module)];
      // JSON has a synthetic ESM default supplied by TypeScript's module type,
      // while getExportsOfModule enumerates its named properties only.
      const json = inventory.path.endsWith('.json');
      const entries = names.map(symbol => this.resourceExport(symbol, symbol.name, file, inventory, depth + 1));
      if (json && !entries.some(entry => entry.name === 'default')) entries.push(this.resourceExport(module, 'default', file, inventory, depth + 1, 'default'));
      alternatives.push(entries);
      for (const handle of module.declarations) {
        const path = relative(this.root, handle.path);
        if (!file.descriptionFiles.includes(path)) file.descriptionFiles.push(path);
      }
    }
    file.exports = alternatives[0];
    const signature = (entries: CatalogExport[]) => JSON.stringify(entries.map(entry => [entry.name, entry.original]).sort((a, b) => order(String(a[0]), String(b[0]))));
    if (alternatives.some(entries => signature(entries) !== signature(file.exports))) this.limit(file, 'ambiguous-original', 'Conflicting effective export descriptions for one resource');
  }
  private resourceExport(symbol: CompilerSymbol, name: string, file: MutableFile, inventory: InventoryFile, depth: number, forcedBinding?: string): CatalogExport {
    this.check(depth, true);
    const target = symbol.flags & SymbolFlags.Alias ? this.project.checker.getAliasedSymbol(symbol) : symbol;
    if (this.project.checker.isUnknownSymbol(target)) {
      this.limit(file, 'unresolved-original', `Cannot resolve resource export ${name}`);
      return { name, original: null, namespace: null, forwarding: [] };
    }
    // Aliases inside one description coalesce by their original declaration.
    // Prefer an effective public default spelling for the CSS classes binding.
    const module = (this.resourceModules.get(inventory.path) ?? []).find(module => this.project.checker.getExportsOfModule(module).some(item => item.id === symbol.id));
    const aliases = module ? this.project.checker.getExportsOfModule(module).filter(item => {
      const original = item.flags & SymbolFlags.Alias ? this.project.checker.getAliasedSymbol(item) : item;
      return original.id === target.id;
    }).map(item => item.name).sort(order) : [name];
    const binding = forcedBinding ?? (aliases.includes('default') ? 'default' : target.name);
    const origin = this.origin(inventory.path)!;
    const ordinary = this.inputs.areas.find(area => area.owner === inventory.owner && area.kind === 'ordinary')!;
    const id: OriginalId = { kind: 'resource', owner: inventory.owner, file: relative(resolve(this.root, ordinary.root), resolve(this.root, inventory.path)), binding };
    const declarations = target.declarations.flatMap(handle => { const node = handle.resolve(this.project); return node ? [this.location(node)] : []; });
    // Resource locations describe the effective declaration; identity and area
    // still belong to the resource rather than that declaration's owner.
    this.originals.set(originalKey(id), { id, origin, declarations,
      hasValue: forcedBinding === 'default' || Boolean(target.flags & SymbolFlags.Value), hasType: Boolean(target.flags & SymbolFlags.Type) });
    return { name, original: id, namespace: null, forwarding: [] };
  }
  private moduleSpecifier(node: Node): Node | null {
    for (let current: Node = node; current.kind !== SyntaxKind.SourceFile; current = current.parent) {
      if (isImportDeclaration(current) || isExportDeclaration(current)) return current.moduleSpecifier ?? null;
    }
    return null;
  }
  private selectedName(node: Node): string | null {
    if (isExportSpecifier(node) || isImportSpecifier(node)) return (node.propertyName ?? node.name).text;
    if (isImportClause(node)) return 'default';
    if (isNamespaceImport(node)) return null;
    return null;
  }
  private export(symbol: CompilerSymbol, name: string, file: MutableFile, depth: number,
    chain: readonly SourceOrigin[] = [], seen = new Set<number>()): CatalogExport {
    this.check(depth);
    if (seen.has(symbol.id) || this.project.checker.isUnknownSymbol(symbol)) {
      this.limit(file, 'unresolved-original', `Cannot resolve original for export ${name}`);
      return { name, original: null, namespace: null, forwarding: chain };
    }
    const nextSeen = new Set(seen).add(symbol.id);
    if (symbol.flags & SymbolFlags.Alias) {
      const forwarding = [...chain];
      for (const handle of symbol.declarations) {
        const node = handle.resolve(this.project);
        if (!node) continue;
        const own = this.origin(relative(this.root, handle.path));
        if (own && !forwarding.some(origin => origin.file === own.file)) forwarding.push(own);
        const specifier = this.moduleSpecifier(node);
        if (specifier) {
          const target = this.resolution.module(specifier);
          if (target.resource) {
            const resource = this.file(target.resource.path, depth + 1);
            if (resource.state !== 'complete') this.limit(file, 'incomplete-exports', 'Resource has an incomplete effective export description', node);
            if (resource.state === 'ambiguous') return { name, original: null, namespace: null, forwarding };
            const selected = this.selectedName(node);
            if (selected === null) return { name, original: null, namespace: resource.exports, forwarding };
            const member = resource.exports.find(item => item.name === selected);
            if (member) return { ...member, name, forwarding: [...forwarding, ...member.forwarding] };
            this.limit(file, 'unresolved-original', `Resource export ${selected} is absent from its effective description`, node);
            return { name, original: null, namespace: null, forwarding };
          }
          const selected = this.selectedName(node);
          if (target.kind === 'application' && target.file && selected !== null && !this.active.has(target.file)) {
            const targetFile = this.file(target.file, depth + 1);
            const entry = targetFile.exports.find(entry => entry.name === selected);
            if (!entry || (!entry.original && !entry.namespace)) {
              this.limit(file, targetFile.state === 'ambiguous' ? 'ambiguous-original' : 'unresolved-original',
                `Cannot establish selected export ${selected} of ${target.file}`, node);
              return { name, original: null, namespace: null, forwarding };
            }
            const origins = [...forwarding, ...entry.forwarding];
            return { ...entry, name, forwarding: origins.filter((origin, index) => origins.findIndex(item => item.file === origin.file) === index) };
          }
          if (target.kind === 'resource-target' || target.kind === 'unresolved') {
            this.limit(file, target.kind === 'resource-target' ? 'resource-target' : 'unresolved-target', `Cannot establish target for export ${name}`, specifier);
            return { name, original: null, namespace: null, forwarding };
          }
          if (target.kind === 'outside-module' || target.kind === 'external') {
            this.limit(file, target.kind === 'outside-module' ? 'outside-module-target' : 'unresolved-original',
              target.kind === 'external' ? `Export ${name} forwards a compiler-resolved external dependency` : `Export ${name} targets source outside owned modules`, specifier);
            return { name, original: null, namespace: null, forwarding };
          }
        }
        // A local export alias can first refer to an imported binding. Preserve
        // that import declaration before the compiler collapses all aliases.
        if (isExportSpecifier(node) && !specifier) {
          const local = this.project.checker.getExportSpecifierLocalTargetSymbol(node);
          if (local && local.id !== symbol.id) return this.export(local, name, file, depth + 1, forwarding, nextSeen);
        }
      }
      const target = this.project.checker.getImmediateAliasedSymbol(symbol);
      if (target) return this.export(target, name, file, depth + 1, forwarding, nextSeen);
      this.limit(file, 'unresolved-original', `Cannot follow alias for export ${name}`);
      return { name, original: null, namespace: null, forwarding };
    }
    const declarations = symbol.declarations.flatMap(handle => { const node = handle.resolve(this.project); return node ? [node] : []; });
    for (const declaration of declarations) {
      if (!('name' in declaration) || !declaration.name) continue;
      const nameNode = declaration.name as Node;
      const location = this.location(nameNode);
      if (this.bindingProblems.get(location.file)?.some(problem => problem.start < location.end && problem.end > location.start)) {
        this.limit(file, 'ambiguous-original', `Compiler could not establish a unique binding for export ${name}`, nameNode);
        return { name, original: null, namespace: null, forwarding: chain };
      }
    }
    const moduleSource = declarations.find(node => node.kind === SyntaxKind.SourceFile);
    if (moduleSource) {
      const path = relative(this.root, moduleSource.getSourceFile().fileName);
      const target = this.resolution.files.get(resolve(this.root, path));
      if (target?.kind === 'source') {
        if (this.active.has(path)) {
          this.limit(file, 'incomplete-exports', `Recursive namespace ${name} exceeds a finite export description`, moduleSource);
          return { name, original: null, namespace: null, forwarding: chain };
        }
        const nested = this.file(path, depth + 1);
        if (nested.state !== 'complete') this.limit(file, 'incomplete-exports', `Namespace ${name} has an incomplete export description`, moduleSource);
        return { name, original: null, namespace: nested.exports, forwarding: chain };
      }
    }
    const locations = declarations.map(node => this.location(node));
    const origins = locations.map(location => this.origin(location.file));
    const keys = new Set(origins.map(origin => origin ? `${origin.area.owner}:${origin.area.kind}` : '<outside>'));
    if (!declarations.length || origins.some(origin => !origin)) {
      this.limit(file, 'unresolved-original', `Export ${name} has no single application-owned original`, declarations[0], locations);
      return { name, original: null, namespace: null, forwarding: chain };
    }
    if (keys.size !== 1) {
      this.limit(file, 'ambiguous-original', `Export ${name} has declarations in different owners or source areas`, declarations[0], locations);
      return { name, original: null, namespace: null, forwarding: chain };
    }
    const sorted = [...declarations].sort((a, b) => order(this.location(a).file, this.location(b).file) || a.getStart() - b.getStart());
    const node = sorted[0], origin = this.origin(this.location(node).file)!;
    const ordinary = this.inputs.areas.find(area => area.owner === origin.area.owner && area.kind === 'ordinary')!;
    const id: OriginalId = { kind: 'code', owner: origin.area.owner,
      file: relative(resolve(this.root, ordinary.root), resolve(this.root, origin.file)), binding: this.binding(node, symbol) };
    this.originals.set(originalKey(id), { id, origin, declarations: locations.sort((a, b) => order(a.file, b.file) || a.start - b.start),
      hasValue: Boolean(symbol.flags & SymbolFlags.Value), hasType: Boolean(symbol.flags & SymbolFlags.Type) });
    let namespace: CatalogExport[] | null = null;
    if (symbol.flags & SymbolFlags.Namespace) namespace = this.project.checker.getExportsOfModule(symbol).map(member => {
      this.check(depth, true); return this.export(member, member.name, file, depth + 1, chain, nextSeen);
    });
    return { name, original: id, namespace, forwarding: chain };
  }
  private binding(node: Node, symbol: CompilerSymbol): string {
    const parts: string[] = [];
    if (isExportAssignment(node)) parts.push('#default');
    else if ('name' in node && node.name && (isIdentifier(node.name as Node) || isStringLiteral(node.name as Node))) parts.push((node.name as { text: string }).text);
    else parts.push(symbol.name === 'default' ? '#default' : symbol.name);
    for (let parent = node.parent; parent.kind !== SyntaxKind.SourceFile; parent = parent.parent) {
      if (isModuleDeclaration(parent)) parts.unshift(parent.name.text);
    }
    return parts.join('/');
  }
  private stars(source: SourceFile, file: MutableFile, depth: number): void {
    const explicit = new Set<string>();
    for (const symbol of this.project.checker.getExportsOfModule(this.project.checker.getSymbolAtLocation(source)!)) {
      if (symbol.declarations.some(handle => resolve(handle.path) === resolve(source.fileName))) explicit.add(symbol.name);
    }
    const candidates = new Map<string, CatalogExport[]>();
    for (const statement of source.statements) {
      if (!isExportDeclaration(statement) || statement.exportClause || !statement.moduleSpecifier) continue;
      const target = this.resolution.module(statement.moduleSpecifier);
      if (target.kind !== 'application' || !target.file) {
        this.limit(file, target.kind === 'outside-module' ? 'outside-module-target' : target.kind === 'resource-target' ? 'resource-target' : 'incomplete-exports',
          'Cannot enumerate every application original of this star export', statement.moduleSpecifier); continue;
      }
      // Cycles do not make finite named exports invalid. Native enumeration
      // supplies known members; avoid recursing into the currently active file.
      const nested = this.file(target.file, depth + 1);
      if (nested.state !== 'complete') this.limit(file, nested.state === 'ambiguous' ? 'ambiguous-original' : 'incomplete-exports', 'Star target has an incomplete export description', statement.moduleSpecifier);
      for (const entry of nested.exports) {
        if (entry.name === 'default' || explicit.has(entry.name)) continue;
        const group = candidates.get(entry.name) ?? []; group.push(entry); candidates.set(entry.name, group);
      }
    }
    for (const [name, entries] of candidates) {
      const keys = new Set(entries.map(entry => entry.original ? originalKey(entry.original) : JSON.stringify(entry.namespace)));
      const index = file.exports.findIndex(entry => entry.name === name);
      if (keys.size > 1) {
        this.limit(file, 'ambiguous-original', `Star exports supply distinct originals named ${name}`, source);
        const entry = { name, original: null, namespace: null, forwarding: [] };
        if (index >= 0) file.exports[index] = entry; else file.exports.push(entry);
      } else if (index >= 0) {
        const current = this.origin(file.file)!;
        const origins = [current, ...entries.flatMap(entry => entry.forwarding)];
        file.exports[index] = { ...entries[0], forwarding: origins.filter((origin, index) => origins.findIndex(item => item.file === origin.file) === index) };
      }
    }
  }
}
