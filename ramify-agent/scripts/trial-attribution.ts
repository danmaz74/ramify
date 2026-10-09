import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifySetupLineIdentities, type SetupAddedLineFact, type SetupDeletedLineFact, type SetupSourceLine } from '../subs/harness/src/kpi/setup-attribution.js';
export { trialReportDestination } from '../subs/harness/src/kpi/trial-report.js';

/** Native adapter owns its command boundary. Ordinary tests inject every raw answer. */
export type TrialGitCommand = (project: string, args: readonly string[]) => Promise<Uint8Array>;
export interface TrialScratchSetupRecord {
  readonly id: string; readonly runId: string; readonly originalIgnoreBase64: string | null;
  readonly commit: string | null; readonly appended: boolean;
}
export interface TrialSetupAttribution {
  readonly state: 'verified' | 'unavailable'; readonly reason: string | null;
  readonly identities: ReturnType<typeof verifySetupLineIdentities> | null;
  /** Entire current path change consists ONLY of verified setup lines, with unchanged modes/bytes beyond them. */
  readonly setupOnly: boolean;
  readonly added: number | null; readonly deleted: number | null;
  /** Remaining direct diff/working-tree facts still require ordinary scope accounting. */
  readonly nonSetup: { readonly added: number; readonly deleted: number; readonly bytesChanged: boolean; readonly modeChanged: boolean } | null;
}
const execute = promisify(execFile);
export const nativeTrialGit: TrialGitCommand = async (project, args) => {
  const { NODE_OPTIONS: _flags, ...environment } = process.env;
  const result = await execute('git', ['-C', project, ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024,
    env: { ...environment, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_OPTIONAL_LOCKS: '0' } });
  return new Uint8Array(result.stdout);
};
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const utf8 = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const same = (left: Uint8Array | null, right: Uint8Array | null) => left === null ? right === null : right !== null && Buffer.from(left).equals(Buffer.from(right));
const safePath = (value: string) => !value.startsWith('/') && !/[\\\0]/.test(value) && value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
function lines(bytes: Uint8Array | null): Uint8Array[] {
  if (bytes === null) return [];
  utf8(bytes); if (bytes.includes(0)) throw new Error('Binary setup blob cannot prove text lines');
  const result: Uint8Array[] = []; let start = 0;
  for (let index = 0; index < bytes.length; index++) if (bytes[index] === 10) { result.push(bytes.slice(start, index + 1)); start = index + 1; }
  if (start < bytes.length) result.push(bytes.slice(start));
  return result;
}
function positions(patch: string, beforeBytes: Uint8Array | null, afterBytes: Uint8Array | null): { added: number[]; deleted: number[] } {
  if (/Binary files|GIT binary patch/u.test(patch)) throw new Error('Binary direct diff is unavailable');
  const before = lines(beforeBytes); const after = lines(afterBytes);
  const added: number[] = []; const deleted: number[] = [];
  const patchLines = patch.split('\n'); let oldCursor = 0; let newCursor = 0;
  const identical = (left: readonly Uint8Array[], right: readonly Uint8Array[]) => left.length === right.length && left.every((value, index) => same(value, right[index]!));
  for (let cursor = 0; cursor < patchLines.length; cursor++) {
    const header = patchLines[cursor]!;
    if (!header.startsWith('@@')) continue;
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(header);
    if (!match) throw new Error('Malformed direct diff range');
    const oldStart = Number(match[1]); const oldCount = Number(match[2] ?? 1); const newStart = Number(match[3]); const newCount = Number(match[4] ?? 1);
    const oldIndex = oldCount === 0 ? oldStart : oldStart - 1; const newIndex = newCount === 0 ? newStart : newStart - 1;
    if (oldIndex < oldCursor || newIndex < newCursor || oldIndex + oldCount > before.length || newIndex + newCount > after.length ||
        !identical(before.slice(oldCursor, oldIndex), after.slice(newCursor, newIndex))) throw new Error('Direct diff omitted or reordered authenticated changes');
    const oldBody: Uint8Array[] = []; const newBody: Uint8Array[] = []; let previous: '+' | '-' | ' ' | null = null;
    while (cursor + 1 < patchLines.length) {
      const line = patchLines[cursor + 1]!;
      if (line.startsWith('@@') || line.startsWith('diff ') || line === '') break;
      if (line === '\\ No newline at end of file') {
        if (previous === null) throw new Error('Unbound diff newline marker');
        if (previous !== '+') oldBody[oldBody.length - 1] = oldBody.at(-1)!.slice(0, -1);
        if (previous !== '-') newBody[newBody.length - 1] = newBody.at(-1)!.slice(0, -1);
        cursor++; continue;
      }
      const kind = line[0]; if (kind !== '+' && kind !== '-' && kind !== ' ') throw new Error('Malformed direct diff body');
      const bytes = Buffer.from(`${line.slice(1)}\n`);
      if (kind !== '+') { if (kind === '-') deleted.push(oldIndex + oldBody.length + 1); oldBody.push(bytes); }
      if (kind !== '-') { if (kind === '+') added.push(newIndex + newBody.length + 1); newBody.push(bytes); }
      previous = kind; cursor++;
    }
    if (oldBody.length !== oldCount || newBody.length !== newCount || !identical(oldBody, before.slice(oldIndex, oldIndex + oldCount)) || !identical(newBody, after.slice(newIndex, newIndex + newCount))) throw new Error('Direct diff body differs from authenticated blob ranges');
    oldCursor = oldIndex + oldCount; newCursor = newIndex + newCount;
  }
  if (!identical(before.slice(oldCursor), after.slice(newCursor))) throw new Error('Direct diff coverage is incomplete');
  return { added, deleted };
}
function sourceLines(bytes: Uint8Array | null, requested: readonly number[]): SetupSourceLine[] {
  const content = lines(bytes);
  return requested.map(line => { const value = content[line - 1]; if (!Number.isSafeInteger(line) || line < 1 || value === undefined) throw new Error('Diff line lies outside authenticated blob'); return { line, hash: hash(value) }; });
}
interface Blame { readonly line: number; readonly commit: string; readonly sourceLine: number; readonly sourcePath: string; readonly boundary: boolean }
/** This scratch-only adapter accepts exact authenticated filename metadata, never guesses rename lineage. */
function blame(text: string): Blame[] {
  const result: Blame[] = []; let current: Blame | null = null; let filename = false;
  for (const line of text.split('\n')) {
    const header = /^(\^?)([a-f0-9]{40}|[a-f0-9]{64}) (\d+) (\d+)(?: \d+)?$/u.exec(line);
    if (header) { if (current !== null) throw new Error('Incomplete blame row'); current = { commit: header[2]!, sourceLine: Number(header[3]), line: Number(header[4]), sourcePath: '', boundary: header[1] === '^' }; filename = false; continue; }
    if (current === null) continue;
    if (line === 'boundary') current = { ...current, boundary: true };
    if (line.startsWith('filename ')) {
      if (filename) throw new Error('Duplicate blame path');
      const encoded = line.slice(9); let decoded: unknown = encoded;
      if (encoded.startsWith('"')) { try { decoded = JSON.parse(encoded); } catch { throw new Error('Unsupported quoted Git filename'); } }
      if (typeof decoded !== 'string' || !safePath(decoded)) throw new Error('Unsafe blame source path');
      current = { ...current, sourcePath: decoded }; filename = true;
    }
    if (line.startsWith('\t')) { if (!filename || current.sourceLine < 1 || current.line < 1) throw new Error('Missing blame source identity'); result.push(current); current = null; }
  }
  if (current !== null) throw new Error('Incomplete blame row');
  return result;
}

