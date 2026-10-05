import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { isBuiltin } from 'node:module';
import type { Project, Symbol as CompilerSymbol } from 'typescript/unstable/sync';
import { isStringLiteral, SyntaxKind, type Node } from 'typescript/unstable/ast';
import { classifyProjectPath } from '../../project/src/ownership.js';
import type { ProjectInventory, InventoryFile, ProjectExclusion } from '../../project/src/interfaces/project.js';

export interface CatalogHost {
  fileExists(path: string): boolean;
  readFile(path: string): string | null;
  /** The physical path through every link, or the path itself when it is absent;
   * the same observation the compiler's own realpath callback makes. */
  realpath(path: string): string;
  /** Whether a directory exists, through every link; the compiler's own callback. */
  directoryExists(path: string): boolean;
  readonly resourceWitness: string;
}
export interface ResolvedModule {
  readonly kind: 'application' | 'external' | 'outside-project' | 'nested-tree' | 'excluded'
    | 'unresolved' | 'resource-target';
  readonly module: CompilerSymbol | undefined;
  /** Application: the inventory path. External: the compiler's file. Outside-project,
   * nested-tree and excluded: the physical project-relative path. */
  readonly file: string | null;
  readonly resource: InventoryFile | null;
  /** The declared tree or always-excluded directory of a nested-tree or excluded target. */
  readonly exclusion: ProjectExclusion | null;
}

/** A name ending in one of the eight code extensions: `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` and `.cjs`. */
const codeExtension = /\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/;
const codeFile = /\.(?:d\.)?(?:[cm]?ts|tsx|[cm]?js|jsx)$/;
interface Manifest { readonly name: string | undefined; readonly version: string | undefined; readonly exports: boolean }
/** True when `path` is `directory` or lies beneath it; both absolute. */
const within = (directory: string, path: string): boolean => path === directory || path.startsWith(`${directory}${sep}`);

/** Compiler declarations establish code targets. Resource descriptions need an
 * additional captured, physical target; an ambient wildcard alone proves none.
 * How a specifier resolved is retained before its real target is classified:
 * a package route is established only by a bare, unaliased specifier whose
 * compiler-resolved file lies in an installed package directory the
 * `node_modules` lookup reaches from the importer, including through a link.
 * Every other compiler-resolved file is classified by its physical location
 * through the canonical Project classifier. */
