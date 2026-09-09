import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import { API } from 'typescript/unstable/sync';
import { isCallExpression, isExportDeclaration, isIdentifier, isImportDeclaration, isImportTypeNode,
  isLiteralTypeNode, isNewExpression, isNoSubstitutionTemplateLiteral, isStringLiteral, SyntaxKind } from 'typescript/unstable/ast';
import type { Node, SourceFile } from 'typescript/unstable/ast';

const declaration = /\.d\.[cm]?ts$/;
export const compilerSource = /\.(?:[cm]?[jt]s|[jt]sx)$/;

function artifacts(file: string): readonly string[] {
  if (declaration.test(file) || !compilerSource.test(file)) return [file];
  const extension = file.match(/\.[^.]+$/)![0];
  const stem = file.slice(0, -extension.length);
  const runtime = extension === '.mts' || extension === '.mjs' ? ['.mjs']
    : extension === '.cts' || extension === '.cjs' ? ['.cjs']
    : extension === '.tsx' || extension === '.jsx' ? ['.js', '.jsx'] : ['.js'];
  const typing = extension === '.mts' || extension === '.mjs' ? '.d.mts'
    : extension === '.cts' || extension === '.cjs' ? '.d.cts' : '.d.ts';
  return [...runtime, typing].flatMap(suffix => [`${stem}${suffix}`, `${stem}${suffix}.map`]);
}

/** Each possible output has exactly one retained source as its authority. */
export function artifactAllowlist(files: readonly string[]): ReadonlyMap<string, string> {
  const outputs = new Map<string, string>();
  for (const file of files) {
    for (const output of artifacts(file)) {
      const previous = outputs.get(output);
      if (previous && previous !== file) throw new Error(`Production output collision: ${previous} and ${file} both emit ${output}`);
      outputs.set(output, file);
    }
  }
  return outputs;
}

async function walk(directory: string, prefix = ''): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(resolve(directory, prefix), { withFileTypes: true })) {
    const path = posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await walk(directory, path));
    else if (entry.isFile()) result.push(path);
    else throw new Error(`Unexpected non-file build artifact: ${path}`);
  }
  return result.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}

/** Literal emitted dependencies, parsed by the pinned compiler rather than a JS lexer approximation. */
function relativeDependencies(source: SourceFile): readonly string[] {
  const dependencies = new Set<string>();
  function add(node: Node | undefined): void {
    if (node && (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node))
      && (node.text.startsWith('./') || node.text.startsWith('../'))) dependencies.add(node.text);
  }
  function visit(node: Node): void {
    if (isImportDeclaration(node) || isExportDeclaration(node)) add(node.moduleSpecifier);
    if (isCallExpression(node) && (node.expression.kind === SyntaxKind.ImportKeyword
      || isIdentifier(node.expression) && node.expression.text === 'require')) add(node.arguments[0]);
    if (isNewExpression(node) && isIdentifier(node.expression) && node.expression.text === 'URL') add(node.arguments?.[0]);
    if (isImportTypeNode(node) && isLiteralTypeNode(node.argument)) add(node.argument.literal);
    node.forEachChild(visit);
  }
  visit(source);
  for (const reference of source.referencedFiles) dependencies.add(reference.fileName);
  return [...dependencies];
}

export async function inspectArtifactDependencies(staging: string, files: ReadonlyMap<string, string>): Promise<ReadonlyMap<string, readonly string[]>> {
  const config = resolve(staging, '.ramify-dependencies.json');
  await writeFile(config, JSON.stringify({ compilerOptions: { noEmit: true, allowJs: true, checkJs: false,
    noResolve: true, noLib: true, types: [], target: 'ESNext', module: 'ESNext', moduleResolution: 'Bundler' },
    files: [...files.values()], include: [], exclude: [] }));
  const api = new API({ cwd: staging });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [config] });
    const project = snapshot.getProject(config);
    if (!project) throw new Error('Cannot open emitted-dependency inspection program');
    const result = new Map<string, readonly string[]>();
    for (const [file, path] of files) {
      const source = project.program.getSourceFile(path);
      if (!source) throw new Error(`Cannot parse production artifact: ${file}`);
      result.set(file, relativeDependencies(source));
    }
    return result;
  } finally { api.close(); }
}

