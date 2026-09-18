#!/usr/bin/env node
// Scores the Plan 2B agent trials from their transcripts.
//
//   node score.mjs [--root /tmp/rp2b-trial] [--dump <harness>/<task>]
//
// Every count comes from the transcript: each tool call, its input and the
// output the transcript records for it. verdicts.json adds the scorer's
// verdicts and reasons. Writes scores.json and scoring.md beside this file.
//
// Definitions:
// - A tool call is a Claude Code tool_use block, or a Codex command_execution
//   (or any other Codex tool item).
// - A search is one `rg` invocation (a Bash `rg`, one `rg` segment of a Codex
//   shell command, or a Claude Code Grep call) whose pattern can reject a line.
//   An `rg` whose only pattern matches every line (`^`, `$`, `.`, `.*`, '')
//   or `rg --files` reads or lists files and is counted as a read.
// - Hit lines and bytes are the lines and UTF-8 bytes of the output the
//   transcript records for a search call; Claude Code's placeholder for an
//   empty result counts as nothing. When Claude Code persisted an oversized
//   result and recorded only its size and a preview, the recorded command is
//   re-run on the unchanged trial root and its output counted (truncatedCalls
//   records the recorded and re-run sizes). Codex records every output whole,
//   though its model receives a shortened one. A Codex command with several
//   segments counts its whole output once, under its searches when it has any.
// - A search narrows an earlier one when it shares a word of three or more
//   letters with the earlier pattern, other than record keys and module
//   identifier words, and every path it names lies within the earlier
//   search's paths; on exactly the same paths, its words must also be a
//   sub-selection of the earlier search's words, since added alternatives
//   broaden a search. verdicts.json may correct one search, with a reason.
// - An `rg` that names no path and reads a pipe filters the previous command's
//   output and is neither a search nor a read.
// - Source read: a read of, or a search whose scope includes, `src/` or
//   `subs/` of the trial root (a search from the root with no path, or `.`,
//   includes both). Paths inside `.ramify-architect/` never count.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const root = option('--root')[0] ?? '/tmp/rp2b-trial';
const dump = option('--dump')[0];
const taskOrder = ['D1', 'D2', 'D3', 'D4', 'P1', 'P2', 'R1', 'R2', 'D5', 'D6', 'D7', 'D8', 'P3', 'R3'];
const core = new Set(['D1', 'D2', 'D3', 'D4', 'P1', 'P2', 'R1', 'R2']);
const harnesses = ['claude-code', 'codex'];

// ---- shell words -----------------------------------------------------------

// Split a shell command into pipeline segments of words; quotes are removed.
function segments(command) {
  const result = [];
  let words = [];
  let word = null;
  let piped = false;
  const push = () => { if (word !== null) { words.push(word); word = null; } };
  const end = (next) => { push(); if (words.length > 0) { words.piped = piped; result.push(words); } words = []; piped = next; };
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (c === "'") {
      const close = command.indexOf("'", i + 1);
      word = (word ?? '') + command.slice(i + 1, close < 0 ? undefined : close);
      i = close < 0 ? command.length : close;
    } else if (c === '"') {
      word = word ?? '';
      for (i += 1; i < command.length && command[i] !== '"'; i += 1) {
        if (command[i] === '\\' && '"\\$`\n'.includes(command[i + 1])) i += 1;
        word += command[i];
      }
    } else if (c === '\\') {
      word = (word ?? '') + (command[i + 1] ?? ''); i += 1;
    } else if (/\s/.test(c) && c !== '\n') {
      push();
    } else if ('|;&\n'.includes(c)) {
      const doubled = (c === '|' || c === '&') && command[i + 1] === c;
      end(c === '|' && !doubled);
      if (doubled) i += 1;
    } else if (c === '>' || c === '<') {
      push();
      if (command[i + 1] === '&' || command[i + 1] === c) i += 1;
      // Drop the redirection target.
      while (/\s/.test(command[i + 1] ?? '')) i += 1;
      while (i + 1 < command.length && !/[\s|;&]/.test(command[i + 1])) i += 1;
    } else {
      word = (word ?? '') + c;
    }
  }
  end(false);
  return result;
}

