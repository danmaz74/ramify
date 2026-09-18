#!/usr/bin/env node
// Runs the Plan 2B agent trials: each task of the test cases in a fresh
// session per harness, from the trial root, with the preamble and the task
// prompt. Writes <harness>/<task>.jsonl.gz beside this file and records every
// run's exact command in runs.json.
//
//   node run-trials.mjs [--root /tmp/rp2b-trial] [--harness claude-code|codex]...
//                       [--task D1]... [--parallel 3]
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const root = option('--root')[0] ?? '/tmp/rp2b-trial';
const harnesses = option('--harness').length > 0 ? option('--harness') : ['claude-code', 'codex'];
const parallel = Number(option('--parallel')[0] ?? 3);

const preamble = [
  `You are the architect agent for the Ramify project at ${root}.`,
  'Use only file reading and rg. Do not read files under src/ or subs/.',
  'The generated architect view is at .ramify-architect/.',
  'Answer the question below, name the module and symbol for every claim,',
  'and name the file and line of the evidence you used.',
].join('\n');

// The task prompts of the test cases, verbatim.
const tasks = {
  D1: 'The CLI needs to write several large JSON reports to stdout in order, with a limit on how many bytes may be in flight at once. Does anything in the project already do this? Name the symbol and its module, and say whether other modules can use it today.',
  D2: 'Is there an existing way to start the resident explorer web server for a project? Which modules are allowed to call it?',
  D3: 'When the daemon goes away, does anything reconnect the explorer to it automatically, with increasing delays? Where is that implemented?',
  D4: 'A burst of file changes should be handled as one update rather than one update per file. Does the daemon already coalesce or debounce watcher events? Which symbol owns that behavior?',
  P1: "We want a rule that every module's README purpose paragraph is at most 600 characters, reported as a project issue during a check. Which existing module should own it, and why? If none fits, say so.",
  P2: 'Add rendering of the behavioral dependency diagram to a static SVG file, for inclusion in reports. Which module should implement the rendering, and which should own the command that triggers it?',
  R1: "List every module that depends on `ramify/analysis/model`. For each, say whether its dependency is behavioral, meaning it calls, constructs or passes the model's functions, or only non-behavioral, meaning types, data or forwarding. What does that suggest about separating the model's behavior from its declarations?",
  R2: "Which of `ramify/service-api`'s exposed behavior-capable symbols are not used by any other module? Should they stay exposed?",
  D5: "We want to show each module's purpose in a report. Does something already read a module's purpose paragraph from its README? Could the `explorer` module use it?",
  D6: 'Does the project already compute the lowest common ancestor of two modules in the module tree?',
  D7: 'Is there an existing parser for `.gitignore` files anywhere in the project?',
  D8: 'Does anything already replace queued outbound frames that have not yet been handed to the socket, to handle backpressure?',
  P3: "We need a stdio MCP adapter that exposes the daemon's check and status operations to MCP clients. Is there a module it belongs in, or is a new one justified?",
  R3: 'What does `ramify/daemon/contexts` depend on outside its parent `daemon`, and how much of that is behavioral?',
};
const selected = option('--task').length > 0 ? option('--task') : Object.keys(tasks);

const hook = join(here, 'rg-only-hook.mjs');
const hookSettings = JSON.stringify({
  hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: `node ${hook}` }] }] },
});

function command(harness, prompt) {
  if (harness === 'claude-code') {
    return ['claude', '-p', prompt,
      '--output-format', 'stream-json', '--verbose',
      '--model', 'opus', '--effort', 'high',
      '--tools', 'Read,Grep,Bash',
      '--allowedTools', 'Read', 'Grep', 'Bash(rg:*)',
      '--permission-mode', 'dontAsk',
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--setting-sources', 'project',
      '--settings', hookSettings,
      '--disable-slash-commands',
      '--no-session-persistence'];
  }
  return ['codex', 'exec', '--json',
    '-s', 'read-only', '-C', root,
    '--ignore-user-config',
    '-m', 'gpt-6-astra',
    '-c', 'model_reasoning_effort=high', '-c', 'personality=pragmatic', '-c', 'service_tier=priority',
    '--disable', 'memories', '--disable', 'multi_agent',
    '--enable', 'use_legacy_landlock',
    '--ephemeral',
    prompt];
}

// The calling session's Claude Code variables would make a nested session a child of it.
const removedEnv = Object.keys(process.env).filter((k) => k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')
  || ['CLAUDE_PID', 'CLAUDE_AGENT_SDK_VERSION', 'CLAUDE_EFFORT'].includes(k));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !removedEnv.includes(k)));

const quote = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`);

function run(harness, task) {
  const prompt = `${preamble}\n\n${tasks[task]}`;
  const argv = command(harness, prompt);
  const raw = join(here, harness, `${task}.jsonl`);
  const err = join(here, harness, `${task}.stderr.txt`);
  const started = new Date();
  return new Promise((resolve) => {
    const out = createWriteStream(raw);
    const errOut = createWriteStream(err);
    const child = spawn(argv[0], argv.slice(1), { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => child.kill('SIGTERM'), 20 * 60 * 1000);
    child.stdout.pipe(out);
    child.stderr.pipe(errOut);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      out.end(() => errOut.end(() => {
        writeFileSync(`${raw}.gz`, gzipSync(readFileSync(raw), { level: 9 }));
        unlinkSync(raw);
        const ended = new Date();
        const record = { harness, task, cwd: root, argv, commandLine: argv.map(quote).join(' '),
          removedEnv, started: started.toISOString(), ended: ended.toISOString(),
          durationMs: ended - started, exitCode: code, signal, pid: child.pid,
          transcript: `${harness}/${task}.jsonl.gz`, stderr: `${harness}/${task}.stderr.txt` };
        console.log(`${harness} ${task}: exit ${code}${signal ? ` ${signal}` : ''} in ${Math.round((ended - started) / 1000)} s`);
        resolve(record);
      }));
    });
  });
}

// Only a direct invocation runs trials; a closed stdout must not end the runner.
if (process.argv[1] !== fileURLToPath(import.meta.url)) throw new Error('run-trials.mjs is a command, not a module');
process.stdout.on('error', () => {});

const runsFile = join(here, 'runs.json');
const runs = existsSync(runsFile) ? JSON.parse(readFileSync(runsFile, 'utf8')) : [];
// A task whose transcript exists has run; the runner never repeats it.
const queue = harnesses.flatMap((h) => selected.map((t) => [h, t]))
  .filter(([h, t]) => !existsSync(join(here, h, `${t}.jsonl.gz`)));
// Interleave harnesses so the parallel slots mix them.
queue.sort((a, b) => selected.indexOf(a[1]) - selected.indexOf(b[1]) || harnesses.indexOf(a[0]) - harnesses.indexOf(b[0]));
async function worker() {
  for (let next = queue.shift(); next; next = queue.shift()) {
    const record = await run(...next);
    const at = runs.findIndex((r) => r.harness === record.harness && r.task === record.task && !r.attempt);
    if (at >= 0) runs[at] = record; else runs.push(record);
    runs.sort((a, b) => a.harness.localeCompare(b.harness) || Object.keys(tasks).indexOf(a.task) - Object.keys(tasks).indexOf(b.task));
    writeFileSync(runsFile, `${JSON.stringify(runs, null, 2)}\n`);
  }
}
await Promise.all(Array.from({ length: parallel }, worker));
