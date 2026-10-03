import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AcquisitionLimits, ProjectReadOptions } from '../interfaces/project.js';

export const limits: AcquisitionLimits = { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
  maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2,
  maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 };
export async function put(root: string, path: string, text: string | Uint8Array): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text);
}
// Acquisition injects the text parser. These local provider tests supply a fixed
// valid syntax fact; the reference harness separately exercises the real parser.
// The root fact is the marked header `root module fixture` that fixture() writes.
export const syntax: ProjectReadOptions['parse'] = (file) => ({ status: 'valid', document: {
  file, version: 1, module: file === 'module.ramify'
    ? { name: 'fixture', tags: [], root: { start: 9, end: 13, line: 2, column: 1 }, span: { start: 9, end: 28, line: 2, column: 1 } }
    : { name: 'child', tags: [], root: null, span: { start: 9, end: 23, line: 2, column: 1 } }, tokens: [], statements: [],
} });
export async function fixture(root: string): Promise<void> {
  await put(root, 'module.ramify', 'ramify 1\nroot module fixture\n');
  await put(root, 'README.md', '# Fixture\n\nFixture purpose.\n');
  await put(root, 'package.json', '{"type":"module"}\n');
  await put(root, 'tsconfig.json', '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["src"]}\n');
  await put(root, 'src/value.ts', 'export const value = 1;\n');
}

/**
 * A local header parser for observer tests: it reflects the declared name and
 * tags of real bytes, so a renamed or broken header is a distinguishable fact.
 */
export const declaration: ProjectReadOptions['parse'] = (file, text) => {
  const lines = text.split('\n');
  const index = lines.findIndex(line => /^(?:root\s+)?module\s/.test(line));
  const start = index < 0 ? 0 : lines.slice(0, index).reduce((total, line) => total + line.length + 1, 0);
  const header = index < 0 ? null
    : /^(root\s+)?module\s+"?([A-Za-z0-9_-]+)"?(?:\s+tagged\s+\[([^\]]*)\])?\s*$/.exec(lines[index]!);
  if (!header) {
    const line = Math.min(2, lines.length);
    const offset = lines.slice(0, line - 1).reduce((total, entry) => total + entry.length + 1, 0);
    const word = /^\S*/.exec(lines[line - 1] ?? '')![0];
    return { status: 'invalid', file, tokens: [],
      issues: [{ code: 'missing-header', message: 'Expected a module header', file,
        span: { start: offset, end: offset + word.length, line, column: 1 } }] };
  }
  return { status: 'valid', document: { file, version: 1, tokens: [], statements: [],
    module: { name: header[2]!, tags: (header[3] ?? '').split(',').map(tag => tag.trim()).filter(Boolean),
      root: header[1] ? { start, end: start + 4, line: index + 1, column: 1 } : null,
      span: { start, end: start + lines[index]!.length, line: index + 1, column: 1 } } } };
};
