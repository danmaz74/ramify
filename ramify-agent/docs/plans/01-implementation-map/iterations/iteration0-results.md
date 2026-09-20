# Iteration 0 results: pi spike

**Date:** 2026-09-19. **Status:** done, except login, which needs a person.

## Delivered

- **Pinned dependency:** `"@earendil-works/pi-coding-agent": "0.85.1"` (exact),
  in `package.json` and `package-lock.json`. `@mariozechner/pi-coding-agent`
  (latest 0.73.1) is deprecated on npm with "please use
  @earendil-works/pi-coding-agent instead going forward"; the successor's
  README and `docs/sdk.md` document the SDK under the new name. It requires
  Node >= 22.19.0; this environment runs 22.23.2.
- **Spike:** `spikes/pi/spike.ts`, with `spikes/pi/tsconfig.json` so it can be
  type-checked on its own. Both are outside the root compiler scope and every
  module. Iteration 3 deletes them.

## How the spike runs

`npx tsx spikes/pi/spike.ts` from `ramify-agent/`. It creates a real pi
`AgentSession` in this process with pi's real agent loop, tool validation,
built-in `read`, `grep` and `ls` tools on this checkout, event stream, abort
and session file. Only the model is scripted. The spike uses pi-ai's
`fauxProvider`, registered with `ModelRuntime.registerNativeProvider`. The
faux model records the system prompt and tool list that pi sends it.

pi is isolated from `~/.pi`. `PI_CODING_AGENT_DIR`, the auth file, the model
store and the session directory are all in a temporary directory, and
`PI_OFFLINE=1`. After the run, `~/.pi` still does not exist.
`npx tsc --noEmit -p spikes/pi/tsconfig.json` passes, so pi's published
types resolve under the project's NodeNext and TypeScript 7 settings.

"Executed" below means observed in that run. "Source only" means read in
`node_modules/@earendil-works/pi-coding-agent` (docs, `.d.ts` and `dist`
JavaScript) without running it.

## Findings per item

| # | Item | Status |
| ---: | --- | --- |
| 1 | Replacement system prompt, restricted tools | Confirmed, executed |
| 2 | Schema tool that ends the turn | Confirmed, executed |
| 3 | Event stream with tool arguments | Confirmed, executed |
| 4 | Token usage per message | Confirmed through the pipeline (executed, with faux values); real-provider values from source only |
| 5 | Login through a subscription | **Not confirmed**: needs a person |
| 6 | Loading the skill | Confirmed, executed |
| 7 | Stop | Confirmed, executed; cooperative, not unconditional |
| 8 | Session record in the job's `session/` | Confirmed, executed |

### 1. Replacement system prompt and restricted tool set

- `tools: ['read', 'grep', 'ls', 'submit_implementation_map']` is an
  allowlist. The model received exactly those four tools, and
  `session.agent.state.tools` held the same four.
- `DefaultResourceLoader({ systemPromptOverride })` does **not** yield an
  exact prompt. pi's `buildSystemPrompt` still appends context files, the
  skills block and a final `Current working directory: <cwd>` line. The model
  received the replacement followed by those additions.
- By default, context-file discovery reads `AGENTS.override.md`, `AGENTS.md`
  and `CLAUDE.md` from the cwd upwards, plus global extensions, skills and
  settings from the agent directory. The spike turned all of this off with
  `noContextFiles`, `noExtensions`, `noSkills`, `noPromptTemplates` and
  `noThemes`. The harness must do the same, or a target project's
  `CLAUDE.md` and the person's global pi extensions would enter the
  architect's context.
- **An exact replacement works through an inline extension:**
  `extensionFactories: [{ factory: pi => pi.on('before_agent_start', () => ({ systemPrompt })) }]`.
  The three model requests, across two `prompt()` calls and a tool turn, all
  received exactly the replacement string. Inline factories load even with
  `noExtensions: true`.

### 2. Custom tool with a schema that ends the turn

- `defineTool({ parameters })` accepts a **plain JSON Schema**. pi-ai
  validates non-TypeBox schemas with a JSON-schema coercion path, so the
  harness can own its schemas without importing TypeBox.
- A schema-invalid call (bad enum value, extra property) did not reach
  `execute`. pi returned
  `Validation failed for tool "submit_implementation_map": - root: must not have additional properties - modules.0.weight: ...`
  to the same session as an error tool result, and the model's next turn
  corrected it.
- The valid call reached `execute` with the validated arguments, which were
  delivered to the caller. Returning `terminate: true` from `execute` ended
  the loop: the model was called three times and the fourth scripted
  response, marked "must never be requested", was never used. `prompt()`
  resolved after that.

