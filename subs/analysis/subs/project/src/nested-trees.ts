import { join } from 'node:path';
import type { Capture } from './capture.js';
import type { NestedTreeDeclaration, NestedTreeProblem } from './ownership.js';
import type { InventoryModule, ProjectIssue } from './interfaces/project.js';

/** Why each declaration-table problem makes the declared boundary invalid. */
const reasons: Readonly<Record<Exclude<NestedTreeProblem, 'overlap'>, string>> = {
  'invalid-path': 'is not a relative "/"-separated directory path without empty segments',
  escape: 'does not lie strictly beneath its declaring module',
  'child-module': 'lies inside a child module',
  'external-in-src': 'is an external tree beneath its module\'s src/',
  'always-excluded': 'is or lies beneath an always-excluded path',
};

function located(declaration: NestedTreeDeclaration, code: ProjectIssue['code'], detail: string): ProjectIssue {
  const { span } = declaration;
  const target = declaration.directory === null ? '' : ` (${declaration.directory})`;
  return { code, path: declaration.description, span,
    message: `Invalid nested-tree declaration: ${code} at ${span.line}:${span.column}: ${declaration.kind} ${JSON.stringify(declaration.decoded)}${target} ${detail}` };
}

/**
 * The Project issues of the declared nested trees. A declaration the table
 * already rejected is reported with its problem. Every other declaration is
 * checked on the filesystem without traversing a symbolic link: each directory
 * from its declaring module down to the declared one is observed, never
 * listed, so the captured inputs hold the boundary's existence evidence and
 * nothing beneath it. An owned nested target must exist as a real directory;
 * an external target may be absent, and must be a real directory when present.
 */
export async function nestedTreeIssues(capture: Capture, modules: readonly InventoryModule[],
  declarations: readonly NestedTreeDeclaration[]): Promise<ProjectIssue[]> {
  const issues: ProjectIssue[] = [];
  for (const declaration of declarations) {
    if (declaration.problem === 'overlap') {
      const others = declarations.filter(other => other !== declaration && other.problem === 'overlap' && other.directory !== null
        && declaration.directory !== null && (other.directory === declaration.directory
          || other.directory.startsWith(`${declaration.directory}/`) || declaration.directory.startsWith(`${other.directory}/`)));
      issues.push(located(declaration, 'overlapping-nested-tree', `equals or overlaps ${others.map(other =>
        `${other.description}:${other.span.line}:${other.span.column}`).join(', ')}`));
      continue;
    }
    if (declaration.problem !== null) { issues.push(located(declaration, 'invalid-nested-tree', reasons[declaration.problem])); continue; }
    const owner = modules.find(module => module.id === declaration.module)!;
    const base = owner.directory === '.' ? [] : owner.directory.split('/');
    const segments = declaration.directory!.split('/').slice(base.length);
    let path = join(capture.root, owner.directory);
    for (let index = 0; index < segments.length; index++) {
      path = join(path, segments[index]!);
      const kind = await capture.kind(path);
      const last = index === segments.length - 1;
      if (kind === 'directory') continue;
      if (kind === 'symlink') {
        issues.push(located(declaration, 'invalid-nested-tree', last ? 'is a symbolic link, not a real directory'
          : `traverses the symbolic link ${[...base, ...segments.slice(0, index + 1)].join('/')}`));
      } else if (kind === 'absent' || !last) {
        // Absent, or beneath an entry that is not a directory: the declared directory does not exist.
        if (declaration.kind === 'owned-unwired' || declaration.kind === 'owned-nested-project') issues.push(located(declaration, `missing-${declaration.kind}`, 'does not exist as a directory'));
      } else issues.push(located(declaration, 'invalid-nested-tree', 'exists but is not a real directory'));
      break;
    }
  }
  return issues;
}
