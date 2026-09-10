import { basename, join, posix } from 'node:path';
import { Capture } from './capture.js';
import type { ExactReference, InventoryModule, ProjectIssue } from './interfaces/project.js';

export async function exactReferences(capture: Capture, modules: readonly InventoryModule[], owned: ReadonlySet<string>, issues: ProjectIssue[], references: ExactReference[]): Promise<void> {
  for (const module of modules) {
    if (module.description.status !== 'valid') continue;
    for (const statement of module.description.document.statements) {
      if (statement.kind === 'expose-sub') continue;
      const decoded = statement.from.value;
      const base = join(module.directory, 'src', ...(statement.kind === 'expose-test' ? ['tests'] : []));
      const normalized = posix.normalize(decoded);
      let status: ExactReference['status'] = 'file';
      if (decoded.startsWith('/') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(decoded) || decoded.includes('\\') || decoded.split('/').some(part => !part) || /[*?\[\]{}]/.test(decoded)) status = 'invalid-path';
      else if (normalized === '..' || normalized.startsWith('../')) status = 'escape';
      const target = posix.join(base, normalized);
      if (status === 'file') {
        let directory = capture.root;
        const segments = target.split('/').filter(part => part !== '.');
        for (let index = 0; index < segments.length; index++) {
          const segment = segments[index]!;
          const entries = await capture.readDirectory(directory);
          if (!entries.some(entry => basename(entry) === segment)) {
            status = entries.some(entry => basename(entry).toLowerCase() === segment.toLowerCase()) ? 'case-mismatch' : 'missing'; break;
          }
          directory = join(directory, segment);
          const kind = await capture.kind(directory);
          if (kind === 'symlink') { status = 'symlink'; break; }
          if (index === segments.length - 1) status = kind === 'directory' ? 'directory' : kind === 'file' ? 'file' : 'missing';
          else if (kind !== 'directory') { status = 'missing'; break; }
        }
        if (status === 'file' && !owned.has(target)) status = 'excluded';
      }
      const description = module.description.document.file;
      references.push({ description, statement: statement.index, decoded, normalized: target, status,
        interfaceEligible: status === 'file' && target.startsWith(posix.join(module.directory, 'src/interfaces') + '/') });
      if (status !== 'file') {
        const code: ProjectIssue['code'] = status === 'symlink' ? 'symlink-reference' : status === 'case-mismatch' ? 'case-mismatch' : status === 'missing' ? 'missing-file' : 'invalid-path';
        issues.push({ code, path: description,
          message: `${statement.from.span.line}:${statement.from.span.column}: ${status} source reference ${JSON.stringify(decoded)} (${target})` });
      }
    }
  }
}