// The inner script of a Codex `/usr/bin/zsh -lc <script>` command.
function unwrapShell(command) {
  const [words] = segments(command);
  if (words && /(^|\/)(ba|z)?sh$/.test(words[0]) && ['-lc', '-c'].includes(words[1])) return words[2] ?? '';
  return command;
}

const rgValueShort = new Set(['A', 'B', 'C', 'm', 'e', 'f', 'g', 't', 'T', 'M', 'j', 'r', 'E', 'd']);
const rgValueLong = new Set(['--after-context', '--before-context', '--context', '--max-count', '--regexp', '--file',
  '--glob', '--iglob', '--type', '--type-not', '--max-columns', '--threads', '--replace', '--encoding', '--max-depth',
  '--maxdepth', '--max-filesize', '--sort', '--sortr', '--type-add', '--pre', '--pre-glob', '--color', '--colors',
  '--context-separator', '--field-match-separator', '--field-context-separator', '--path-separator', '--engine',
  '--dfa-size-limit', '--regex-size-limit', '--ignore-file', '--hostname-bin', '--hyperlink-format']);

function parseRg(words) {
  const patterns = [];
  const positional = [];
  const flags = [];
  let files = false;
  for (let i = 1; i < words.length; i += 1) {
    const w = words[i];
    if (w === '--') { positional.push(...words.slice(i + 1)); break; }
    if (w.startsWith('--')) {
      const [name, inline] = w.split(/=(.*)/s);
      if (name === '--files') files = true;
      if (rgValueLong.has(name)) {
        const value = inline ?? words[++i];
        if (name === '--regexp') patterns.push(value);
        flags.push(`${name}=${value}`);
      } else flags.push(name);
    } else if (w.startsWith('-') && w.length > 1) {
      for (let k = 1; k < w.length; k += 1) {
        const letter = w[k];
        if (rgValueShort.has(letter)) {
          const value = k + 1 < w.length ? w.slice(k + 1) : words[++i];
          if (letter === 'e') patterns.push(value);
          flags.push(`-${letter}${value}`);
          break;
        }
        flags.push(`-${letter}`);
      }
    } else positional.push(w);
  }
  if (!files && patterns.length === 0 && positional.length > 0) patterns.push(positional.shift());
  return { patterns, paths: positional, flags, files };
}

const matchesEverything = (p) => ['', '^', '$', '.', '.*', '^.*', '^.*$', '^\\s*', '(?:)'].includes(p);

// ---- paths -------------------------------------------------------------------

function rel(path) {
  const abs = isAbsolute(path) ? normalize(path) : normalize(join(root, path));
  const r = relative(root, abs);
  return r === '' ? '.' : r;
}
const outside = (r) => r.startsWith('..');
const inView = (r) => r === '.ramify-architect' || r.startsWith('.ramify-architect/');
const inSource = (r) => !inView(r) && /^(src|subs)(\/|$)/.test(r);
const containsSource = (r) => r === '.' || inSource(r);
const within = (inner, outer) => outer === '.' ? !outside(inner) : inner === outer || inner.startsWith(`${outer}/`);
// Record keys and module-identifier words say nothing about what a search looks for.
const stopWords = new Set(['name', 'module', 'role', 'file', 'files', 'test', 'tests', 'suite', 'exposed', 'internal',
  'behavioral', 'nonbehavioral', 'shape', 'sig', 'doc', 'kind', 'tags', 'reexposed', 'exercises', 'src', 'subs',
  'ramify', 'jsonl', 'json', 'callable', 'constructable', 'member', 'value', 'type', 'interface', 'parent',
  'descendants', 'uses', 'usedby', 'the', 'and']);
const words = (patterns) => new Set((patterns.join(' ').toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []).filter((w) => !stopWords.has(w)));
const samePaths = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
// A later search narrows an earlier one when they share a search word and the
// later one looks within the earlier one's paths: on fewer paths with any
// shared word, or on the same paths with a sub-selection of the earlier words.
function narrowsSearch(later, earlier) {
  if (![...later.words].some((x) => earlier.words.has(x))) return false;
  if (!later.paths.every((q) => earlier.paths.some((o) => within(q, o)))) return false;
  return !samePaths(later.paths, earlier.paths) || [...later.words].every((x) => earlier.words.has(x));
}