### 3. Event stream

`session.subscribe` delivered `agent_start`, `turn_start`, `message_end`,
`tool_execution_start` / `tool_execution_end`, `turn_end` and `agent_end`.
`tool_execution_start` carries `toolName` and the parsed `args`:

- `read {path: "/ramify/ramify-agent/skills/module-architect/SKILL.md"}`
- `grep {pattern: "expose-sub", path: ".", glob: "*.ramify"}`
- `ls {path: "subs"}`

`tool_execution_end` carries `isError` and the result content. Paths are as
the model wrote them, often relative to the session cwd. The harness must
resolve them against the cwd before publishing "files read". Parallel tool
calls in one turn finish in any order, so events must be matched by
`toolCallId`.

### 4. Token usage per message

Every assistant `message_end` carried
`message.usage = {input, output, cacheRead, cacheWrite, totalTokens, cost{...}}`
(for example `input 910, output 37, cacheWrite 910, totalTokens 1857`). The
values were the faux provider's estimates, so only the delivery path was
executed. Source only: the Anthropic messages API adapter fills the same
fields from `input_tokens`, `output_tokens` and `cache_read_input_tokens`.
Tool calls do not carry model usage.

### 5. Login through an existing subscription: not confirmed

No pi credentials exist, and reusing the Claude Code login is not
authorized. Executed: a fresh `ModelRuntime` lists these OAuth providers,
none configured: `anthropic`, `github-copilot`, `kimi-coding`,
`openai-codex`, `openrouter`, `radius` and `xai`. `getAvailable()` is empty.

Source and docs only:

- Credentials live in `<agentDir>/auth.json`, by default
  `~/.pi/agent/auth.json`. The file is written with mode 0600 in a 0700
  directory. OAuth tokens refresh automatically.
- The directory can be overridden with `PI_CODING_AGENT_DIR` or
  `ModelRuntime.create({ authPath })`.
- Anthropic OAuth opens `https://claude.ai/oauth/authorize` and expects a
  callback on `http://localhost:53692/callback`. It also accepts the pasted
  redirect URL or code, for headless machines.
- **Cost:** pi's `docs/providers.md` states that Claude Pro/Max usage from a
  third-party harness "draws from extra usage and is billed per token, not
  against Claude plan limits". ChatGPT Plus/Pro (`openai-codex`) is the other
  subscription route. The person should choose knowingly.

Steps for the person, on a machine with a browser or able to paste a URL:

1. `cd ramify-agent && npx pi` (interactive; pi 0.85.1 from the pinned
   dependency).
2. Type `/login` and choose **Claude Pro/Max**, or **ChatGPT Plus/Pro
   (Codex)**.
3. Complete the browser authorization. If the browser cannot reach
   `localhost:53692`, paste the final redirect URL into pi's prompt.
4. Quit pi. Check with `npx pi --list-models` (models of that provider are
   listed) or `npx pi -p "reply ok"`.
5. The harness then reads `~/.pi/agent/auth.json` through
   `ModelRuntime.create({ authPath })`, with discovery disabled as in item 1.

`ModelRuntime.login(providerId, 'oauth', interaction)` exists, so the harness
could later host login itself. That is out of scope for Plan 1.

### 6. Loading the skill

`loadSkillsFromDir({ dir: 'skills' })` loaded `module-architect` with no
diagnostics. Given to the resource loader through `skillsOverride`, pi adds
an `<available_skills>` block with its name, description and absolute
`SKILL.md` location. The model is told to load the file with `read` and to
resolve relative references against the skill directory. The scripted model
read `SKILL.md` through `read` successfully. This is progressive disclosure,
not inlining: `references/*.md` are read only when needed.

With the exact-prompt override from item 1, pi no longer appends that
block. The harness then assembles it itself with the exported
`formatSkillsForPrompt(skills, 'read')`, which keeps the whole prompt owned
and versioned by the harness. Inlining remains a fallback but is not needed.

**Content mismatch.** `SKILL.md`'s *Start* step tells the agent to run
`ramify materialize`. The architect has no shell. The architect prompt must
say that the harness has already materialized the architect view, and that
`materialize_api_view` replaces the `--view api --from <path>` form. The
skill itself stays unchanged, as the plan requires.

### 7. Stop

`session.abort()` aborts the run's `AbortController` and then waits until
the session is idle. Executed:

| Situation | `abort()` | Afterwards |
| --- | --- | --- |
| Model streaming | Resolved in 0.5 to 0.7 s | Last message `stopReason: "aborted"`, idle |
| Tool honoring the signal | Resolved in about 10 ms | Tool cancelled; no further model call |
| Tool ignoring the signal (3 s) | Resolved only after the tool finished, 2.7 s | The tool ran to completion; no further model call |
| Tool that never settles | Unresolved after 3 s | Session not idle |

Source only: the built-in `read` and `grep` tools listen to the signal.

**Decision: in process** (the default in open decision 1 stands). Abort is
cooperative, so Stop is certain only when the harness does not depend on
`abort()` resolving. The pi adapter must:

- make its own tools honor the signal. `materialize_api_view` kills its
  `ramify` child process on abort.
- define Stop as: call `abort()`, then wait for idle with a bound. The job
  records `stopped` whether or not the wait completes.
- discard anything the session produces after Stop, notably a late
  `submit_implementation_map` call. In the ignoring-tool case, the tool
  completed after `abort()` had been called.

A child worker would add crash isolation and a kill for a stuck provider
stream. The spike found no stop failure that needs it. The port hides the
choice if a live run shows otherwise.

### 8. Session record

`SessionManager.create(cwd, '<job>/session')` wrote one file,
`<ISO timestamp>_<session id>.jsonl`, in that directory and nothing under the
agent directory. The file name is pi's, not the harness's. Its entries:

- a `session` header `{version: 3, id, timestamp, cwd}`;
- `model_change` and `thinking_level_change`;
- one `message` entry per user, assistant and tool-result message.

Source only: nothing is written until the first assistant message. After
that, each entry is appended synchronously. A job that fails before the
first model reply therefore has an empty `session/`. `SessionManager.inMemory()`
writes nothing.

## Changes the plan needs

1. **Package name.** Use `@earendil-works/pi-coding-agent` 0.85.1.
2. **Iteration 3, exact prompt.** Set the prompt through a `before_agent_start`
   inline extension, disable all pi discovery, and assemble the skill block
   with `formatSkillsForPrompt`. The prompt must also bridge the skill's
   `ramify materialize` step, as described in item 6.
3. **Iteration 3, bounded correction.** A schema-invalid submission is
   rejected by pi before the harness's `execute` runs, and the error goes to
   the same session automatically. The correction bound must therefore count
   every failed `submit_implementation_map` call, whichever layer rejected it.
   Take pi's rejections from `tool_execution_end` with `isError`.
   Alternatively, give pi a schema that accepts any object and validate
   everything in `execute` with `contracts/map`, which then has one validator.
   View-level rejections should also be error tool results, without
   `terminate`, so the model corrects them in the same turn loop.
4. **Iteration 3, tools.** Read and search is `read`, `grep` and `ls`.
   - `find` needs `fd`, which is not installed here. pi would try to download
     it into the agent directory. Include `find` only if `fd` is present.
   - `grep` uses `rg`, which is present at `/usr/bin/rg`.
5. **Iteration 3, adapter tests.** pi-ai's faux provider can drive a real pi
   session with no network. This is a stronger form of "tests that do not
   call a model". pi-coding-agent ships an `npm-shrinkwrap.json`, so pi-ai
   and TypeBox stay nested under it and are not importable by name. The spike
   imports pi-ai by file path to reach the same copy. Iteration 3 must choose
   one approach and verify it:
   - keep that deep import in the adapter's tests only;
   - add `@earendil-works/pi-ai@0.85.1` directly; it is not known whether a
     separate copy's provider works with pi's runtime;
   - implement a small scripted `Provider` against the published interface.

   The adapter itself needs only `@earendil-works/pi-coding-agent`.
6. **Stop semantics** as in item 7: a bounded wait, and output discarded
   after Stop.
7. **Session files:** `session/` holds a pi-named `.jsonl`. It is empty if
   the job fails before the first model reply.

## Exit gate

Run from `ramify-agent/`:

- `npm run type-check`: `tsc --noEmit`, no output, exit 0.
- `npm test`: 1 test file, 1 test passed.
- `npm run check:self`: `Execution: completed; check: passed; coverage:
  complete`. 4 owners, 5 source files, 9 accesses. 0 errors, 0 warnings,
  0 analysis limits. The spike is outside the check's scope and produced no
  warning.
- The spike: `npx tsx spikes/pi/spike.ts` exited 0, and
  `npx tsc --noEmit -p spikes/pi/tsconfig.json` passed.

## For iterations 3 and 4

Login blocks iteration 3's real session and iteration 4's live trial. A
person must follow the steps in item 5 before those items can close. They
should also decide the cost question, Claude extra usage or a ChatGPT
subscription. Everything else in the pi adapter can be built and tested
against the faux provider without credentials.
