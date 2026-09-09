import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { isBuiltin } from 'node:module';
import type { Project, Symbol as CompilerSymbol } from 'typescript/unstable/sync';
import { isStringLiteral, SyntaxKind, type Node } from 'typescript/unstable/ast';
import type { ProjectInventory, InventoryFile } from '../../project/src/interfaces/project.js';

export interface CatalogHost {
  fileExists(path: string): boolean;
  readFile(path: string): string | null;
  readonly resourceWitness: string;
}
export interface ResolvedModule {
  readonly kind: 'application' | 'external' | 'outside-module' | 'unresolved' | 'resource-target';
  readonly module: CompilerSymbol | undefined;
  readonly file: string | null;
  readonly resource: InventoryFile | null;
}

/** Compiler declarations establish code targets. Resource descriptions need an
 * additional captured, physical target; an ambient wildcard alone proves none. */
export class Resolution {
  readonly files: ReadonlyMap<string, InventoryFile>;
  constructor(readonly project: Project, readonly inventory: ProjectInventory, readonly host: CatalogHost) {
    this.files = new Map(inventory.files.map(file => [resolve(inventory.scope.root, file.path), file]));
  }
  module(node: Node): ResolvedModule {
    const module = this.project.checker.getSymbolAtLocation(node);
    const specifier = isStringLiteral(node) ? node.text : '';
    const declarations = module?.declarations ?? [];
    const paths = [...new Set(declarations.map(declaration => resolve(declaration.path)))];
    const candidates: string[] = [];
    if (specifier.startsWith('.') || isAbsolute(specifier)) candidates.push(resolve(dirname(node.getSourceFile().fileName), specifier));
    // The pinned native API returns pathsBasePath alongside parsed options,
    // including the directory of an inherited paths declaration. It is omitted
    // from its published CompilerOptions type. Do not substitute importer cwd.
    const options = this.project.program.getCompilerOptions() as ReturnType<Project['program']['getCompilerOptions']>
      & { readonly pathsBasePath?: string; readonly baseUrl?: string };
    const matches = Object.entries(options.paths ?? {}).flatMap(([pattern, substitutions]) => {
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
    // JSON and ordinary ESM code resolve to actual source files. Ambient module
    // declarations instead name their describing source file, handled below.
    const sourcePaths = paths.filter(path => declarations.some(declaration =>
      declaration.path === path && declaration.resolve(this.project)?.kind === SyntaxKind.SourceFile));
    const describedResources: string[] = [];
    for (const path of sourcePaths) {
      // An import naming the declaration itself still names code. A compiler
      // resolution to an arbitrary-extension declaration describes a resource.
      if (!/\.[cm]?[jt]sx?$/.test(specifier)) {
        // Match the declaration TypeScript actually selected, including its
        // configured suffix. Stripping a filename suffix without the requested
        // resource path could mistake part of its real extension for a suffix.
        const described = candidates.find(candidate => {
          candidate = resolve(candidate);
          const extension = extname(candidate);
          if (!extension || /\.[cm]?[jt]sx?$/.test(extension)) return false;
          return (options.moduleSuffixes ?? ['']).some(suffix =>
            path === `${candidate.slice(0, -extension.length)}.d${extension}${suffix}.ts`
            || /\.(?:css|svg|html|png|jpg|json)$/.test(extension) && path === `${candidate}${suffix}.d.ts`);
        });
        if (described) { describedResources.push(resolve(described)); continue; }
        // rootDirs and package resolution can select a declaration outside the
        // exact requested directory. Identify its described resource from the
        // selected filename; retain an explicit limit if suffix spellings make
        // that interpretation ambiguous. An alias naming source still names code.
        const namesCode = candidates.some(candidate => /\.[cm]?[jt]sx?$/.test(candidate)
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
          if (possible.length > 1) return { kind: 'resource-target', module, file: null, resource: null };
        }
      }
      const owned = this.files.get(path);
      if (owned) return { kind: 'application', module, file: owned.path, resource: owned.kind === 'resource' ? owned : null };
      // An actual compiler-resolved code/package target wins over every later
      // paths substitution, even if that alternative happens to be a resource.
      return this.external(path)
        ? { kind: 'external', module, file: path, resource: null }
        : { kind: 'outside-module', module, file: relative(this.inventory.scope.root, path), resource: null };
    }
    if (describedResources.length) {
      for (const path of describedResources) {
        if (!this.host.fileExists(path)) continue;
        const owned = this.files.get(path);
        if (owned?.kind === 'resource') return { kind: 'application', module, file: owned.path, resource: owned };
        return sourcePaths.every(path => this.external(path))
          ? { kind: 'external', module, file: path, resource: null }
          : { kind: 'outside-module', module, file: relative(this.inventory.scope.root, path), resource: null };
      }
      return { kind: 'resource-target', module, file: null, resource: null };
    }
    for (const candidate of candidates) {
      const file = this.files.get(resolve(candidate));
      if (file?.kind === 'resource' && this.host.fileExists(candidate)) {
        return { kind: 'application', module, file: file.path, resource: file };
      }
      if (!file && this.host.fileExists(candidate)) {
        return { kind: 'outside-module', module, file: relative(this.inventory.scope.root, candidate), resource: null };
      }
    }
    if (module && paths.length && isBuiltin(specifier)) return { kind: 'external', module, file: paths[0], resource: null };
    const resourceLike = declarations.some(handle => {
      const declaration = handle.resolve(this.project);
      return declaration && 'name' in declaration && isStringLiteral(declaration.name as Node)
        && (declaration.name as { text: string }).text.includes('*');
    }) || /\.(?![cm]?[jt]sx?$)[a-zA-Z0-9]+$/.test(specifier);
    if (resourceLike) return { kind: 'resource-target', module, file: null, resource: null };
    if (module && paths.length && paths.every(path => this.external(path))) return { kind: 'external', module, file: paths[0], resource: null };
    return { kind: 'unresolved', module, file: null, resource: null };
  }
  private external(path: string): boolean {
    const source = this.project.program.getSourceFile(path);
    return !!source && (this.project.program.isSourceFileFromExternalLibrary(source) || this.project.program.isSourceFileDefaultLibrary(source));
  }
}
