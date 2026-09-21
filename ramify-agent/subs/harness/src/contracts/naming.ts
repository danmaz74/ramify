/*
 * The fake-naming rule of the harness principles, as the `contract` gate
 * verifies it.
 *
 * A fake implementation file carries `.fake` before the language extension.
 * Every name it exports carries `Fake`. A re-export of one of its bindings
 * keeps that designation rather than presenting the fake under a
 * production-looking name. The shared contract itself keeps a
 * behavior-oriented name, because both the fake and the real provider
 * implement it, so nothing here asks a contract file to be marked.
 *
 * The rule is read from the files themselves, never from what the submission
 * said about them: what generated architectural evidence will show is the
 * source, so the source is what is checked.
 */

/** A file name that designates a fake: `.fake` before the language extension. */
const fakeFileName = /\.fake\.[cm]?[jt]sx?$/;

/** The designation an exported fake name carries. */
const designation = /Fake/;

/** Which part of the rule one violation breaks. */
export type NamingRule = 'file-suffix' | 'export-name' | 're-export';

export interface NamingViolation {
  readonly rule: NamingRule;
  readonly path: string;
  readonly detail: string;
}

/** One file the rule is checked over: its project-relative path and its text. */
export interface NamedFile {
  readonly path: string;
  readonly text: string;
}

/** Whether a project-relative path designates a fake implementation file. */
export function isFakeFile(path: string): boolean {
  return fakeFileName.test(path);
}

/**
 * Every violation of the rule in one set of files. `declared` are the paths
 * the submission called fakes; each of them must be named as one. Every file
 * is read for a re-export of a fake, wherever it lives, so a production-looking
 * alias is found in the consumer as well as beside the fake.
 */
export function fakeNamingViolations(files: readonly NamedFile[], declared: readonly string[]): NamingViolation[] {
  const violations: NamingViolation[] = [];
  const byPath = new Map(files.map(file => [file.path, file]));

  for (const path of declared) {
    if (isFakeFile(path)) continue;
    violations.push({
      rule: 'file-suffix',
      path,
      detail: `"${path}" is a fake implementation, so its name carries ".fake" before the language extension`,
    });
  }

  for (const file of files) {
    if (isFakeFile(file.path)) {
      for (const name of exportedNames(file.text)) {
        if (name.name === null) {
          violations.push({
            rule: 'export-name',
            path: file.path,
            detail: 'a fake has no unnamed export: a default export cannot carry "Fake" in its name',
          });
          continue;
        }
        if (designation.test(name.name)) continue;
        violations.push({
          rule: 'export-name',
          path: file.path,
          detail: `the exported name "${name.name}" does not carry "Fake"`,
        });
      }
    }
    for (const reExport of reExportsOfFakes(file.text)) {
      if (designation.test(reExport.exported)) continue;
      violations.push({
        rule: 're-export',
        path: file.path,
        detail: `"${reExport.exported}" re-exports "${reExport.local}" of ${reExport.from}, and drops the fake's designation`,
      });
    }
  }

  // Declared paths named twice, once for the suffix and once through their
  // own file, would repeat; the set is kept in the order it was found.
  return violations.filter((violation, index) =>
    violations.findIndex(other => other.rule === violation.rule && other.path === violation.path && other.detail === violation.detail) === index);
}

/** The names one module's source exports. `null` is an export that has none. */
export function exportedNames(text: string): Array<{ readonly name: string | null }> {
  const names: Array<{ name: string | null }> = [];
  const source = withoutComments(text);

  for (const match of source.matchAll(/^\s*export\s+default\b/gm)) {
    void match;
    names.push({ name: null });
  }
  for (const match of source.matchAll(/^\s*export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.push({ name: match[1]! });
  }
  // `export { a, b as c }`, with or without a source module. A re-export of
  // a fake is judged by the rule below as well; here it is an exported name
  // of this file like any other.
  for (const match of source.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const clause of match[1]!.split(',')) {
      const name = exportedNameOf(clause);
      if (name !== null) names.push({ name });
    }
  }
  return names;
}

/** Every `export … from` clause of one file whose source module is a fake. */
export function reExportsOfFakes(text: string): Array<{ readonly local: string; readonly exported: string; readonly from: string }> {
  const found: Array<{ local: string; exported: string; from: string }> = [];
  const source = withoutComments(text);
  for (const match of source.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const from = match[2]!;
    if (!isFakeSpecifier(from)) continue;
    for (const clause of match[1]!.split(',')) {
      const parts = clause.trim().replace(/^type\s+/, '').split(/\s+as\s+/);
      const local = parts[0]?.trim() ?? '';
      const exported = (parts[1] ?? parts[0])?.trim() ?? '';
      if (local === '' || exported === '') continue;
      found.push({ local, exported, from });
    }
  }
  return found;
}

/**
 * Whether an import specifier names a fake module. The specifier is written
 * with the `.js` extension the project's ESM imports use, so the
 * designation to look for is `.fake` before it.
 */
function isFakeSpecifier(specifier: string): boolean {
  return /\.fake(\.[cm]?[jt]sx?)?$/.test(specifier);
}

function exportedNameOf(clause: string): string | null {
  const trimmed = clause.trim().replace(/^type\s+/, '');
  if (trimmed === '') return null;
  const parts = trimmed.split(/\s+as\s+/);
  const name = (parts[1] ?? parts[0])!.trim();
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : null;
}

/** Comments and string bodies removed, so a name inside one is not read as source. */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