export class Resolution {
  // Existence is reported when resolution actually probed it, so a description
  // can record the paths it found absent as dependencies.
  onCandidate: ((path: string, existing?: boolean) => void) | undefined;
  files: ReadonlyMap<string, InventoryFile>;
  project: Project;
  inventory: ProjectInventory;
  // Physical paths and package evidence of this snapshot, each observed once.
  readonly #real = new Map<string, string>();
  readonly #packages = new Map<string, boolean>();
  readonly #manifests = new Map<string, Manifest | null>();
  constructor(project: Project, inventory: ProjectInventory, readonly host: CatalogHost) {
    this.project = project; this.inventory = inventory;
    this.files = new Map(inventory.files.map(file => [resolve(inventory.scope.root, file.path), file]));
  }
  /** Point at the snapshot and inventory of a later state; the host stays. */
  retarget(project: Project, inventory: ProjectInventory): void {
    this.project = project; this.inventory = inventory;
    this.files = new Map(inventory.files.map(file => [resolve(inventory.scope.root, file.path), file]));
    this.#real.clear(); this.#packages.clear(); this.#manifests.clear();
  }
  /** `known` supplies the specifier's module symbol from an earlier batched request. */
  module(node: Node, known?: { readonly symbol: CompilerSymbol | undefined }): ResolvedModule {
    const module = known ? known.symbol : this.project.checker.getSymbolAtLocation(node);
    const specifier = isStringLiteral(node) ? node.text : '';
    const declarations = module?.declarations ?? [];
    // NodeHandle.path is the compiler's canonical key, which can be case-folded.
    // Physical ownership follows the resolved source's original filename.
    const declarationNodes = declarations.flatMap(declaration => {
      const node = declaration.resolve(this.project);
      return node ? [node] : [];
    });
    const paths = [...new Set(declarationNodes.map(node => resolve(node.getSourceFile().fileName)))];
    const candidates: string[] = [];
    const pathSpecifier = specifier === '.' || specifier === '..' || specifier.startsWith('./')
      || specifier.startsWith('../') || isAbsolute(specifier);
    if (pathSpecifier) candidates.push(resolve(dirname(node.getSourceFile().fileName), specifier));
    // The pinned native API returns pathsBasePath alongside parsed options,
    // including the directory of an inherited paths declaration. It is omitted
    // from its published CompilerOptions type. Do not substitute importer cwd.
    const options = this.project.program.getCompilerOptions() as ReturnType<Project['program']['getCompilerOptions']>
      & { readonly pathsBasePath?: string; readonly baseUrl?: string };
    // TypeScript applies paths substitutions only to non-relative names.
    const matches = Object.entries(pathSpecifier ? {} : options.paths ?? {}).flatMap(([pattern, substitutions]) => {
      const star = pattern.indexOf('*');
      if (star < 0) return pattern === specifier ? [{ prefix: Infinity, text: '', substitutions }] : [];
      const prefix = pattern.slice(0, star), suffix = pattern.slice(star + 1);
      return specifier.startsWith(prefix) && specifier.endsWith(suffix) && specifier.length >= prefix.length + suffix.length
        ? [{ prefix: prefix.length, text: specifier.slice(prefix.length, specifier.length - suffix.length), substitutions }] : [];
    }).sort((a, b) => b.prefix - a.prefix);
    if (matches[0]) for (const substitution of matches[0].substitutions) {
      // Relative substitutions need the compiler's actual paths base. Do not
      // guess one from the importing file when inherited config selected it.
      const selected = substitution.replace('*', matches[0].text);
      const base = options.baseUrl ?? options.pathsBasePath;
      if (isAbsolute(selected)) candidates.push(selected);
      else if (base && isAbsolute(base)) candidates.push(resolve(base, selected));
    }
    paths.forEach(path => this.onCandidate?.(path, true));
    candidates.forEach(path => this.onCandidate?.(path));
    const exists = (path: string): boolean => {
      const existing = this.host.fileExists(path);
      this.onCandidate?.(path, existing);
      return existing;
    };
    // The route: a path specifier never resolves through a package, and a
    // file a paths substitution spells was reached by that alias. Only the
    // remaining bare resolutions can carry package evidence.
    const importer = resolve(node.getSourceFile().fileName);
    const bare = (path: string): string | null => pathSpecifier || this.spelled(candidates, path, options.moduleSuffixes) ? null : specifier;
    const unresolved: ResolvedModule = { kind: 'unresolved', module, file: null, resource: null, exclusion: null };
    const resourceTarget: ResolvedModule = { ...unresolved, kind: 'resource-target' };
    // JSON and ordinary ESM code resolve to actual source files. Ambient module
    // declarations instead name their describing source file, handled below.
    const sourcePaths = [...new Set(declarationNodes.filter(node => node.kind === SyntaxKind.SourceFile)
      .map(node => resolve(node.getSourceFile().fileName)))];
    const describedResources: string[] = [];
    for (const path of sourcePaths) {
      // An import naming the declaration itself still names code. A compiler
      // resolution to an arbitrary-extension declaration describes a resource.
      if (!codeExtension.test(specifier)) {
        // Match the declaration TypeScript actually selected, including its
        // configured suffix. Stripping a filename suffix without the requested
        // resource path could mistake part of its real extension for a suffix.
        const described = candidates.find(candidate => {
          candidate = resolve(candidate);
          const extension = extname(candidate);
          if (!extension || codeExtension.test(extension)) return false;
          return (options.moduleSuffixes ?? ['']).some(suffix =>
            path === `${candidate.slice(0, -extension.length)}.d${extension}${suffix}.ts`
            || /\.(?:css|svg|html|png|jpg|json)$/.test(extension) && path === `${candidate}${suffix}.d.ts`);
        });
        if (described) { describedResources.push(resolve(described)); continue; }
        // rootDirs and package resolution can select a declaration outside the
        // exact requested directory. Identify its described resource from the
        // selected filename; retain an explicit limit if suffix spellings make
        // that interpretation ambiguous. An alias naming source still names code.
        const namesCode = candidates.some(candidate => codeExtension.test(candidate)
          && (resolve(candidate) === path || (options.moduleSuffixes ?? ['']).some(suffix =>
            ['.d.ts', '.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'].some(extension =>
              candidate.endsWith(extension) && resolve(`${candidate.slice(0, -extension.length)}${suffix}${extension}`) === path))));
        if (!namesCode) {
          const alternatives = new Set<string>();
          for (const suffix of new Set([...(options.moduleSuffixes ?? []), ''])) {
            for (const extension of ['.d.ts', '.ts']) {
              if (!path.endsWith(`${suffix}${extension}`)) continue;
              const withoutSuffix = `${path.slice(0, -suffix.length - extension.length)}${extension}`;
              if (/\.d\.[^.\/]+\.ts$/.test(withoutSuffix)) alternatives.add(withoutSuffix.replace(/\.d\.([^.\/]+)\.ts$/, '.$1'));
              if (/\.(?:css|svg|html|png|jpg|json)\.d\.ts$/.test(withoutSuffix)) alternatives.add(withoutSuffix.slice(0, -5));
            }
          }
          const named = [...alternatives].filter(resource => [specifier, ...candidates].some(candidate => basename(candidate) === basename(resource)));
          const possible = named.length ? named : [...alternatives];
          if (possible.length === 1) { describedResources.push(possible[0]!); continue; }
          if (possible.length > 1) return resourceTarget;
        }
      }
      // An actual compiler-resolved code/package target wins over every later
      // paths substitution, even if that alternative happens to be a resource.
      return this.place(path, module, bare(path), importer, !codeFile.test(path));
    }
    if (describedResources.length) {
      for (const path of describedResources) {
        if (!exists(path)) continue;
        const owned = this.files.get(path);
        if (owned?.kind === 'resource') return { kind: 'application', module, file: owned.path, resource: owned, exclusion: null };
        // A described resource follows the route of the description the compiler resolved.
        const packaged = sourcePaths.some(source => {
          const name = bare(source);
          return name !== null && this.packaged(importer, name, source);
        });
        if (packaged) return { kind: 'external', module, file: path, resource: null, exclusion: null };
        return this.place(path, module, null, importer, true);
      }
      return resourceTarget;
    }
    // A plain initialization script has no module symbol in the native API.
    // For explicit file references, use TypeScript's extension/suffix order and
    // require the selected file to be present in this compiler program. Stop at
    // the first existing candidate, even if it cannot be interpreted: an alias
    // fallback must never skip a selected module to reach a later script.
    // Package/directory/extensionless and rootDirs resolution still require a
    // compiler-established module; this fallback does not guess their targets.
    if (!module && !options.rootDirs?.length) {
      for (const candidate of candidates) {
        const extension = extname(candidate);
        const substitutions: Readonly<Record<string, readonly string[]>> = {
          '.js': ['.ts', '.tsx', '.d.ts', '.js', '.jsx'], '.jsx': ['.ts', '.tsx', '.d.ts', '.jsx', '.js'],
          '.mjs': ['.mts', '.d.mts', '.mjs'], '.cjs': ['.cts', '.d.cts', '.cjs'],
          '.ts': ['.ts'], '.tsx': ['.tsx'], '.mts': ['.mts'], '.cts': ['.cts'],
        };
        const endings = substitutions[extension];
        if (!endings) continue;
        let selected: string | undefined;
        // A paths substitution tries its exact extension (with moduleSuffixes)
        // before extension substitution. Relative imports have no such priority.
        for (const ending of matches[0] ? [extension, ...endings] : endings) {
          for (const suffix of options.moduleSuffixes ?? ['']) {
            const path = `${candidate.slice(0, -extension.length)}${suffix}${ending}`;
            if (exists(path)) { selected = path; break; }
          }
          if (selected) break;
        }
        if (!selected) continue;
        const source = this.project.program.getSourceFile(selected);
        if (!source || source.externalModuleIndicator) break;
        const owned = this.files.get(resolve(selected));
        if (owned?.kind === 'source') return { kind: 'application', module, file: owned.path, resource: null, exclusion: null };
        // Explicit path or alias candidates never establish a package route.
        return this.place(resolve(selected), module, null, importer, false);
      }
    }
    for (const candidate of candidates) {
      const file = this.files.get(resolve(candidate));
      if (file?.kind === 'resource' && exists(candidate)) {
        return { kind: 'application', module, file: file.path, resource: file, exclusion: null };
      }
      if (!file && exists(candidate)) return this.place(resolve(candidate), module, null, importer, !codeFile.test(candidate));
    }
    // Node's builtin resolver establishes these targets even when this project
    // intentionally supplies no ambient Node declarations.
    if (isBuiltin(specifier)) return { kind: 'external', module, file: paths[0] ?? null, resource: null, exclusion: null };
    const resourceLike = declarations.some(handle => {
      const declaration = handle.resolve(this.project);
      return declaration && 'name' in declaration && isStringLiteral(declaration.name as Node)
        && (declaration.name as { text: string }).text.includes('*');
    }) || /\.(?!(?:[cm]?ts|tsx|[cm]?js|jsx)$)[a-zA-Z0-9]+$/.test(specifier);
    if (resourceLike) return resourceTarget;
    // An ambient module declaration involves no resolution route: one that only
    // external or default library files declare stays outside the application.
    if (module && paths.length && paths.every(path => this.library(path, true))) return { kind: 'external', module, file: paths[0]!, resource: null, exclusion: null };
    return unresolved;
  }