interface PackageEntries { readonly runtime: readonly string[]; readonly types: readonly string[] }

function packageEntries(value: Record<string, unknown>): PackageEntries {
  const runtime: string[] = [], types: string[] = [];
  function visit(item: unknown, typing = false): void {
    if (typeof item === 'string') (typing ? types : runtime).push(item);
    else if (Array.isArray(item)) item.forEach(entry => visit(entry, typing));
    else if (item && typeof item === 'object') Object.entries(item).forEach(([key, entry]) => visit(entry, typing || key === 'types'));
  }
  visit(value.exports);
  visit(value.main);
  visit(value.types, true);
  visit(value.bin);
  const outputPath = (path: string): string => {
    const clean = path.replace(/^\.\//, '');
    if (!clean.startsWith('dist/') || clean.includes('*') || posix.normalize(clean) !== clean) {
      throw new Error(`Package entry must name an exact dist artifact: ${path}`);
    }
    return clean.slice('dist/'.length);
  };
  return { runtime: [...new Set(runtime.map(outputPath))], types: [...new Set(types.map(outputPath))] };
}

/** Promote only allowlisted outputs; compiler-followed testing files stay in staging. */
export async function promoteProductionArtifacts(root: string, staging: string, promoted: string,
  selected: readonly string[], manifest: Record<string, unknown>): Promise<readonly string[]> {
  const allowlist = artifactAllowlist(selected);
  const present = new Set<string>();
  async function copy(from: string, file: string): Promise<void> {
    await mkdir(dirname(resolve(promoted, file)), { recursive: true });
    await copyFile(resolve(from, file), resolve(promoted, file));
    present.add(file);
  }
  for (const file of await walk(staging)) {
    if (allowlist.has(file)) await copy(staging, file);
  }
  for (const file of selected) {
    if (!compilerSource.test(file)) await copy(root, file);
  }
  const entries = packageEntries(manifest);
  for (const entry of entries.runtime) {
    if (!present.has(entry)) throw new Error(`Missing production package entry: ${entry}`);
  }
  const parsedFiles = new Map([...present].filter(file => /\.(?:[cm]?js|jsx)$/.test(file) || declaration.test(file))
    .map(file => [file, resolve(promoted, file)]));
  for (const file of selected) if (declaration.test(file) && !parsedFiles.has(file)) parsedFiles.set(file, resolve(root, file));
  const dependencies = parsedFiles.size ? await inspectArtifactDependencies(staging, parsedFiles) : new Map<string, readonly string[]>();
  for (const file of present) {
    if (!/\.(?:[cm]?js|jsx)$/.test(file)) continue;
    for (const specifier of dependencies.get(file) ?? []) {
      const target = posix.normalize(posix.join(posix.dirname(file), specifier));
      if (!present.has(target)) throw new Error(`Production dependency is absent or excluded: ${file} imports ${specifier}`);
    }
  }
  // Declaration inputs do not emit. Copy only ones reached from declared public types.
  const pending = [...entries.types], visited = new Set<string>();
  for (let index = 0; index < pending.length; index++) {
    const file = pending[index]!;
    if (visited.has(file)) continue;
    visited.add(file);
    if (!present.has(file) && declaration.test(file) && allowlist.has(file)) await copy(root, file);
    if (!present.has(file)) throw new Error(`Missing production package typing dependency: ${file}`);
    for (const specifier of dependencies.get(file) ?? []) {
      const path = posix.normalize(posix.join(posix.dirname(file), specifier));
      const candidates = declaration.test(path) ? [path]
        : /\.[cm]js$/.test(path) ? [path.replace(/\.[cm]js$/, path.endsWith('.mjs') ? '.d.mts' : '.d.cts')]
        : /\.(?:js|jsx|ts|tsx)$/.test(path) ? [path.replace(/\.(?:js|jsx|ts|tsx)$/, '.d.ts')]
        : [`${path}.d.ts`, posix.join(path, 'index.d.ts'), path];
      const target = candidates.find(candidate => present.has(candidate) || declaration.test(candidate) && allowlist.has(candidate));
      if (!target) throw new Error(`Missing production typing dependency: ${file} imports ${specifier}`);
      pending.push(target);
    }
  }
  return [...present].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}
