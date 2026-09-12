import { relative, resolve } from 'node:path';
import { SymbolFlags, TypeFlags, type Project, type Symbol as CompilerSymbol, type Diagnostic } from 'typescript/unstable/sync';
import { SyntaxKind, isExportDeclaration, isExportSpecifier, isImportDeclaration,
  isImportSpecifier, isImportClause, isNamespaceImport,
  isModuleDeclaration, isIdentifier, isStringLiteral, isExportAssignment, isCallExpression, isImportTypeNode, isLiteralTypeNode,
  isVariableStatement, isFunctionDeclaration, isClassDeclaration, isEnumDeclaration, isInterfaceDeclaration, isTypeAliasDeclaration,
  type Node, type SourceFile } from 'typescript/unstable/ast';
import { originalKey } from '../../model/src/identity.js';
import type { OriginalId, SourceArea, SourceLocation, SourceOrigin } from '../../model/src/interfaces/model.js';
import type { InventoryFile, ProjectInventory } from '../../project/src/interfaces/project.js';
import type { CatalogDelta, CatalogOriginal, CatalogExport, DescriptionDependencies, FileDescription,
  FileExports, SourceCatalog, SourceLimit, SourceWorkLimits } from './interfaces/source.js';
import { Resolution, type CatalogHost } from './resolution.js';
import { SourceFailure } from './wire.js';

interface Inputs { readonly inventory: ProjectInventory; readonly areas: readonly SourceArea[]; readonly limits: SourceWorkLimits }
interface MutableFile { file: string; state: FileExports['state']; exports: CatalogExport[]; issueIds: string[]; descriptionFiles: string[] }
interface Selection { file: string; name: string; node: Node }
interface Stars { source: SourceFile; explicit: Set<string>; targets: { file: string; node: Node; typeOnly: boolean }[] }
interface MutableDependencies { files: Set<string>; resources: Set<string>; shims: Set<string>; probed: Map<string, boolean> }
const order = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const sorted = (values: Iterable<string>): readonly string[] => [...new Set(values)].sort(order);

/** One file's description together with the extraction facts a later round needs
 * to treat it as a resolved leaf without re-reading it from the compiler. */
export interface FileRecord {
  readonly description: FileDescription;
  /** The file's state before the selection and propagation fixed point ran. */
  readonly extractionState: FileExports['state'];
  readonly runtime: readonly (readonly [string, boolean])[];
  readonly namespaceModules: readonly (readonly [string, string])[];
  readonly bindingProblems: readonly SourceLocation[];
  /** Files whose own content, not their description, shaped this one: the
   * importers reaching a resource and the source augmenting a module. */
  readonly contributors: readonly string[];
  /** The descriptions this file's content shaped in the same way. */
  readonly contributions: readonly string[];
}
export interface DescribedRound {
  /** The files described afresh: the selection and everything its extraction reached. */
  readonly records: ReadonlyMap<string, FileRecord>;
  /** Originals and notes belonging to files this round did not describe. */
  readonly foreignOriginals: readonly CatalogOriginal[];
  readonly foreignCoverage: readonly SourceLimit[];
}

/** Called only in the supervised helper. The returned records contain no native
 * compiler handles; every identity comes from declarations and captured owners. */
export function describeRound(project: Project, inputs: Inputs, host: CatalogHost, runtime: Map<CatalogExport, boolean>,
  selected: ReadonlySet<string>, retained: ReadonlyMap<string, FileRecord>): DescribedRound {
  return new CatalogBuilder(project, inputs, host, runtime, selected, retained).build();
}

/** The whole-project catalog is the assembly of every owned file's description. */
export function buildCatalog(project: Project, inputs: Inputs, host: CatalogHost, runtime: Map<CatalogExport, boolean>): SourceCatalog {
  const selected = new Set(inputs.inventory.files.map(file => file.path));
  const round = describeRound(project, inputs, host, runtime, selected, new Map());
  return assembleCatalog([...round.records.values()].map(record => record.description));
}