/** Extracts only the owning run's durable scratch effect; no trailer or appended flag authorizes lines. */
export function recordedTrialScratch(events: readonly unknown[], runId: string): TrialScratchSetupRecord | null {
  const owned = events.map(value => value as { jobId?: string; sequence?: number; type?: string; data?: Record<string, unknown> });
  const intents = owned.filter(event => event.type === 'scratch-setting-up'); const completions = owned.filter(event => event.type === 'scratch-setup-complete');
  if (!intents.length && !completions.length) return null;
  if (intents.length !== 1 || completions.length !== 1) throw new Error('Ambiguous scratch effect records');
  const intent = intents[0]!; const complete = completions[0]!;
  if (intent.jobId !== runId || complete.jobId !== runId || !Number.isSafeInteger(intent.sequence) || !Number.isSafeInteger(complete.sequence) || intent.sequence! >= complete.sequence! ||
      (intent.data?.['originalIgnoreBase64'] !== null && typeof intent.data?.['originalIgnoreBase64'] !== 'string') ||
      (complete.data?.['commit'] !== null && typeof complete.data?.['commit'] !== 'string') || typeof complete.data?.['appended'] !== 'boolean') throw new Error('Invalid owning scratch effect records');
  return { id: `scratch-setup:${intent.sequence}`, runId, originalIgnoreBase64: intent.data!['originalIgnoreBase64'] as string | null, commit: complete.data!['commit'] as string | null, appended: complete.data!['appended'] as boolean };
}