  /**
   * The target of one compiler-resolved file imported by the file `importer`.
   * `packageSpecifier` is the specifier when the route can still be a package
   * resolution, else null.
   * An established package route is external even when its real location lies
   * in the project; otherwise an inventoried file is application source, and
   * any other file is classified at its physical location. An owned location
   * the inventory does not hold is not an established application target.
   */
  private place(path: string, module: CompilerSymbol | undefined, packageSpecifier: string | null,
    importer: string, resource: boolean): ResolvedModule {
    if (packageSpecifier !== null && this.packaged(importer, packageSpecifier, path)
      || this.library(path, false)) return { kind: 'external', module, file: path, resource: null, exclusion: null };
    const application = (file: InventoryFile): ResolvedModule =>
      ({ kind: 'application', module, file: file.path, resource: file.kind === 'resource' ? file : null, exclusion: null });
    const owned = this.files.get(path);
    if (owned) return application(owned);
    const physical = this.real(path);
    const linked = physical === path ? undefined : this.files.get(physical);
    if (linked) return application(linked);
    const local = relative(this.inventory.scope.root, physical).split(sep).join('/') || '.';
    const ownership = classifyProjectPath(this.inventory.scope, local);
    const exclusion = ownership.status === 'owned' || ownership.status === 'excluded' ? ownership.exclusion : null;
    if (ownership.status === 'outside-project') return { kind: 'outside-project', module, file: local, resource: null, exclusion: null };
    if (exclusion) {
      const declared = exclusion.kind === 'owned-ignored' || exclusion.kind === 'external';
      return { kind: declared ? 'nested-tree' : 'excluded', module, file: local, resource: null, exclusion };
    }
    return { kind: resource ? 'resource-target' : 'unresolved', module, file: null, resource: null, exclusion: null };
  }