// ---- transcripts ------------------------------------------------------------

function events(harness, task) {
  const file = join(here, harness, `${task}.jsonl.gz`);
  if (!existsSync(file)) return null;
  return gunzipSync(readFileSync(file)).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const text = (content) => typeof content === 'string' ? content
  : (content ?? []).map((c) => c.type === 'text' ? c.text : `[${c.type}]`).join('\n');
const lineCount = (s) => s === '' ? 0 : s.split('\n').length - (s.endsWith('\n') ? 1 : 0);

// One entry per tool call: { tool, input, output, error, parts: [{ kind, ... }] }.
function claudeCalls(list) {
  const calls = [];
  const byId = new Map();
  let model = null;
  let final = '';
  let result = null;
  for (const e of list) {
    if (e.type === 'system' && e.subtype === 'init') model = e.model;
    if (e.type === 'assistant') {
      for (const c of e.message.content) {
        if (c.type === 'tool_use') { const call = { tool: c.name, input: c.input, output: '', error: false }; calls.push(call); byId.set(c.id, call); }
        if (c.type === 'text' && c.text.trim()) final = c.text;
      }
    }
    if (e.type === 'user' && Array.isArray(e.message?.content)) {
      for (const c of e.message.content) {
        if (c.type === 'tool_result' && byId.has(c.tool_use_id)) {
          const call = byId.get(c.tool_use_id);
          const out = text(c.content);
          // Harness placeholders for an empty result are not tool output.
          call.output = ['(Bash completed with no output)', 'No matches found', 'No files found'].includes(out.trim()) ? '' : out;
          call.error = Boolean(c.is_error);
        }
      }
    }
    if (e.type === 'result') { result = e; if (e.result) final = e.result; }
  }
  for (const call of calls) {
    call.parts = claudeParts(call);
    // Claude Code keeps an oversized result in a file and shows the model a
    // preview; the recorded single `rg` command is re-run on the unchanged
    // trial root for its exact output, checked against the recorded size.
    const persisted = /^<persisted-output>\s*Output too large \(([\d.]+)(K|M)?B\)/.exec(call.output);
    if (persisted && call.tool === 'Bash') {
      const run = spawnSync('sh', ['-c', call.input.command], { cwd: root, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' });
      const full = `${run.stdout}${run.stderr}`;
      const recorded = Number(persisted[1]) * (persisted[2] === 'M' ? 1024 * 1024 : persisted[2] === 'K' ? 1024 : 1);
      call.received = call.output;
      call.output = full;
      call.persisted = { recordedBytes: recorded, rerunBytes: Buffer.byteLength(full), agrees: Math.abs(Buffer.byteLength(full) - recorded) <= Math.max(1024, recorded * 0.05) };
    }
  }
  return { calls, model, final, complete: result !== null && !result.is_error, cost: result?.total_cost_usd ?? null,
    turns: result?.num_turns ?? null, denials: result?.permission_denials?.length ?? 0, durationMs: result?.duration_ms ?? null };
}

function claudeParts(call) {
  if (call.tool === 'Read') return [{ kind: 'read', path: rel(call.input.file_path), range: call.input.offset || call.input.limit ? `${call.input.offset ?? 1}+${call.input.limit ?? ''}` : 'all' }];
  if (call.tool === 'Grep') {
    return [{ kind: 'search', via: 'Grep', patterns: [call.input.pattern], paths: [rel(call.input.path ?? '.')], flags: Object.entries(call.input).filter(([k]) => !['pattern', 'path'].includes(k)).map(([k, v]) => `${k}=${v}`) }];
  }
  if (call.tool === 'Bash') {
    if (call.error && /^Only a single rg command is permitted/.test(call.output)) return [{ kind: 'denied', command: call.input.command }];
    return shellParts(call.input.command);
  }
  return [{ kind: 'other', command: `${call.tool} ${JSON.stringify(call.input)}` }];
}

function codexCalls(list) {
  const calls = [];
  let final = '';
  let complete = false;
  let usage = null;
  for (const e of list) {
    if (e.type === 'item.completed') {
      const i = e.item;
      if (i.type === 'command_execution') calls.push({ tool: 'shell', input: { command: i.command }, output: i.aggregated_output ?? '', error: i.exit_code !== 0 && i.exit_code !== 1, exitCode: i.exit_code, parts: shellParts(unwrapShell(i.command)) });
      else if (i.type === 'agent_message') final = i.text;
      else if (!['reasoning', 'error', 'todo_list'].includes(i.type)) calls.push({ tool: i.type, input: i, output: '', error: false, parts: [{ kind: 'other', command: i.type }] });
    }
    if (e.type === 'turn.completed') { complete = true; usage = e.usage; }
  }
  return { calls, model: null, final, complete, usage };
}

function shellParts(command) {
  return segments(command).map((w) => {
    const name = w[0].replace(/^.*\//, '');
    if (name === 'rg') {
      const rg = parseRg(w);
      // An rg that names no path and reads a pipe filters the previous output.
      if (w.piped && rg.paths.length === 0) return { kind: 'filter', command: w.join(' ') };
      const paths = (rg.paths.length > 0 ? rg.paths : ['.']).map(rel);
      if (rg.files) return { kind: 'list', via: 'rg --files', paths, command: w.join(' ') };
      if (rg.patterns.every(matchesEverything)) return { kind: 'read', via: 'rg', path: paths.join(' '), paths, range: 'all' };
      return { kind: 'search', via: 'rg', patterns: rg.patterns, paths, flags: rg.flags };
    }
    if (['cat', 'nl', 'sed', 'head', 'tail', 'less', 'bat', 'jq', 'awk'].includes(name)) {
      const files = w.slice(1).filter((a, i, all) => !a.startsWith('-') && !(name === 'sed' && i === all.findIndex((x) => !x.startsWith('-'))) && !(name === 'awk' && i === all.findIndex((x) => !x.startsWith('-'))) && !/^\d+$/.test(a) && !(name === 'jq' && i === 0));
      if (files.length === 0) return { kind: 'filter', command: w.join(' ') };
      return { kind: 'read', via: name, path: files.map(rel).join(' '), paths: files.map(rel), range: ['cat', 'nl', 'bat', 'less'].includes(name) ? 'all' : w.slice(1).join(' ') };
    }
    if (['grep', 'egrep', 'fgrep', 'ag', 'ack', 'git'].includes(name)) return { kind: 'other-search', command: w.join(' '), paths: w.slice(1).filter((a) => !a.startsWith('-')).slice(1).map(rel) };
    if (['wc', 'sort', 'uniq', 'cut', 'tr', 'xargs', 'true'].includes(name)) return { kind: 'filter', command: w.join(' ') };
    return { kind: 'other', command: w.join(' '), paths: w.slice(1).filter((a) => !a.startsWith('-')).map(rel) };
  });
}

// ---- measures ----------------------------------------------------------------

function measure(harness, task) {
  const list = events(harness, task);
  if (list === null) return null;
  const t = harness === 'claude-code' ? claudeCalls(list) : codexCalls(list);
  const searches = [];
  let hitLines = 0;
  let hitBytes = 0;
  let readBytes = 0;
  const reads = [];
  const other = [];
  let readme = 'no';
  const sourceAccess = [];
  const outsideAccess = [];
  const truncated = [];
  const denied = [];
  for (const [index, call] of t.calls.entries()) {
    const searchParts = call.parts.filter((p) => p.kind === 'search');
    const out = call.output ?? '';
    if (call.persisted) truncated.push({ call: index + 1, ...call.persisted });
    if (searchParts.length > 0) { hitLines += lineCount(out); hitBytes += Buffer.byteLength(out); }
    else if (call.parts.some((p) => p.kind === 'read')) readBytes += Buffer.byteLength(out);
    for (const p of call.parts) {
      const paths = p.paths ?? (p.path ? [p.path] : []);
      if (p.kind === 'search') {
        const w = words(p.patterns);
        const narrows = searches.some((s) => narrowsSearch({ words: w, paths: p.paths }, s));
        searches.push({ call: index + 1, via: p.via, patterns: p.patterns, paths: p.paths, flags: p.flags, words: w, narrows, lines: lineCount(out), bytes: Buffer.byteLength(out) });
        if (p.paths.some(containsSource)) sourceAccess.push(`search ${p.patterns.join(' | ')} in ${p.paths.join(' ')}`);
      } else if (p.kind === 'read') {
        reads.push({ call: index + 1, via: p.via ?? 'Read', path: p.path, range: p.range, bytes: Buffer.byteLength(out) });
        for (const q of paths) {
          if (q === '.ramify-architect/README.md') readme = p.range === 'all' ? 'yes' : readme === 'yes' ? 'yes' : 'partial';
          if (inSource(q)) sourceAccess.push(`read ${q}`);
        }
      } else if (p.kind === 'denied') denied.push(p.command);
      else if (p.kind !== 'filter') other.push(p.command ?? p.kind);
      for (const q of paths) if (outside(q)) outsideAccess.push(`${p.kind} ${q}`);
      if (p.kind === 'list' || p.kind === 'other' || p.kind === 'other-search') for (const q of paths) if (containsSource(q) && q !== '.') sourceAccess.push(`${p.kind} ${q}`);
    }
  }
  return {
    harness, task, core: core.has(task), complete: t.complete, model: t.model,
    toolCalls: t.calls.length, searches: searches.length, narrowing: searches.filter((s) => s.narrows).length,
    hitLines, hitBytes, readBytes, readme, sourceRead: sourceAccess.length > 0, sourceAccess, outsideAccess,
    reads, other, denied, truncatedCalls: truncated,
    searchList: searches.map(({ words: _w, ...s }) => s),
    final: t.final, cost: t.cost ?? null, usage: t.usage ?? null,
  };
}

// ---- output ------------------------------------------------------------------

if (dump) {
  const [harness, task] = dump.split('/');
  const list = events(harness, task);
  const t = harness === 'claude-code' ? claudeCalls(list) : codexCalls(list);
  t.calls.forEach((c, i) => {
    console.log(`#${i + 1} ${c.tool} ${JSON.stringify(c.input.command ?? c.input).slice(0, 400)}`);
    console.log(`   parts: ${c.parts.map((p) => `${p.kind}${p.via ? `/${p.via}` : ''} ${p.patterns ? JSON.stringify(p.patterns) : ''} ${(p.paths ?? (p.path ? [p.path] : [])).join(' ')}${p.range ? ` [${p.range}]` : ''}`).join(' ; ')}`);
    console.log(`   output: ${lineCount(c.output)} lines, ${Buffer.byteLength(c.output)} bytes${c.error ? ', error' : ''}: ${JSON.stringify(c.output.slice(0, 300))}`);
  });
  console.log(`\nFINAL (${t.complete ? 'complete' : 'INCOMPLETE'}):\n${t.final}`);
  process.exit(0);
}

const verdictFile = join(here, 'verdicts.json');
const verdicts = existsSync(verdictFile) ? JSON.parse(readFileSync(verdictFile, 'utf8')) : {};
const rows = [];
for (const harness of harnesses) {
  for (const task of taskOrder) {
    const m = measure(harness, task);
    if (m === null) continue;
    const v = verdicts[`${harness}/${task}`] ?? {};
    // A scorer correction names a search by its call and says whether it narrows, with a reason.
    for (const c of v.narrowingCorrections ?? []) {
      const search = m.searchList.find((x) => x.call === c.call);
      if (!search) throw new Error(`${harness}/${task}: no search at call ${c.call}`);
      search.narrows = c.narrows;
      search.correction = c.reason;
    }
    const narrowing = m.searchList.filter((x) => x.narrows).length;
    rows.push({ ...m, narrowingAutomatic: m.narrowing, narrowing, verdict: v.verdict ?? 'unscored', notes: v.notes ?? '', reachedBy: v.reachedBy ?? null });
  }
}
writeFileSync(join(here, 'scores.json'), `${JSON.stringify(rows, null, 2)}\n`);

// Claude Code's Grep content results replace a long matching line with a
// placeholder; the lengths of shown and omitted view lines give its limit.
function grepOmissions() {
  const shown = [];
  const omitted = [];
  for (const task of taskOrder) {
    const list = events('claude-code', task);
    if (list === null) continue;
    const inputs = new Map();
    for (const e of list) if (e.type === 'assistant') for (const c of e.message.content) if (c.type === 'tool_use' && c.name === 'Grep') inputs.set(c.id, c.input);
    for (const e of list) {
      if (e.type !== 'user' || !Array.isArray(e.message?.content)) continue;
      for (const c of e.message.content) {
        const input = inputs.get(c.tool_use_id);
        if (c.type !== 'tool_result' || !input || input['-o'] || input.output_mode !== 'content') continue;
        for (const line of text(c.content).split('\n')) {
          const m = /^(?:[^:]*\/)?(\.ramify-architect\/[^:]+):(\d+):(.*)$/.exec(line);
          if (!m) continue;
          const original = readFileSync(join(root, m[1]), 'utf8').split('\n')[Number(m[2]) - 1];
          if (original === undefined) continue;
          (m[3] === '[Omitted long matching line]' ? omitted : shown).push(original.length);
        }
      }
    }
  }
  return { shown: shown.length, longestShown: Math.max(...shown), omitted: omitted.length, shortestOmitted: Math.min(...omitted) };
}
const omission = grepOmissions();

const fmt = (n) => n.toLocaleString('en-US');
const md = ['# Plan 2B agent trials: scores', '',
  'Generated by `score.mjs` from the transcripts in this directory and the verdicts in `verdicts.json`.',
  'Definitions are in the header of `score.mjs`. Hit lines and bytes count search output only; `rg` reads',
  "of whole files (pattern `^` and the like) are reads, whose bytes are in the Read bytes column.", ''];
for (const harness of harnesses) {
  const hr = rows.filter((r) => r.harness === harness);
  if (hr.length === 0) continue;
  md.push(`## ${harness === 'claude-code' ? 'Claude Code' : 'Codex CLI'}`, '',
    '| Task | Set | Tool calls | Searches (narrowing) | Hit lines | Hit bytes | Read bytes | README | Source read | Verdict | Notes |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- |');
  for (const r of hr) {
    const narrowing = r.narrowing;
    md.push(`| ${r.task} | ${r.core ? 'core' : 'extended'} | ${r.toolCalls} | ${r.searches} (${narrowing}) | ${fmt(r.hitLines)} | ${fmt(r.hitBytes)} | ${fmt(r.readBytes)} | ${r.readme} | ${r.sourceRead ? `yes: ${r.sourceAccess.join('; ')}` : 'no'} | ${r.verdict} | ${(r.reachedBy ? `${r.notes} Reached by: ${r.reachedBy}` : r.notes).replaceAll('|', '\\|')} |`);
  }
  for (const [label, set] of [['Core', hr.filter((r) => r.core)], ['Extended', hr.filter((r) => !r.core)], ['All', hr]]) {
    if (set.length === 0) continue;
    const found = set.filter((r) => r.verdict === 'pass').length;
    const maxNarrow = Math.max(...set.map((r) => r.narrowing));
    const sources = set.filter((r) => r.sourceRead).length;
    const mean = set.reduce((a, r) => a + r.hitLines, 0) / set.length;
    const meanBytes = set.reduce((a, r) => a + r.hitBytes, 0) / set.length;
    const over = set.filter((r) => r.hitLines > 300 || r.hitBytes > 65536).length;
    md.push('', `${label}: ${found} of ${set.length} pass; ${set.filter((r) => r.verdict === 'partial').length} partial; ${set.filter((r) => r.verdict === 'fail').length} fail; maximum narrowing searches ${maxNarrow}; source reads ${sources}; hit lines mean ${mean.toFixed(1)}, bytes mean ${fmt(Math.round(meanBytes))}; tasks over 300 lines or 64 KB ${over}.`);
  }
  md.push('');
}
md.push(`Claude Code's Grep, in content mode without \`-o\`, replaced ${omission.omitted} of ${omission.shown + omission.omitted} matched view lines with \`[Omitted long matching line]\`: every omitted line has at least ${omission.shortestOmitted} characters, and the longest shown line ${omission.longestShown}.`, '');
writeFileSync(join(here, 'scoring.md'), `${md.join('\n')}\n`);
console.log(md.join('\n'));