/** Validates the established scratch append and maps only its exact surviving direct-diff identities.
 * Raw blob bytes survive the boundary; fatal UTF-8 decode distinguishes invalid bytes from legitimate U+FFFD.
 */
export async function collectTrialScratchSetup(input: {
  readonly project: string; readonly runId: string; readonly base: string; readonly final: string;
  readonly record: TrialScratchSetupRecord | null; readonly currentIgnoreBytes: Uint8Array | null; readonly currentIgnoreMode: '100644' | '100755' | null;
}, command: TrialGitCommand = nativeTrialGit): Promise<TrialSetupAttribution> {
  const unavailable = (reason: string): TrialSetupAttribution => ({ state: 'unavailable', reason, identities: null, setupOnly: false, added: null, deleted: null, nonSetup: null });
  const none = (): TrialSetupAttribution => ({ state: 'verified', reason: null, identities: { base: input.base, final: input.final, entries: [] }, setupOnly: false, added: 0, deleted: 0, nonSetup: null });
  try {
    const record = input.record;
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(input.base) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(input.final) || !input.runId) return unavailable('Invalid run or commit identities');
    if (record === null) return none();
    if (record.runId !== input.runId || !record.id) return unavailable('Setup record belongs to another run');
    if (!record.appended && record.commit === null) return none();
    if (!record.appended || !record.commit || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(record.commit)) return unavailable('Scratch append has no verified containing commit');
    const query = (args: readonly string[]) => command(input.project, args);
    const text = async (args: readonly string[]) => utf8(await query(args));
    const prefixOutput = await text(['rev-parse', '--show-prefix']);
    if (!prefixOutput.endsWith('\n')) throw new Error('Git project prefix unavailable');
    const prefix = prefixOutput.slice(0, -1);
    if (prefix !== '' && (!prefix.endsWith('/') || !safePath(prefix.slice(0, -1)))) throw new Error('Unsafe project prefix');
    const objectPath = `${prefix}.gitignore`;
    const history = (await text(['rev-list', '--first-parent', '--reverse', input.final])).trim().split('\n').filter(Boolean);
    const start = history.indexOf(input.base); const chain = start < 0 ? [] : history.slice(start);
    if (chain[0] !== input.base || chain.at(-1) !== input.final || new Set(chain).size !== chain.length) throw new Error('Complete first-parent BASE-to-FINAL chain unavailable');
    const containing = chain.indexOf(record.commit);
    if (containing < 1) throw new Error('Setup commit lacks an authenticated before boundary in this run');
    const beforeRevision = chain[containing - 1]!;
    const blob = async (revision: string): Promise<{ bytes: Uint8Array | null; mode: string | null }> => {
      const tree = await text(['ls-tree', '-rz', '--full-tree', revision]);
      const rows = tree.split('\0').filter(Boolean).filter(row => row.slice(row.indexOf('\t') + 1) === objectPath);
      if (rows.length === 0) return { bytes: null, mode: null };
      if (rows.length !== 1) throw new Error('Ambiguous setup blob path');
      const match = /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t/u.exec(rows[0]!);
      if (!match) throw new Error('Setup path is not a regular Git blob');
      const bytes = await query(['cat-file', 'blob', `${revision}:${objectPath}`]);
      const objectHash = createHash(match[2]!.length === 40 ? 'sha1' : 'sha256').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
      if (objectHash !== match[2]) throw new Error('Raw Git blob bytes differ from authenticated object identity');
      lines(bytes); return { bytes, mode: match[1]! };
    };
    const original = record.originalIgnoreBase64 === null ? null : Buffer.from(record.originalIgnoreBase64, 'base64');
    if (original !== null && original.toString('base64') !== record.originalIgnoreBase64) throw new Error('Malformed original setup bytes');
    lines(original);
    const before = await blob(beforeRevision); const after = await blob(record.commit); const base = await blob(input.base); const final = await blob(input.final);
    if (!same(before.bytes, original)) throw new Error('Recorded setup-before bytes differ from containing commit parent');
    if (lines(original).some(line => utf8(line).replace(/\r?\n$/u, '') === '**/src/tmp/')) throw new Error('Recorded append repeats an existing scratch rule');
    const suffix = original === null || original.length === 0 || original.at(-1) === 10 ? '' : '\n';
    const expected = Buffer.concat([original ?? Buffer.alloc(0), Buffer.from(`${suffix}**/src/tmp/\n`)]);
    if (!same(after.bytes, expected) || (before.mode !== null && after.mode !== before.mode)) throw new Error('Containing setup blob includes unrecorded changes; exact setup identity unavailable');
    const delta = async (from: string, to: string, old: Uint8Array | null, next: Uint8Array | null) => positions(await text(['diff', '--no-ext-diff', '--no-textconv', '--unified=0', '--no-renames', from, to, '--', '.gitignore']), old, next);
    const setup = await delta(beforeRevision, record.commit, before.bytes, after.bytes); const direct = await delta(input.base, input.final, base.bytes, final.bytes);
    const added = sourceLines(after.bytes, setup.added); const deleted = sourceLines(before.bytes, setup.deleted);
    const mapped = async (from: string, to: string, requested: readonly number[], reverse: boolean) => {
      if (!requested.length) return [];
      const args = ['blame', '--line-porcelain', ...(reverse ? ['--reverse'] : [])];
      for (const line of requested) args.push('-L', `${line},${line}`);
      args.push(reverse ? `${from}..${to}` : to, '--', '.gitignore');
      const rows = blame(await text(args));
      if (rows.length !== requested.length || new Set(rows.map(row => row.line)).size !== rows.length || rows.some(row => !requested.includes(row.line))) throw new Error('Incomplete changed-line blame coverage');
      return rows;
    };
    const finalRows = await mapped(input.base, input.final, direct.added, false);
    const baseRows = await mapped(input.base, input.final, direct.deleted, true);
    const beforeRows = beforeRevision === input.base ? null : await mapped(input.base, beforeRevision, direct.deleted, true);
    const relativePath = (repositoryPath: string) => repositoryPath === objectPath ? '.gitignore' : '';
    const finalHashes = new Map(sourceLines(final.bytes, direct.added).map(line => [line.line, line.hash]));
    const baseHashes = new Map(sourceLines(base.bytes, direct.deleted).map(line => [line.line, line.hash]));
    const finalAdded: SetupAddedLineFact[] = finalRows.map(row => ({ line: row.line, hash: finalHashes.get(row.line)!, originCommit: row.commit, originPath: relativePath(row.sourcePath), originLine: row.sourceLine, boundary: row.boundary }));
    const baseDeleted: SetupDeletedLineFact[] = baseRows.map(row => {
      const source = beforeRows?.find(value => value.line === row.line);
      const last = chain.indexOf(row.commit);
      if (last < 0 || chain[last + 1] === undefined) throw new Error('Actual deleting commit identity unavailable on first-parent chain');
      return { line: row.line, hash: baseHashes.get(row.line)!, lastSeenCommit: row.commit, sourceBeforePath: beforeRevision === input.base ? '.gitignore' : source?.commit === beforeRevision ? relativePath(source.sourcePath) : '',
        sourceBeforeLine: beforeRevision === input.base ? row.line : source?.commit === beforeRevision ? source.sourceLine : null, removingCommit: chain[last + 1]! };
    });
    const candidates = [...finalAdded.map(row => ({ commit: row.originCommit, path: '.gitignore', kind: 'added' as const })), ...baseDeleted.map(row => ({ commit: row.removingCommit ?? '', path: '.gitignore', kind: 'deleted' as const }))];
    const identities = verifySetupLineIdentities({ runId: input.runId, base: input.base, final: input.final, firstParentCommits: chain, candidates,
      records: [{ id: record.id, runId: record.runId, path: '.gitignore', beforeRevision, commit: record.commit, beforeBlobHash: original === null ? null : hash(original), afterBlobHash: hash(expected), added, deleted }],
      facts: [{ recordId: record.id, base: input.base, final: input.final, beforeRevision, commit: record.commit, beforeBlobHash: before.bytes === null ? null : hash(before.bytes), afterBlobHash: after.bytes === null ? null : hash(after.bytes), sourceAdded: added, sourceDeleted: deleted, beforePath: '.gitignore', afterPath: '.gitignore', finalAdded, baseDeleted }] });
    const entries = identities.entries;
    if (entries.some(entry => entry.added === null || entry.deleted === null)) return { state: 'unavailable', reason: 'Exact surviving setup line mapping unavailable', identities, setupOnly: false, added: null, deleted: null, nonSetup: null };
    const setupAdded = entries.reduce((total, entry) => total + entry.added!.length, 0); const setupDeleted = entries.reduce((total, entry) => total + entry.deleted!.length, 0);
    const nonSetup = { added: direct.added.length - setupAdded, deleted: direct.deleted.length - setupDeleted, bytesChanged: !same(input.currentIgnoreBytes, final.bytes), modeChanged: after.mode !== final.mode || input.currentIgnoreMode !== final.mode };
    return { state: 'verified', reason: null, identities, nonSetup, setupOnly: direct.added.length + direct.deleted.length > 0 && setupAdded === direct.added.length && setupDeleted === direct.deleted.length && same(input.currentIgnoreBytes, final.bytes) && after.mode === final.mode && input.currentIgnoreMode === final.mode, added: setupAdded, deleted: setupDeleted };
  } catch (error) { return unavailable(error instanceof Error ? error.message : String(error)); }
}

