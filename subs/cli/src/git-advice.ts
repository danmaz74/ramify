import { Buffer } from 'node:buffer';
import type { AnalysisReport, RunControl } from '../../analysis/src/interfaces/analysis.js';
import type { ProjectOwnership, ProjectWarning } from '../../analysis/subs/project/src/interfaces/project.js';
import type { GitPort } from './interfaces/cli.js';

/**
 * Project's canonical reserved-segment rule: repository metadata, installed-package
 * directories and Ramify's generated views with their transient publisher siblings are
 * excluded wherever such a segment occurs. The lightweight client loads no analysis
 * module, so it cannot call Project's classifier; this mirrors its segment rule, and an
 * owner test compares the result with `classifyProjectPath` over the same paths. Rooted
 * exclusions are not repeated here: they are the report's ownership facts.
 */
const reservedSegments = new Set(['.git', 'node_modules', 'bower_components', 'jspm_packages', '.ramify', '.ramify-architect']);
const generatedSibling = /^\.ramify(?:-architect)?\.(?:tmp|old)-.+$/;
const reserved = (segment: string): boolean => reservedSegments.has(segment) || generatedSibling.test(segment);

const decoder = new TextDecoder('utf-8', { fatal: true });
const byteOrder = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));

/**
 * The directories of Git's NUL-terminated list, normalized relative to the root: only
 * entries with a trailing `/`, each once. An entry that is not UTF-8, names the root
 * itself, leaves it or is not a normalized relative path is skipped; whitespace,
 * newlines and other bytes in a name are kept as they are.
 */
export function ignoredDirectories(output: Uint8Array): string[] {
  const directories = new Set<string>();
  let start = 0;
  for (let index = 0; index <= output.length; index++) {
    if (index < output.length && output[index] !== 0) continue;
    const entry = output.subarray(start, index);
    start = index + 1;
    if (!entry.length || entry[entry.length - 1] !== 0x2f) continue;
    let text: string;
    try { text = decoder.decode(entry.subarray(0, entry.length - 1)); } catch { continue; }
    const segments = text.split('/');
    if (!text || text.startsWith('/') || text.includes('\\')
      || segments.some(segment => segment === '' || segment === '.' || segment === '..')) continue;
    directories.add(text);
  }
  return [...directories];
}

/**
 * The module whose walk enters `directory`, or null when the walk never does: walking
 * from the root, the first rooted exclusion of the ownership facts or reserved segment
 * reached stops it, as discovery stops there; otherwise the nearest module owns it.
 */
export function walkingModule(ownership: ProjectOwnership, directory: string): string | null {
  const excluded = new Set(ownership.exclusions.map(exclusion => exclusion.directory));
  const modules = new Map(ownership.modules.map(module => [module.directory, module.id]));
  let owner = modules.get('.') ?? null, prefix = '';
  for (const segment of directory.split('/')) {
    prefix = prefix ? `${prefix}/${segment}` : segment;
    if (excluded.has(prefix) || reserved(segment)) return null;
    owner = modules.get(prefix) ?? owner;
  }
  return owner;
}

/**
 * The advisory warnings for one complete check: each directory Git ignores beneath the
 * selected root that Ramify still walks. Excluded directories, their descendants and
 * entries outside the root give none.
 */
export function ignoredButWalked(ownership: ProjectOwnership, output: Uint8Array): ProjectWarning[] {
  const advice: ProjectWarning[] = [];
  for (const directory of ignoredDirectories(output)) {
    const module = walkingModule(ownership, directory);
    if (module === null) continue;
    advice.push({ code: 'ignored-but-walked', path: directory,
      message: `Git ignores this directory, but Ramify walks it as part of module ${module}; `
        + 'declare it owned-ignored or external in that module\'s description if Ramify should leave it out' });
  }
  return advice;
}

/**
 * Add the Git advice to a complete check's report before it is printed. The advice comes
 * from Git's output at check time and the report's ownership facts; it is no analysis
 * input and never changes the outcome, findings or exit code. Without a port, a scope or
 * a listed answer the report is returned unchanged, and a failing port gives no advice.
 */
export async function withGitAdvice(report: AnalysisReport, git: GitPort | undefined, control: RunControl): Promise<AnalysisReport> {
  const scope = report.scope;
  if (!git || !scope || !scope.ownership.modules.length) return report;
  let answer;
  try { answer = await git(scope.root, control); }
  catch { control.signal?.throwIfAborted(); return report; }
  control.signal?.throwIfAborted();
  if (answer.status !== 'listed') return report;
  const present = new Set(report.warnings.filter(warning => warning.code === 'ignored-but-walked').map(warning => warning.path));
  const advice = ignoredButWalked(scope.ownership, answer.output).filter(warning => !present.has(warning.path));
  if (!advice.length) return report;
  const warnings = [...report.warnings, ...advice].sort((a, b) => byteOrder(a.path, b.path) || byteOrder(a.code, b.code));
  return { ...report, warnings, summary: { ...report.summary, warnings: report.summary.warnings + advice.length } };
}