/** Plain-data assembly; it reads descriptions only and holds no compiler state. */
export function assembleCatalog(descriptions: readonly FileDescription[]): SourceCatalog {
  const retained = new Set<string>();
  const retain = (entry: CatalogExport): void => {
    if (entry.original) retained.add(originalKey(entry.original));
    entry.namespace?.forEach(retain);
  };
  for (const description of descriptions) description.exports.exports.forEach(retain);
  const originals = new Map<string, CatalogOriginal>();
  const coverage = new Map<string, SourceLimit>();
  for (const description of descriptions) {
    for (const original of description.originals) {
      const key = originalKey(original.id);
      if (retained.has(key)) originals.set(key, original);
    }
    for (const issue of description.coverage) if (!coverage.has(issue.id)) coverage.set(issue.id, issue);
  }
  return {
    originals: [...originals.values()].sort((a, b) => order(originalKey(a.id), originalKey(b.id))),
    files: [...descriptions].sort((a, b) => order(a.file, b.file)).map(description => description.exports),
    coverage: [...coverage.values()].sort((a, b) => order(a.location.file, b.location.file)
      || a.location.start - b.location.start || order(a.id, b.id)),
  };
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
  private readonly resolutionDiagnostics = new Map<string, readonly Diagnostic[]>();
  private readonly selections = new Map<CatalogExport, Selection>();
  private readonly starTargets = new Map<string, Stars>();
  private readonly namespaceTargets: { file: MutableFile; target: string; name: string; node: Node }[] = [];
  private readonly root: string;
  private readonly dependencies = new Map<string, MutableDependencies>();
  private readonly contributors = new Map<string, string[]>();
  private readonly contributions = new Map<string, string[]>();
  private readonly namespaceModules = new Map<readonly CatalogExport[], string>();
  private readonly entryModules = new WeakMap<CatalogExport, string>();
  private readonly referenced = new Set<string>();
  private readonly extractionStates = new Map<string, FileExports['state']>();
  private readonly reporters = new Map<string, string>();
  private readonly ownedPaths: ReadonlySet<string>;
  private describing: string | null = null;
  /** The specifier scan looks for resource descriptions only, so the files and
   * probes it resolves are not edges of the describing file's own exports. */
  private scanning = false;
  constructor(private readonly project: Project, private readonly inputs: Inputs, private readonly host: CatalogHost,
    private readonly runtime: Map<CatalogExport, boolean>,
    private readonly selected: ReadonlySet<string>, private readonly retained: ReadonlyMap<string, FileRecord>) {
    this.root = inputs.inventory.scope.root;
    this.resolution = new Resolution(project, inputs.inventory, host);
    this.ownedPaths = new Set(inputs.inventory.files.map(file => file.path));
    // Retained problems belong to files this round does not read again; their
    // positions are those of the unchanged source the records were taken from.
    for (const [path, record] of retained) {
      if (!selected.has(path)) this.bindingProblems.set(path, record.bindingProblems);
    }
    this.resolution.onCandidate = (path, existing) => this.probe(path, existing);
  }
  /** Record what resolution looked at while describing the current file. */
  private probe(path: string, existing?: boolean): void {
    if (!this.describing || this.scanning) return;
    const dependencies = this.dependencyRecord(this.describing);
    const owned = this.resolution.files.get(resolve(path));
    if (owned) {
      if (owned.path !== this.describing) (owned.kind === 'resource' ? dependencies.resources : dependencies.files).add(owned.path);
      dependencies.probed.set(path, true);
      return;
    }
    // An unprobed candidate is recorded as absent: creating a file there can
    // change the resolution that read it, which is what the edge must catch.
    if (existing === true) { dependencies.probed.set(path, true); return; }
    if (!dependencies.probed.get(path)) dependencies.probed.set(path, false);
  }
  private dependencyRecord(file: string): MutableDependencies {
    let record = this.dependencies.get(file);
    if (!record) {
      record = { files: new Set(), resources: new Set(), shims: new Set(), probed: new Map() };
      this.dependencies.set(file, record);
    }
    return record;
  }
  /** Resolve a specifier and record the owned files, resources and absent paths
   * the description of the file being read therefore depends on. */
  private target(node: Node): ReturnType<Resolution['module']> {
    const resolved = this.resolution.module(node);
    if (this.describing && resolved.kind === 'application' && resolved.file) {
      const dependencies = this.dependencyRecord(this.describing);
      if (resolved.resource) {
        dependencies.resources.add(resolved.file);
        this.contribute(this.describing, resolved.file);
      } else if (!this.scanning && resolved.file !== this.describing) dependencies.files.add(resolved.file);
    }
    return resolved;
  }
  /** Record that one file's content shapes another file's description. */
  private contribute(source: string, target: string): void {
    if (source === target) return;
    const contributors = this.contributors.get(target) ?? [];
    if (!contributors.includes(source)) contributors.push(source);
    this.contributors.set(target, contributors);
    const contributions = this.contributions.get(source) ?? [];
    if (!contributions.includes(target)) contributions.push(target);
    this.contributions.set(source, contributions);
  }
  private shim(file: MutableFile, path: string): void {
    this.dependencyRecord(file.file).shims.add(this.local(path));
  }
  /** Dependencies outside the root cannot be named relative to it. */
  private local(path: string): string {
    const relativePath = relative(this.root, path);
    return relativePath.startsWith('..') ? `external:${resolve(path)}` : relativePath;
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
    related: readonly SourceLocation[] = [], compilerCode?: number, precise?: SourceLocation, affectsExports = true): void {
    const location = precise ?? (node ? this.location(node) : this.at(file.file));
    // Synthetic witness names are implementation inputs, never report locations.
    const reported = resolve(this.root, location.file) === this.host.resourceWitness ? this.at(file.file) : location;
    const key = JSON.stringify([code, reported.file, reported.start, message]);
    let issue = this.coverage.find(issue => issue.id === key);
    if (!issue) {
      if (this.coverage.length >= 100_000) throw new SourceFailure('resource-limit', 'Source coverage record limit exceeded');
      issue = { id: key, code, message, location: reported, related, ...(compilerCode === undefined ? {} : { compilerCode }) };
      this.coverage.push(issue); this.reporters.set(key, file.file);
    }
    if (!file.issueIds.includes(key)) file.issueIds.push(key);
    if (code === 'ambiguous-original') file.state = 'ambiguous';
    else if (affectsExports && file.state === 'complete') file.state = 'incomplete';
  }
  private check(depth: number, record = false): void {
    if (depth > this.inputs.limits.maxForwardingDepth) throw new SourceFailure('resource-limit', 'Source forwarding depth limit exceeded');
    if (record && ++this.count > this.inputs.limits.maxExports) throw new SourceFailure('resource-limit', 'Source export record limit exceeded');
  }
  private unresolvedCompilerTarget(file: MutableFile, specifier: Node): void {
    const source = specifier.getSourceFile();
    // Resolution errors are semantic diagnostics in the pinned native API.
    // Request them only after a forwarding target failed resolution, and keep
    // only the diagnostics on that target. Unrelated type errors are outside
    // this checker and never become architectural findings.
    let diagnostics = this.resolutionDiagnostics.get(source.fileName);
    if (!diagnostics) {
      diagnostics = this.project.program.getSemanticDiagnostics(source.fileName);
      this.resolutionDiagnostics.set(source.fileName, diagnostics);
    }
    const start = specifier.getStart();
    for (const diagnostic of diagnostics) {
      if (diagnostic.pos >= specifier.end || diagnostic.end <= start) continue;
      const point = source.getLineAndCharacterOfPosition(diagnostic.pos);
      this.limit(file, 'compiler-blocked', `Compiler could not resolve this forwarding target (TS${diagnostic.code})`, undefined, [], diagnostic.code,
        { file: file.file, start: diagnostic.pos, end: diagnostic.end, line: point.line + 1, column: point.character + 1 });
    }
  }
  private runtimeMembers(module: CompilerSymbol, at: Node, entries: readonly CatalogExport[]): void {
    const type = this.project.checker.getTypeOfSymbolAtLocation(module, at);
    if (type.isErrorType() || type.flags & (TypeFlags.Any | TypeFlags.Unknown)) return;
    const members = new Set(this.project.checker.getPropertiesOfType(type).map(symbol => symbol.name));
    for (const entry of entries) this.runtime.set(entry, members.has(entry.name));
  }
  build(): DescribedRound {
    this.scan();
    for (const file of [...this.inputs.inventory.files].sort((a, b) => order(a.path, b.path))) {
      if (this.selected.has(file.path)) this.file(file.path, 0);
    }
    for (const [path, file] of this.files) this.extractionStates.set(path, file.state);
    this.resolveExports();
    return this.records();
  }

  /** The compiler resolves resource descriptions both in actual source and in an
   * unexecuted witness, so unimported resource exports remain catalogued. Every
   * specifier reaching a resource contributes to its effective description, so a
   * round describing one reads its recorded importers as well as the selection. */
  private scan(): void {
    const resources = new Set([...this.selected].filter(path =>
      this.resolution.files.get(resolve(this.root, path))?.kind === 'resource'));
    const importers = new Set<string>();
    if (resources.size) {
      for (const [path, record] of this.retained) {
        if (record.description.dependencies.resources.some(resource => resources.has(resource))) importers.add(path);
      }
    }
    const owned = this.inputs.inventory.files.filter(file => file.kind === 'source'
      && (this.selected.has(file.path) || importers.has(file.path)));
    // Extraction can also reach a resource through a selected file that
    // forwards it, and the witness is one of its describing specifiers.
    const witness = resources.size > 0 || [...this.selected].some(path => {
      const record = this.retained.get(path);
      return !record || record.description.dependencies.resources.length > 0;
    });
    const sourceFiles = [...owned.map(file => resolve(this.root, file.path)), ...(witness ? [this.host.resourceWitness] : [])];
    for (const path of sourceFiles) {
      const source = this.project.program.getSourceFile(path);
      if (!source) continue;
      const visited = new Set<string>();
      const visit = (node: Node): void => {
        const key = `${node.kind}:${node.pos}:${node.end}`;
        if (visited.has(key)) return;
        visited.add(key);
        const specifier = isImportDeclaration(node) || isExportDeclaration(node) ? node.moduleSpecifier
          : isCallExpression(node) && node.expression.kind === SyntaxKind.ImportKeyword ? node.arguments[0]
          : isImportTypeNode(node) && isLiteralTypeNode(node.argument) ? node.argument.literal : undefined;
        if (specifier && isStringLiteral(specifier)) {
          const target = this.target(specifier);
          if (target.resource && target.module) {
            const descriptions = this.resourceModules.get(target.resource.path) ?? [];
            if (!descriptions.some(symbol => symbol.id === target.module!.id)) descriptions.push(target.module);
            this.resourceModules.set(target.resource.path, descriptions);
          }
        }
        for (const doc of (node as Node & { jsDoc?: readonly Node[] }).jsDoc ?? []) visit(doc);
        node.forEachChild(child => { visit(child); });
      };
      this.describing = this.resolution.files.get(path)?.path ?? null;
      this.scanning = true;
      try { visit(source); } finally { this.describing = null; this.scanning = false; }
    }
  }

  /** Split the round's facts by the file each belongs to. Native star enumeration
   * may temporarily supply one conflicting winner, so which originals are facts
   * is settled by the assembly over every description, not per file. */
  private records(): DescribedRound {
    const originalsByFile = new Map<string, CatalogOriginal[]>();
    const coverageByFile = new Map<string, SourceLimit[]>();
    const foreignOriginals: CatalogOriginal[] = [];
    const foreignCoverage: SourceLimit[] = [];
    const into = <T>(index: Map<string, T[]>, file: string, value: T): void => {
      const values = index.get(file) ?? [];
      values.push(value); index.set(file, values);
    };
    for (const original of this.originals.values()) {
      if (this.files.has(original.origin.file)) into(originalsByFile, original.origin.file, original);
      else foreignOriginals.push(original);
    }
    for (const issue of this.coverage) {
      const located = issue.location.file;
      // A note outside every owned file belongs to the description that found it.
      if (this.files.has(located)) into(coverageByFile, located, issue);
      else if (this.ownedPaths.has(located)) foreignCoverage.push(issue);
      else into(coverageByFile, this.reporters.get(issue.id)!, issue);
    }
    const records = new Map<string, FileRecord>();
    for (const [path, file] of [...this.files].sort((a, b) => order(a[0], b[0]))) {
      const dependencies = this.dependencyRecord(path);
      const exports: FileExports = { file: file.file, state: file.state,
        exports: file.exports.sort((a, b) => order(a.name, b.name)),
        issueIds: file.issueIds.sort(order), descriptionFiles: file.descriptionFiles.sort(order) };
      const runtime: (readonly [string, boolean])[] = [];
      const namespaceModules: (readonly [string, string])[] = [];
      const walk = (entries: readonly CatalogExport[], prefix: readonly string[]): void => {
        for (const entry of entries) {
          const names = [...prefix, entry.name], key = JSON.stringify(names);
          const value = this.runtime.get(entry);
          if (value !== undefined) runtime.push([key, value]);
          if (!entry.namespace) continue;
          const module = this.moduleOf(entry);
          if (module) namespaceModules.push([key, module]);
          walk(entry.namespace, names);
        }
      };
      walk(exports.exports, []);
      // A description that embeds another module's namespace depends on it,
      // including when a retained leaf supplied that namespace.
      for (const [, module] of namespaceModules) if (module !== path) dependencies.files.add(module);
      records.set(path, {
        description: {
          file: path, exports,
          originals: (originalsByFile.get(path) ?? []).sort((a, b) => order(originalKey(a.id), originalKey(b.id))),
          coverage: (coverageByFile.get(path) ?? []).sort((a, b) => a.location.start - b.location.start || order(a.id, b.id)),
          dependencies: {
            // Every specifier reaching a resource contributes to its effective
            // description, so those importers are dependencies of that record.
            files: sorted([...dependencies.files, ...(this.contributors.get(path) ?? [])]),
            resources: sorted(dependencies.resources),
            shims: sorted(dependencies.shims),
            absent: sorted([...dependencies.probed].filter(([, existing]) => !existing).map(([probed]) => this.local(probed))),
          },
        },
        extractionState: this.extractionStates.get(path) ?? file.state,
        runtime, namespaceModules,
        bindingProblems: this.bindingProblems.get(path) ?? [],
        contributors: sorted(this.contributors.get(path) ?? []),
        contributions: sorted(this.contributions.get(path) ?? []),
      });
    }
    return { records, foreignOriginals, foreignCoverage };
  }

  /** The owned module a namespace description forwards, when it has one. */
  private moduleOf(entry: CatalogExport): string | undefined {
    return (entry.namespace && this.namespaceModules.get(entry.namespace)) || this.entryModules.get(entry);
  }

  /** Retained files a described file selects from, as resolved leaves. */
  private leaves(): ReadonlySet<string> {
    const leaves = new Set<string>();
    for (const path of this.files.keys()) {
      for (const dependency of this.dependencies.get(path)?.files ?? []) {
        if (!this.files.has(dependency) && this.retained.has(dependency)) leaves.add(dependency);
      }
    }
    return leaves;
  }
  /** A note always belongs to a description this round actually read. */
  private reporting(definition: { file: MutableFile | null; entry: CatalogExport }): MutableFile {
    if (!definition.file) throw new SourceFailure('unavailable', `No described file reports on export ${definition.entry.name}`);
    return definition.file;
  }
  /** Live description of a file this round described, or the retained leaf. */
  private view(path: string): { readonly exports: readonly CatalogExport[]; readonly state: FileExports['state'] } | undefined {
    return this.files.get(path) ?? this.retained.get(path)?.description.exports;
  }
  /** Completeness of a propagation target this round must know about. */
  private stateOf(path: string): FileExports['state'] {
    const view = this.view(path);
    if (!view) throw new SourceFailure('unavailable', `No described or retained export description for ${path}`);
    return view.state;
  }
  private file(path: string, depth: number): MutableFile {
    const previous = this.files.get(path);
    if (previous) return previous;
    this.check(depth);
    const file: MutableFile = { file: path, state: 'complete', exports: [], issueIds: [], descriptionFiles: [] };
    this.files.set(path, file); this.active.add(path);
    const inventory = this.resolution.files.get(resolve(this.root, path));
    if (!inventory) throw new Error(`Catalog requested non-owned file ${path}`);
    // Extraction reaches namespace and resource targets, so every dependency is
    // recorded for the description being read rather than the one that asked.
    const outer = this.describing;
    this.describing = path;
    try {
    if (inventory.kind === 'resource') this.resource(file, inventory, depth);
    else {
      const source = this.project.program.getSourceFile(resolve(this.root, path));
      if (!source) this.limit(file, 'compiler-blocked', 'Owned source was not loaded by the configured compiler');
      else {
        // Parsing/binding is needed to establish declarations. Resolution
        // failures request their own narrowly located diagnostic evidence.
        const bindingDiagnostics = this.project.program.getBindDiagnostics(source.fileName);
        this.bindingProblems.set(path, bindingDiagnostics.map(diagnostic => ({ ...this.at(path), start: diagnostic.pos, end: diagnostic.end })));
        for (const diagnostic of [...this.project.program.getSyntacticDiagnostics(source.fileName), ...bindingDiagnostics]) {
          const start = Math.max(0, diagnostic.pos);
          const point = source.getLineAndCharacterOfPosition(start);
          const location = { file: path, start, end: Math.max(start, diagnostic.end), line: point.line + 1, column: point.character + 1 };
          this.limit(file, 'compiler-blocked', `Compiler could not establish an unambiguous declaration (TS${diagnostic.code})`, undefined, [], diagnostic.code, location);
        }
        const module = this.project.checker.getSymbolAtLocation(source);
        if (module || source.externalModuleIndicator) this.sharedAugmentations(source, file);
        if (module) {
          for (const symbol of this.project.checker.getExportsOfModule(module)) {
            this.check(depth, true); file.exports.push(this.export(symbol, symbol.name, file, depth + 1));
          }
          this.runtimeMembers(module, source, file.exports);
          this.stars(source, file, depth + 1);
        } else if (source.externalModuleIndicator) this.limit(file, 'incomplete-exports', 'Compiler did not supply an export description for this module', source);
        else this.sharedGlobals(source, file);
      }
    }
    } finally { this.describing = outer; }
    this.active.delete(path);
    return file;
  }
  /** The compiler distinguishes global augmentations from ordinary namespaces
   * named global and string-named external module augmentations. */
  private sharedAugmentations(source: SourceFile, file: MutableFile): void {
    // A string-named augmentation of an owned module adds exports and
    // declarations to that module's description, not to this file's.
    for (const name of source.moduleAugmentations) {
      if (!isStringLiteral(name)) continue;
      const augmented = this.target(name);
      if (augmented.kind === 'application' && augmented.file && !augmented.resource) this.contribute(file.file, augmented.file);
    }
    const declarations = source.moduleAugmentations
      .filter(name => isIdentifier(name) && name.text === 'global' && isModuleDeclaration(name.parent))
      .map(name => name.parent);
    if (!declarations.length) return;
    this.limit(file, 'shared-global', 'Module source declares shared globals; their ownership and cross-owner dependencies are not verified',
      declarations[0], declarations.slice(1).map(statement => this.location(statement)), undefined, undefined, false);
  }
  /** A script's top-level declarations bind globals every owner can read. No
   * request form represents that ownership or another owner's reads, so the
   * script cannot claim complete coverage. String-named ambient modules are
   * resource shims or external descriptions and follow their own rules. */
  private sharedGlobals(source: SourceFile, file: MutableFile): void {
    const declarations = source.statements.filter(statement => isVariableStatement(statement) || isFunctionDeclaration(statement)
      || isClassDeclaration(statement) || isEnumDeclaration(statement) || isInterfaceDeclaration(statement) || isTypeAliasDeclaration(statement)
      || (isModuleDeclaration(statement) && isIdentifier(statement.name)));
    if (!declarations.length) return;
    this.limit(file, 'shared-global', 'Script source declares shared globals; their ownership and cross-owner dependencies are not verified',
      declarations[0], declarations.slice(1).map(statement => this.location(statement)));
  }
  private resource(file: MutableFile, inventory: InventoryFile, depth: number): void {
    const modules = this.resourceModules.get(inventory.path) ?? [];
    if (!modules.length) { this.limit(file, 'resource-description', 'No effective compiler export description for the existing resource'); return; }
    const alternatives: CatalogExport[][] = [];
    const signatures: string[] = [];
    for (const module of modules) {
      const names = [...this.project.checker.getExportsOfModule(module)];
      // JSON has a synthetic ESM default supplied by TypeScript's module type,
      // while getExportsOfModule enumerates its named properties only.
      const json = inventory.path.endsWith('.json');
      const entries = names.map(symbol => this.resourceExport(symbol, symbol.name, file, inventory, depth + 1));
      if (json && !entries.some(entry => entry.name === 'default')) entries.push(this.resourceExport(module, 'default', file, inventory, depth + 1, 'default'));
      alternatives.push(entries);
      // Compare each effective description before another description supplies
      // facts for the same canonical resource binding. Equal export names do
      // not establish agreement on value/type existence.
      signatures.push(JSON.stringify(entries.map(entry => {
        const original = entry.original && this.originals.get(originalKey(entry.original));
        return [entry.name, entry.original, original && [original.hasValue, original.hasType]];
      }).sort((a, b) => order(String(a[0]), String(b[0])))));
      for (const handle of module.declarations) {
        const declaration = handle.resolve(this.project);
        if (!declaration) continue;
        const path = relative(this.root, declaration.getSourceFile().fileName);
        this.shim(file, declaration.getSourceFile().fileName);
        if (!file.descriptionFiles.includes(path)) file.descriptionFiles.push(path);
      }
    }
    file.exports = alternatives[0];
    if (signatures.some(signature => signature !== signatures[0])) {
      this.limit(file, 'ambiguous-original', 'Conflicting effective export descriptions for one resource');
      // Neither named declarations nor forwarding may ground permissions in
      // the arbitrarily first description when its binding facts conflict.
      file.exports = file.exports.map(entry => ({ ...entry, original: null }));
    }
  }
  private resourceExport(symbol: CompilerSymbol, name: string, file: MutableFile, inventory: InventoryFile, depth: number, forcedBinding?: string): CatalogExport {
    this.check(depth, true);
    const target = symbol.flags & SymbolFlags.Alias ? this.project.checker.getAliasedSymbol(symbol) : symbol;
    if (this.project.checker.isUnknownSymbol(target)) {
      this.limit(file, 'unresolved-original', `Cannot resolve resource export ${name}`);
      return { name, original: null, namespace: null, forwarding: [] };
    }
    // Only compiler-proven aliases share a resource binding. Different package
    // originals can have the same declaration name, so use the effective alias
    // group's first name, preferring default, rather than that declaration name.
    const module = (this.resourceModules.get(inventory.path) ?? []).find(module => this.project.checker.getExportsOfModule(module).some(item => item.id === symbol.id));
    const aliases = module ? this.project.checker.getExportsOfModule(module).filter(item => {
      const original = item.flags & SymbolFlags.Alias ? this.project.checker.getAliasedSymbol(item) : item;
      return original.id === target.id;
    }).map(item => item.name).sort(order) : [name];
    const binding = forcedBinding ?? (aliases.includes('default') ? 'default' : aliases[0] ?? name);
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
        const own = this.origin(relative(this.root, node.getSourceFile().fileName));
        if (own && !forwarding.some(origin => origin.file === own.file)) forwarding.push(own);
        const specifier = this.moduleSpecifier(node);
        if (specifier) {
          const target = this.target(specifier);
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
          if (target.kind === 'application' && target.file && selected !== null) {
            // A native alias can point at an arbitrary star winner. Resolve the
            // selection only after every file's export dependencies are known.
            const entry: CatalogExport = { name, original: null, namespace: null, forwarding };
            this.selections.set(entry, { file: target.file, name: selected, node });
            return entry;
          }
          if (target.kind === 'resource-target' || target.kind === 'unresolved') {
            this.limit(file, target.kind === 'resource-target' ? 'resource-target' : 'unresolved-target', `Cannot establish target for export ${name}`, specifier);
            this.unresolvedCompilerTarget(file, specifier);
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
        this.namespaceTargets.push({ file, target: nested.file, name, node: moduleSource });
        this.dependencyRecord(file.file).files.add(path);
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
    if (namespace) this.runtimeMembers(symbol, node, namespace);
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
      if (symbol.declarations.some(handle => {
        const declaration = handle.resolve(this.project);
        return declaration && resolve(declaration.getSourceFile().fileName) === resolve(source.fileName);
      })) explicit.add(symbol.name);
    }
    const targets: Stars['targets'] = [];
    for (const statement of source.statements) {
      if (!isExportDeclaration(statement) || statement.exportClause || !statement.moduleSpecifier) continue;
      const target = this.target(statement.moduleSpecifier);
      if (target.kind !== 'application' || !target.file) {
        this.limit(file, target.kind === 'outside-module' ? 'outside-module-target' : target.kind === 'resource-target' ? 'resource-target' : 'incomplete-exports',
          'Cannot enumerate every application original of this star export', statement.moduleSpecifier);
        if (target.kind === 'unresolved' || target.kind === 'resource-target') this.unresolvedCompilerTarget(file, statement.moduleSpecifier);
        continue;
      }
      targets.push({ file: target.file, node: statement.moduleSpecifier, typeOnly: !!statement.isTypeOnly });
    }
    this.starTargets.set(file.file, { source, explicit, targets: targets.sort((a, b) => order(a.file, b.file)) });
    this.check(depth);
  }
  private resolveExports(): void {
    // Grow the finite name sets first. A back edge contributes names, never a
    // partially evaluated original. Explicit exports shadow star candidates.
    let changed = true;
    while (changed) {
      changed = false;
      for (const [path, stars] of this.starTargets) {
        const file = this.files.get(path)!;
        for (const target of stars.targets) for (const entry of this.view(target.file)!.exports) {
          if (entry.name === 'default' || file.exports.some(item => item.name === entry.name)) continue;
          this.check(0, true);
          file.exports.push({ name: entry.name, original: null, namespace: null, forwarding: [] });
          changed = true;
        }
      }
    }
    const key = (file: string, name: string) => JSON.stringify([file, name]);
    interface Definition {
      // A retained leaf has no live file: nothing may report a note against it.
      file: MutableFile | null; entry: CatalogExport; edges: string[] | null; node?: Node;
      forwarding: readonly SourceOrigin[]; ambiguous: boolean;
      runtimeEdges: string[] | null; runtime: boolean | undefined;
    }
    const definitions = new Map<string, Definition>();
    for (const file of this.files.values()) this.namespaceModules.set(file.exports, file.file);
    for (const file of this.files.values()) for (const entry of file.exports) {
      const stars = this.starTargets.get(file.file), selection = this.selections.get(entry);
      if (stars?.targets.length && !stars.explicit.has(entry.name)) {
        definitions.set(key(file.file, entry.name), { file, entry, node: stars.source,
          edges: stars.targets.filter(target => entry.name !== 'default' && this.view(target.file)!.exports.some(item => item.name === entry.name))
            .map(target => key(target.file, entry.name)), forwarding: [this.origin(file.file)!], ambiguous: file.state === 'ambiguous',
          runtime: undefined, runtimeEdges: stars.targets.filter(target => !target.typeOnly && entry.name !== 'default'
            && this.view(target.file)!.exports.some(item => item.name === entry.name)).map(target => key(target.file, entry.name)) });
      } else definitions.set(key(file.file, entry.name), { file, entry,
        edges: selection ? [key(selection.file, selection.name)] : null, node: selection?.node,
        forwarding: entry.forwarding, ambiguous: file.state === 'ambiguous', runtime: this.runtime.get(entry),
        runtimeEdges: selection ? [key(selection.file, selection.name)] : null });
    }
    // A file this round did not describe is a resolved leaf: its retained entry
    // supplies the original, the namespace module, the runtime flag and the
    // ambiguity its own extraction established, and nothing edits it here.
    for (const path of this.leaves()) {
      const record = this.retained.get(path)!;
      const flags = new Map(record.runtime), modules = new Map(record.namespaceModules);
      this.namespaceModules.set(record.description.exports.exports, path);
      for (const entry of record.description.exports.exports) {
        const names = JSON.stringify([entry.name]), module = modules.get(names);
        if (entry.namespace && module) this.entryModules.set(entry, module);
        const value = flags.get(names);
        definitions.set(key(path, entry.name), { file: null, entry, edges: null,
          forwarding: entry.forwarding, ambiguous: record.extractionState === 'ambiguous',
          runtime: value, runtimeEdges: null });
        // The caller's export-path facts belong to this compiler state, so a
        // retained entry's recorded flag replaces whatever the map still holds.
        if (value === undefined) this.runtime.delete(entry); else this.runtime.set(entry, value);
      }
    }
    // Runtime presence belongs to an export path, not its canonical original.
    // The compiler handles named/local type aliases; explicit star edges also
    // matter because the pinned compiler's module type includes type-star keys.
    // Reuse the same finite graph and accept any live path to a value leaf.
    for (const [root, definition] of definitions) {
      const seen = new Set<string>();
      const available = (id: string, depth: number): boolean | undefined => {
        this.check(depth);
        if (seen.has(id)) return false;
        seen.add(id);
        const current = definitions.get(id);
        if (!current) return undefined;
        if (current.runtime === false || current.runtimeEdges === null) return current.runtime;
        const choices = current.runtimeEdges.map(edge => available(edge, depth + 1));
        return choices.includes(true) ? true : choices.includes(undefined) ? undefined : false;
      };
      const value = available(root, 0);
      if (value === undefined) this.runtime.delete(definition.entry);
      else this.runtime.set(definition.entry, value);
    }
    const results = new Map<CatalogExport, CatalogExport>();
    for (const [root, definition] of definitions) {
      if (definition.edges === null) continue;
      const visited = new Set<string>(), candidates = new Map<string, CatalogExport>(), origins = new Map<string, SourceOrigin>();
      let unresolved = false, ambiguous = false;
      // Search the whole reachable selection graph for this name. A visited
      // back edge adds no candidate; its other reachable leaves are still read.
      // Do not memoize a result cut short by another lookup's recursion stack.
      const visit = (id: string, depth: number): void => {
        if (visited.has(id)) return;
        this.check(depth); visited.add(id);
        const current = definitions.get(id);
        if (!current) { unresolved = true; return; }
        for (const origin of current.forwarding) if (!origins.has(origin.file)) origins.set(origin.file, origin);
        if (current.edges !== null) { for (const edge of current.edges) visit(edge, depth + 1); return; }
        const entry = current.entry;
        if (!entry.original && !entry.namespace) {
          unresolved = true; ambiguous ||= current.ambiguous; return;
        }
        const identity = entry.original ? originalKey(entry.original)
          : JSON.stringify(['namespace', this.moduleOf(entry) ?? entry.namespace]);
        candidates.set(identity, entry);
      };
      visit(root, 0);
      ambiguous ||= candidates.size > 1;
      const forwarding = [...origins.values()];
      if (ambiguous || unresolved || candidates.size !== 1) {
        this.limit(this.reporting(definition), ambiguous ? 'ambiguous-original' : 'unresolved-original',
          ambiguous ? `Export paths supply distinct or ambiguous originals named ${definition.entry.name}`
            : `Cannot establish selected export ${definition.entry.name}`, definition.node);
        results.set(definition.entry, { name: definition.entry.name, original: null, namespace: null, forwarding });
      } else {
        const chosen = candidates.values().next().value!;
        const module = this.moduleOf(chosen);
        if (chosen.namespace && module) this.entryModules.set(definition.entry, module);
        results.set(definition.entry, { ...chosen, name: definition.entry.name, forwarding });
      }
    }
    // Apply together so one lookup cannot observe another lookup's tentative
    // result. Namespace forwarding through stars must also retain the finite
    // boundary established during extraction, rather than create a JSON cycle.
    const recursive = (entry: CatalogExport, active = new Set<CatalogExport>(), visited = new Set<CatalogExport>()): boolean => {
      if (active.has(entry)) return true;
      if (visited.has(entry)) return false;
      this.check(active.size); active.add(entry); visited.add(entry);
      const cycle = (results.get(entry) ?? entry).namespace?.some(member => recursive(member, active, visited)) ?? false;
      active.delete(entry);
      return cycle;
    };
    const recursiveEntries = new Set([...results.keys()].filter(entry => recursive(entry)));
    for (const definition of definitions.values()) if (recursiveEntries.has(definition.entry)) {
      this.limit(this.reporting(definition), 'incomplete-exports', `Recursive namespace ${definition.entry.name} exceeds a finite export description`, definition.node);
      const result = results.get(definition.entry)!;
      results.set(definition.entry, { ...result, original: null, namespace: null });
    }
    // Keep the arrays used by nonrecursive namespace descriptions intact.
    for (const [entry, result] of results) Object.assign(entry, result);
    // A named selection that receives a module namespace forwards that module's
    // whole export description, so its completeness follows the module's state.
    for (const definition of definitions.values()) {
      const selection = this.selections.get(definition.entry);
      const module = definition.entry.namespace ? this.moduleOf(definition.entry) : undefined;
      if (selection && module && definition.file) {
        this.namespaceTargets.push({ file: definition.file, target: module, name: definition.entry.name, node: selection.node });
      }
    }
    changed = true;
    while (changed) {
      changed = false;
      for (const [path, stars] of this.starTargets) {
        const file = this.files.get(path)!;
        for (const target of stars.targets) {
          const nested = this.view(target.file)!;
          if (nested.state === 'complete') continue;
          const before = file.state;
          this.limit(file, nested.state === 'ambiguous' ? 'ambiguous-original' : 'incomplete-exports',
            'Star target has an incomplete export description', target.node);
          changed ||= before !== file.state;
        }
      }
      for (const { file, target, name, node } of this.namespaceTargets) {
        if (this.stateOf(target) === 'complete') continue;
        const before = file.state;
        this.limit(file, 'incomplete-exports', `Namespace ${name} has an incomplete export description`, node);
        changed ||= before !== file.state;
      }
    }
  }
}