  /** The physical path of `path` through every link, observed once per snapshot. */
  private real(path: string): string {
    let physical = this.#real.get(path);
    if (physical === undefined) { physical = resolve(this.host.realpath(path)); this.#real.set(path, physical); }
    return physical;
  }

  /**
   * Whether the `node_modules` lookup from the file `importer` reaches `file`
   * for a bare specifier. A relative path into `node_modules`, an alias, a
   * package import map entry, the importer's own package name (resolved
   * through its manifest's exports, never through `node_modules`) or the
   * compiler's external-library flag never counts. The file lies in
   * `<ancestor>/node_modules/<name>` or its `@types` package as spelled,
   * which needs no observation. Otherwise the lookup is retraced with the
   * observations the compiler's own lookup made, nearest ancestor first: an
   * existing `node_modules` directory, then the package directory. The first
   * one holding the package decides: the file lies in its physical location
   * through a link, or in an installed copy of the same package name and
   * version, to which the compiler resolves every identical copy.
   */
  private packaged(importer: string, specifier: string, file: string): boolean {
    if (!specifier || specifier.startsWith('#') || isAbsolute(specifier)) return false;
    const parts = specifier.split('/');
    const name = specifier.startsWith('@') ? parts.length >= 2 && parts[1] ? `${parts[0]}/${parts[1]}` : null : parts[0];
    if (!name) return false;
    const types = name.startsWith('@') ? name.slice(1).replace('/', '__') : name;
    // The lookup never searches beneath a directory that is itself named node_modules.
    const ancestors: string[] = [];
    for (let directory = dirname(importer); ; directory = dirname(directory)) {
      if (basename(directory) !== 'node_modules') ancestors.push(directory);
      if (dirname(directory) === directory) break;
    }
    const stem = file.replace(/(?:\.d)?\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/, '');
    const spelled = (directory: string): boolean => within(directory, file) || stem === directory;
    if (ancestors.some(directory => spelled(resolve(directory, 'node_modules', name))
      || spelled(resolve(directory, 'node_modules', '@types', types)))) return true;
    const key = `${importer}\0${name}\0${file}`;
    let found = this.#packages.get(key);
    if (found === undefined) {
      found = false;
      // A self-name import resolves through the importer's own manifest.
      const scope = this.project.program.getSourceFileMetadata(importer)?.packageJsonDirectory;
      const own = scope ? this.manifest(resolve(scope, 'package.json')) : null;
      if (own?.name === name && own.exports) { this.#packages.set(key, false); return false; }
      for (const directory of ancestors) {
        const modules = resolve(directory, 'node_modules');
        if (!this.host.directoryExists(modules)) continue;
        let located = false;
        for (const [installed, scope] of [[resolve(modules, name), null], [resolve(modules, '@types', types), resolve(modules, '@types')]] as const) {
          if (scope !== null && !this.host.directoryExists(scope) || !this.host.directoryExists(installed)) continue;
          located = true;
          if (within(this.real(installed), file) || this.samePackage(installed, file)) { found = true; break; }
        }
        if (located) break;
      }
      this.#packages.set(key, found);
    }
    return found;
  }

  /** Whether `installed` holds the package, by `name` and `version`, whose
   * manifest scopes `file`; both manifests are ones the compiler read. */
  private samePackage(installed: string, file: string): boolean {
    const scope = this.project.program.getSourceFileMetadata(file)?.packageJsonDirectory;
    if (!scope) return false;
    const identity = (manifest: Manifest | null): string | null =>
      manifest?.name !== undefined && manifest.version !== undefined ? `${manifest.name}@${manifest.version}` : null;
    const installedIdentity = identity(this.manifest(resolve(installed, 'package.json')));
    return installedIdentity !== null && installedIdentity === identity(this.manifest(resolve(scope, 'package.json')));
  }

  /** The name, version and exports presence of one package manifest, or null. */
  private manifest(path: string): Manifest | null {
    let manifest = this.#manifests.get(path);
    if (manifest === undefined) {
      manifest = null;
      const text = this.host.readFile(path);
      try {
        const data: unknown = text === null ? null : JSON.parse(text);
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          const { name, version, exports } = data as { name?: unknown; version?: unknown; exports?: unknown };
          manifest = { name: typeof name === 'string' ? name : undefined, version: typeof version === 'string' ? version : undefined,
            exports: exports !== undefined && exports !== null };
        }
      } catch { manifest = null; }
      this.#manifests.set(path, manifest);
    }
    return manifest;
  }

  /** Whether a paths substitution candidate spells `path`, with TypeScript's
   * extension substitution, module suffixes, a directory index or a resource's
   * declaration file. */
  private spelled(candidates: readonly string[], path: string, suffixes: readonly string[] | undefined): boolean {
    const stem = (file: string): string => file.replace(/(?:\.d)?\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/, '');
    return candidates.some(candidate => {
      const absolute = resolve(candidate), extension = extname(absolute);
      const resource = extension !== '' && !codeFile.test(absolute);
      return within(absolute, path) || (suffixes ?? ['']).some(suffix => stem(path) === `${stem(absolute)}${suffix}`
        || resource && (path === `${absolute.slice(0, -extension.length)}.d${extension}${suffix}.ts` || path === `${absolute}${suffix}.d.ts`));
    });
  }

  /** A default library file, or with `external`, a file the compiler loaded as an external library. */
  private library(path: string, external: boolean): boolean {
    const source = this.project.program.getSourceFile(path);
    return !!source && (this.project.program.isSourceFileDefaultLibrary(source)
      || external && this.project.program.isSourceFileFromExternalLibrary(source));
  }
}