/** Root-owned native CLI seam for the exact registered Q01 subprocess witness. */
export async function runTrialAttributionCommand(inputFile: string, command: TrialGitCommand = nativeTrialGit): Promise<TrialSetupAttribution> {
  const input = JSON.parse(await readFile(inputFile, 'utf8')) as Record<string, unknown>;
  if (input === null || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['schema', 'project', 'runId', 'base', 'final', 'eventsFile'].includes(key)) || input['schema'] !== 'ramify-agent.trial-attribution-input/1' || ['project', 'runId', 'base', 'final', 'eventsFile'].some(field => typeof input[field] !== 'string' || input[field] === '')) throw new Error('Invalid trial attribution command input');
  const project = await realpath(input['project'] as string); const runId = input['runId'] as string;
  const events = (await readFile(input['eventsFile'] as string, 'utf8')).split('\n').filter(Boolean).map(line => (JSON.parse(line) as { event: unknown }).event);
  const ignoreFile = join(project, '.gitignore');
  const info = await lstat(ignoreFile).catch((error: unknown) => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
  if (info !== null && !info.isFile()) throw new Error('Current .gitignore is not a regular file');
  return collectTrialScratchSetup({ project, runId, base: input['base'] as string, final: input['final'] as string, record: recordedTrialScratch(events, runId), currentIgnoreBytes: info === null ? null : await readFile(ignoreFile), currentIgnoreMode: info === null ? null : (info.mode & 0o111) !== 0 ? '100755' : '100644' }, command);
}
/** Exit1 denotes a non-setup path delta requiring scope accounting, not semantic judgment. */
export function trialAttributionExitCode(result: TrialSetupAttribution): 0 | 1 | 2 {
  if (result.state !== 'verified' || result.nonSetup === null) return 2;
  return result.nonSetup.added > 0 || result.nonSetup.deleted > 0 || result.nonSetup.bytesChanged || result.nonSetup.modeChanged ? 1 : 0;
}
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const inputFile = process.argv[2];
  if (!inputFile) { console.error('Usage: tsx scripts/trial-attribution.ts <external-input.json>'); process.exitCode = 2; }
  else void runTrialAttributionCommand(inputFile).then(result => { const code = trialAttributionExitCode(result); console.log(JSON.stringify({ ...result, verification: code === 2 ? 'unavailable' : code === 1 ? 'non-setup-change' : result.setupOnly ? 'setup-only' : 'unchanged' })); process.exitCode = code; }, error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; });
}
