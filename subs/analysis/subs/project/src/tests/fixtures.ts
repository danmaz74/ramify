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
export const syntax: ProjectReadOptions['parse'] = (file) => ({ status: 'valid', document: {
  file, version: 1, module: { name: file === 'module.ramify' ? 'fixture' : 'child', tags: [], span: { start: 9, end: 23, line: 2, column: 1 } }, tokens: [], statements: [],
} });
export async function fixture(root: string): Promise<void> {
  await put(root, 'module.ramify', 'ramify 1\nmodule fixture\n');
  await put(root, 'README.md', '# Fixture\n\nFixture purpose.\n');
  await put(root, 'package.json', '{"type":"module"}\n');
  await put(root, 'tsconfig.json', '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["src"]}\n');
  await put(root, 'src/value.ts', 'export const value = 1;\n');
}
