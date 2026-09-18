# Iteration 10 results: Agent trials and completion

**Date:** 2026-09-18. **Mode:** direct work in worktree `/tmp/ramify-plan2b-architect-view`,
branch `feat/plan2b-architect-view`. It is based on `6fa0a53`, iteration 9's results. The trials commit, `6fd9a60`,
adds the transcripts, the trial runner, the scorer and the scores under
[`evidence/trials/`](../evidence/trials/scoring.md); the results commit adds this file and the document updates. No
module input changed.

**Outcome.** Every core task was answered correctly from the view, without reading the source, on both harnesses:
Claude Code 8 of 8 and Codex CLI 8 of 8. **H1 is nevertheless falsified as stated:** the pass criteria also bound
cost, and three core tasks exceed the per-task hit-cost limit (Claude Code D2; Codex CLI D2 and R1), two exceed
the narrowing limit on Claude Code (D3 and P1), and iteration 8's per-term hit cost already exceeded the thresholds
on the toolkit for five of six terms. The extended set is recorded: Claude Code 5 pass and 1 partial, Codex CLI 4
pass and 2 partial, no fail. By the main plan's completion clause and the user's decision of 2026-09-18, Plan 2B is
complete with H1 falsified on cost; the evidence for a split view or a query interface is
[below](#evidence-for-a-split-view-or-a-query-interface).

## Prerequisites

- Iteration 9's handoff held: the fixed build (`dist/`, built from `27f661e`; `6fa0a53` changed documents only), the
  view at the worktree root at revision `rev/1:ed24f37f-2394-4d57-8226-f46a04529361:1`, and the rebuilt evidence.
- The full cucumber-viz audit of `6fa0a53` passed before this iteration (see [Verification](#verification)).
- The user's decision of 2026-09-18, in the main plan's budgets paragraph: run the trials despite the hit cost and
  treat hit cost, record length and the lock held through the dependency wait as later performance work.

## Trial root and view

- **Root.** `/tmp/rp2b-trial`: `git archive` of `6fa0a53` without `docs/plans/iteration-2b-generated-views/` and
  `docs/architecture/architect-view.spec.md`, then `git init` and one commit,
  `fca4442576a85247ebb5a07fe675d84df669ea02`, so that `rg` applies `.gitignore`. `AGENTS.md` and `CLAUDE.md` carry
  the instruction block; AGENTS.md's link to the specification is dead there, and one Codex task tried to search the
  missing file. `node_modules` is a symbolic link to the worktree's, ignored by Git.
- **No leak.** `rg -i -F --hidden` over the root for the test cases' distinctive strings (the task titles such as
  "test title only, no word in the source", "Maintaining the keys", "The agent under test never sees",
  `iteration-2b-generated-views/test-cases`, the worktree path) returns nothing. Two unrelated hits remain as
  ordinary project content: Plan 6's EX17 row says "an exposed but unused export remains visible", and the
  importability principles and a teaching diagram mention a lowest common ancestor.
- **Materialization.** From the root, with a new owned endpoint `/tmp/rp2b10-t` (mode 0700), the built launcher
  `/tmp/ramify-plan2b-architect-view/dist/src/ramify materialize --view architect` exited 0 in 14,166 ms: 15 modules,
  1,595 records, 62 files, 812,267 bytes, dependencies measured. The repeat wrote 0 bytes in 1,168 ms.
- **Revision** `rev/1:d76716c7-c82d-4069-9835-4d1bbcc81b1e:1`, input
  `input/1:727263c0ee9954b80b8d4653452605dcf4c9c2760bd0aeee5d7f45e8c39a56bf`. `_meta.json`:

  ```json
  {"schema":"ramify.architect-view/1","revision":"rev/1:d76716c7-c82d-4069-9835-4d1bbcc81b1e:1","input":"input/1:727263c0ee9954b80b8d4653452605dcf4c9c2760bd0aeee5d7f45e8c39a56bf","modules":15,"dependencies":"measured","dependencyScope":"production","testReferences":"measured","metrics":"unavailable","cut":351,"detailsUnavailable":1,"dynamicTitles":21}
  ```

- **Same as the worktree's view.** With the revision and input identifiers replaced, the 62 files equal the worktree
  root's view byte for byte (`diff -r`); the identifiers occur in `_meta.json`, `README.md` and the 15 `module.json`
  files. The SHA-256 of the trial view's manifest (`<sha256> <path>` per file, paths from the root in byte order) is
  `fb17c2ef4499e537997cb561000c987e31d1c23a933cb2a8b2507d075784ac89`; after the trials the view was unchanged and
  `git status` of the root was clean.
- **Isolation.** `git check-ignore` names `.gitignore:41`; `rg -n -i createProjectBinding .` from the root returns no
  line from the view, and `rg -n -i createProjectBinding .ramify-architect/` returns 7.
- **Daemon.** PID 659428, with its session worker 659453, was stopped with `daemon stop`; both PIDs are gone,
  `daemon status` answers not running, and the endpoint directory was removed.

## Keys

Every key was re-derived from the trial root's view before scoring, as the test cases' maintenance section
requires. The refactoring keys are the view's consumer lists and `uses`/`usedBy`, which AV14 and AV29 verified
against the dependency facts. Changes and refinements:

| Case | Change | Reason |
| --- | --- | --- |
| D1 | The paragraph continues "A failed publication stops later ones." | The documentation paragraph has a second sentence. |
| D3 | `bindingBackoffMs` is `internal`. | The key did not state its role. |
| D4 | The key's sentence that the module's non-test source has neither word is inaccurate: `context-manager.ts` has `context.debounce` and a comment, and `interfaces/contexts.ts` has `debounceMs` and `coalesced`. In the view, "debounce" occurs only in three test records (`context-manager.test.ts`; `covering.test.ts` twice, the second "configuration-answered-at-once: the reply leaves the watcher debounce standing …"), and "coalesc" also in two cut signatures, `ContextEvent` and `createOutboundWriter` (D8's symbol). `createContextManager` has no `doc`. | The answer is unchanged; the view-level claim holds for "debounce". |
| D7 | One test title contains ".gitignore": `ramify/daemon`, `architect-view-publisher.test.ts`, suite "visibility to rg (AV23)", "the %s .gitignore lists the three architect patterns"; the README's block says "gitignored". Neither is a parser. | Plan 2B's own tests added the title. The answer is unchanged. |
| R1 | Eight modules, not six: `usedBy` adds `ramify/analysis/descriptions` (4 behavioral / 9 non-behavioral) and `ramify/analysis/typescript` (1 / 5). Behavioral: `ramify/presentation` 7 / 15, `ramify/analysis` 6 / 26, descriptions, typescript, `ramify` 1 / 0. Non-behavioral only: `ramify/presentation/project-view` 0 / 9, `ramify/service-api` 0 / 6, `ramify/cli` 0 / 1. | The import-statement orientation missed two modules; behavioral use is led by `presentation`, not only `analysis` and the root. |
| R2 | Unchanged: `createExplorerRouter`, `createProjectExplorerModel`, `probeExplorerReadiness`, `readExplorerProcessRecord` and `reusableExplorerProcess` have empty consumer lists. The view's `exercises` also shows `createProjectExplorerModel` used by the root's `project-view-reports.test.ts`. | Recorded for the scorer. |
| R3 | `uses`: `ramify/analysis` 0 / 21, `ramify/analysis/project` 0 / 5, `ramify/analysis/typescript` 0 / 5; none behavioral. | The key's import-line counts were orientation. |

The discovery records of D2, D5, D6 and D8 and the placement keys P1–P3 matched the view without change;
`OwnershipTree` (D6's candidate) has `subtree` and `relation` and no common-ancestor method in the source.

## Harnesses

Each task ran once per harness in a fresh session from the trial root, with the test cases' preamble (`<root>`
replaced by `/tmp/rp2b-trial`) followed by the task prompt, at most three at a time. `runs.json` records each
run's exact command line, times and exit code; every run exited 0.

**Claude Code 2.1.266**, model `opus`, which the transcripts report as `claude-opus-5`, effort high. The harness
also sent its own auxiliary requests to `claude-haiku-4-5-20251001`. Command, as recorded:

```sh
claude -p '<preamble and task>' --output-format stream-json --verbose --model opus --effort high \
  --tools Read,Grep,Bash --allowedTools Read Grep 'Bash(rg:*)' --permission-mode dontAsk \
  --strict-mcp-config --mcp-config '{"mcpServers":{}}' --setting-sources project \
  --settings '{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"node …/rg-only-hook.mjs"}]}]}}' \
  --disable-slash-commands --no-session-persistence
```

- Every transcript's `init` event lists the tools `Bash`, `Grep` and `Read`, no MCP server and `dontAsk`.
- A smoke test (not a trial) showed that `--allowedTools 'Bash(rg:*)'` alone let `ls` and `rg … | head` run: this
  version approves read-only commands. The PreToolUse hook [`rg-only-hook.mjs`](../evidence/trials/rg-only-hook.mjs)
  denies every Bash command other than one `rg` invocation (no unquoted `|`, `;`, `&`, `<`, `>`, backquote or command
  substitution). 28 calls were denied, 13 `ls`, one `cat` and 14 `rg` commands with a pipe to `head`, `cut`, `sort` or
  another `rg`, or a `;`; they count as tool calls.
- `--setting-sources project` leaves out the user's settings (their allow list, `auto` mode and a notification hook);
  the smoke test confirmed that the trial root's `CLAUDE.md` is loaded. The calling session's `CLAUDECODE` and
  `CLAUDE_CODE_*` variables were removed so each run is a top-level session.
- Its Grep tool replaces a matching line longer than 500 characters with `[Omitted long matching line]`; see
  [Findings](#findings).

**Codex CLI 0.154.0**, model `gpt-6-astra`, reasoning effort high (the JSON events do not echo the model).

```sh
codex exec --json -s read-only -C /tmp/rp2b-trial --ignore-user-config -m gpt-6-astra \
  -c model_reasoning_effort=high -c personality=pragmatic -c service_tier=priority \
  --disable memories --disable multi_agent --enable use_legacy_landlock --ephemeral '<preamble and task>'
```

- The default read-only sandbox cannot start in this container: every command failed with `bwrap: Failed to make /
  slave: Permission denied`. The legacy Landlock sandbox runs read commands and refuses writes (`touch` answered
  "Permission denied" in a smoke test); each transcript carries Codex's deprecation notice for it.
- `--ignore-user-config` leaves out the user's MCP servers, plugins and memory; the model, effort, personality and
  service tier are the user's configured values, passed explicitly. `AGENTS.md` is loaded.
- Codex's shell is not restricted; the preamble states the restrictions and the scorer records other commands. Its
  JSON records each command's whole output, while its model receives a shortened one for long outputs (a smoke test
  with a 214-line output confirmed this).

**Interrupted attempts.** At 15:29 UTC a check of the runner imported it, which started the runs with stdout closed.
Codex D1 and D2 completed with the intended commands (`turn.completed`) and are the official runs; `runs.json`
records Codex D2's times from its files. Claude Code D1 and D2 lost their output pipe at about 15:30:01, before any
result: their partial transcripts are kept as `D1.interrupted.jsonl.gz` and `D2.interrupted.jsonl.gz`, unscored,
and both tasks ran again in fresh sessions. The runner now refuses to run when imported and ignores a closed stdout.
No run was repeated for its answer.

The optional second pass without the preamble's third line was not run.

## Scoring

[`score.mjs`](../evidence/trials/score.mjs) derives every count from the transcripts; its header defines the terms.

- **Tool call:** a Claude Code `tool_use`, a Codex `command_execution`.
- **Search:** one `rg` invocation or Claude Code Grep call whose pattern can reject a line. An `rg` whose only pattern
  matches every line (`^`, `.`) or `rg --files` reads or lists files; an `rg` that names no path and reads a pipe
  filters output. Codex often read whole files with `rg -n '^' <files>` or `cat`; those are reads, in their own
  column.
- **Hit lines and bytes:** the lines and UTF-8 bytes of each search call's output as the transcript records it. When
  Claude Code persisted an oversized output and recorded only its size and a 2 KB preview (one call, D2), the recorded
  `rg` command was re-run on the unchanged trial root: 63,472 bytes against the recorded "62KB".
- **Narrowing:** a search that shares a search word with an earlier one and looks within its paths: on fewer paths
  with any shared word, or on the same paths with a sub-selection of its words. Record keys and module-identifier
  words do not count. Two searches the word rule counts are corrected in `verdicts.json`, each with its reason (a
  phrase reduced to one word broadens a search).
- **README:** a read of `.ramify-architect/README.md`. **Source read:** a read of, or a search whose scope includes,
  `src/` or `subs/` of the root, a search of the whole root included. Paths within the view never count.
- **Verdict:** the scorer's, against the re-derived key, with notes, in
  [`verdicts.json`](../evidence/trials/verdicts.json).

## Results

64 KB is read as 65,536 bytes, as in iteration 8. The full tables with notes are in
[`scoring.md`](../evidence/trials/scoring.md).

### Claude Code

| Task | Set | Verdict | Tool calls | Searches (narrowing) | Hit lines | Hit bytes | Read bytes | README | Source read |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| D1 | core | pass | 11 | 7 (1) | 57 | 33,391 | 11,652 | yes | no |
| D2 | core | pass | 13 | 7 (0) | **306** | **100,542** | 21,727 | yes | no |
| D3 | core | pass | 23 | 13 (**4**) | 85 | 29,989 | 62,695 | no | no |
| D4 | core | pass | 19 | 9 (1) | 98 | 18,293 | 24,587 | yes | no |
| P1 | core | pass | 21 | 10 (**4**) | 147 | 29,174 | 22,533 | yes | no |
| P2 | core | pass | 28 | 9 (2) | 190 | 38,497 | 134,214 | yes | no |
| R1 | core | pass | 10 | 2 (0) | 13 | 1,616 | 38,508 | yes | no |
| R2 | core | pass | 20 | 8 (0) | 113 | 16,882 | 34,985 | yes | no |
| D5 | extended | pass | 24 | 19 (7) | 221 | 66,665 | 11,032 | yes | no |
| D6 | extended | pass | 28 | 22 (2) | 188 | 37,689 | 10,744 | yes | no |
| D7 | extended | partial | 25 | 18 (4) | 136 | 29,676 | 356 | no | no |
| D8 | extended | pass | 12 | 7 (2) | 54 | 32,978 | 9,834 | yes | no |
| P3 | extended | pass | 30 | 19 (1) | 417 | 46,133 | 28,520 | yes | no |
| R3 | extended | pass | 18 | 9 (0) | 54 | 31,778 | 12,846 | yes | no |

- **Core:** 8 of 8 pass; maximum narrowing 4 (D3, P1); no source read; hit lines mean 126.1 (1,009 in all), bytes
  mean 33,548; one task over 300 lines or 64 KB (D2).
- **Extended:** 5 pass, 1 partial (D7: correct, after 18 searches rather than two); maximum narrowing 7 (D5); no
  source read; hit lines mean 178.3; two tasks over a limit (D5 bytes, P3 lines).
- 282 tool calls and 159 searches in all; runs took 50–250 s, 1,529 s in total; the transcripts report $11.22 at list
  prices.

### Codex CLI

| Task | Set | Verdict | Tool calls | Searches (narrowing) | Hit lines | Hit bytes | Read bytes | README | Source read |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| D1 | core | pass | 5 | 2 (0) | 56 | 44,812 | 54,660 | yes | no |
| D2 | core | pass | 9 | 3 (0) | **349** | 30,337 | 137,338 | yes | no |
| D3 | core | pass | 5 | 3 (0) | 76 | 36,247 | 54,182 | no | no |
| D4 | core | pass | 4 | 1 (0) | 35 | 23,429 | 26,617 | no | no |
| P1 | core | pass | 8 | 4 (0) | 38 | 18,493 | 54,303 | yes | no |
| P2 | core | pass | 9 | 5 (1) | 43 | 27,874 | 70,560 | yes | no |
| R1 | core | pass | 9 | 5 (1) | 144 | **78,162** | 40,769 | yes | no |
| R2 | core | pass | 11 | 4 (0) | 18 | 9,446 | 57,623 | no | no |
| D5 | extended | pass | 5 | 5 (2) | 80 | 37,454 | 64,337 | yes | no |
| D6 | extended | partial | 9 | 5 (3) | 93 | 64,312 | 36,451 | yes | no |
| D7 | extended | partial | 7 | 3 (0) | 114 | 76,153 | 30,948 | yes | no |
| D8 | extended | pass | 4 | 2 (1) | 54 | 44,326 | 14,027 | no | no |
| P3 | extended | pass | 10 | 7 (0) | 551 | 92,169 | 29,665 | yes | no |
| R3 | extended | pass | 7 | 4 (1) | 192 | 109,392 | 34,170 | yes | no |

- **Core:** 8 of 8 pass; maximum narrowing 1; no source read; hit lines mean 94.9 (759 in all), bytes mean 33,600;
  two tasks over a limit (D2 lines, R1 bytes).
- **Extended:** 4 pass, 2 partial (D6 does not say no, because `OwnershipTree`'s signature is cut in the view; D7
  says none was found after three searches rather than two); maximum narrowing 3; no source read; hit lines mean
  180.7; three tasks over a limit (D7 bytes, P3 lines and bytes, R3 bytes).
- 102 tool calls and 53 searches in all; runs took 14–46 s, 431 s in total; 1.74 million input tokens, 1.39 million
  of them cached, and 14,348 output tokens.
- Other commands: `pwd` in five tasks. Several Codex answers also cite the importability principles and
  architecture documents, which the preamble permits.

### Answers and how they were reached

- **D3.** Claude Code reached `createProjectBinding` through the `bindingBackoffMs` record, the module purpose and the
  file name `project-binding.ts`; Codex CLI read all of `service-api`'s records. Neither cited `exercises`.
- **D4.** Both reached `createContextManager` through the test title in `context-manager.test.ts` and the module's
  `behavior.jsonl`; neither cited `exercises`. Both also named `createFilesystemWatcher`'s own burst deduplication as
  a second layer, which its test title records, while naming `createContextManager` as the owner.
- **Distractors.** No answer presented a distractor as the answer. Where D5's `ModulePurpose`, D6's `ancestorsOf` and
  D8's `ContextEvent` were named, it was as something other than the capability; no answer named
  `describeSymbolDetails`.
- **Placement.** Both put P1 in `ramify/analysis/project`, P2's rendering in `ramify/presentation/project-view` with
  the command in `ramify/cli`, and P3 in a new root child `mcp [dispatch]` reusing `connectDaemon`. Claude Code's P2
  adds a `[dispatch, ui]` emitter module, because `cli` may not import `ui` symbols.
- **Errors beside the key.** Claude Code's D2 lists `ramify/explorer` among the callers, though its `browser` source
  may not value-import these untagged functions (Codex CLI applied that rule); its D7 says the publisher writes a
  `.gitignore`; its P3 calls the map's fifteen modules eleven.

## Findings

- **Module-identifier searches carry the cost.** The largest single searches are a module's identifier: Claude Code D2
  `service-api` (123 lines, 63,472 bytes), Codex CLI R1 `ramify/analysis/model` (114 lines, 67,104 bytes) and R3
  `ramify/daemon/contexts` (158 lines, 89,431 bytes). Such a search returns every record the module owns, since each
  line names its module (H1's first condition), and every consumer list and `exercises` entry naming it. The answers
  were in `module.json`, which Claude Code read for R1 (13 hit lines, 1,616 bytes in all).
- **Long records are hidden from Claude Code's Grep.** In content mode, Claude Code's Grep replaced 288 of 611 matched
  view lines with `[Omitted long matching line]`; every omitted line has at least 504 characters and the longest shown
  one 500. 593 of the view's 1,595 records exceed 500 characters: 78% of test records, 33% of supporting records and
  20% of behavior records. D3's RS03 record and P1's `ModulePurpose`, purpose and map lines were hidden in the first
  search's results, and the narrowing searches and ranged reads that followed recovered them. This is the
  mean-record-length target of 300 characters seen from the harness side.
- **Narrowing is verification.** In Claude Code's D3 and P1 the first search returned the decisive lines; the
  narrowing searches re-ran the same terms on sub-directories to recover hidden lines or to rule out other
  implementations.
- **Cut signatures block negative answers.** Codex CLI would not answer D6 "no" because `OwnershipTree`'s cut
  signature might hide a method; Claude Code said no and named the same caveat.
- **Discovery by titles and documentation works.** D3 and D4, whose terms appear only in test titles or documentation
  paragraphs, passed on both harnesses from the first or second search.
- **The map is used.** The view's README was opened in 12 of 14 Claude Code tasks and 10 of 14 Codex CLI tasks.

## H1 verdict

The specification's criteria, for the core set on each harness:

| Criterion | Claude Code | Codex CLI |
| --- | --- | --- |
| Every core task passes its key | held: 8 of 8 | held: 8 of 8 |
| No task needs more than three narrowing searches | **failed:** D3 4, P1 4 | held: at most 1 |
| No task reads the source | held | held |
| No task returns more than 300 hit lines or 64 KB | **failed:** D2, 306 lines and 100,542 bytes | **failed:** D2, 349 lines (212 from a search of the importability principles); R1, 78,162 bytes |
| Hit cost per term, toolkit and reference (iteration 9) | **failed** on the toolkit for five of six terms | same |

Iteration 9's per-term hit cost, `rg -n -i <term> .ramify-architect/`:

| Term | Toolkit lines | Toolkit bytes | Reference lines | Reference bytes |
| --- | ---: | ---: | ---: | ---: |
| `revision` | 187 | 114,298 | 54 | 21,860 |
| `project` | 549 | 325,296 | 0 | 0 |
| `session` | 214 | 125,847 | 22 | 9,499 |
| `publish` | 118 | 85,058 | 1 | 682 |
| `watch` | 40 | 23,517 | 0 | 0 |
| `create` | 202 | 148,011 | 37 | 16,469 |

**H1 is falsified on both harnesses, by cost, not by answers.** What held: one directory was enough to answer every
core question correctly, on both harnesses, without the source. That includes discovery through test titles and
documentation, internal roles, re-exposure, placement by purpose, and incoming and outgoing use. The view's consumer
lists and `uses`/`usedBy` gave the refactoring answers exactly. What failed: the hit-cost bound of H1's third
condition. Records bounded field by field still cost too much per search on the toolkit: a module-identifier or
common-term search returns hundreds of lines of 400–800 characters, and Claude Code's Grep hides the longer ones,
which leads to narrowing. Each task over a size limit owes it to one or two searches; the other core tasks stayed
within 300 lines and 64 KB.

## Evidence for a split view or a query interface

For Plans 4 and 7. Each failing core task, its costly searches, and the lines it needed:

| Task | Costly searches | Lines it needed |
| --- | --- | --- |
| Claude Code D2 | `rg -n 'service-api' .ramify-architect/ -g '*.json' -g '*.jsonl' --glob '!service-api/**'`: 123 lines, 63,472 bytes, mostly test records whose `exercises` name `service-api`; `"module"\|"tags"\|"parent"` over every `module.json`: 145 lines, 18,011 bytes, to learn each module's tags | `service-api/behavior.jsonl:2` and `:6`, found by its first search (7 lines, 3,987 bytes); each module's tags are on its map line in `README.md`, which it had read |
| Codex CLI D2 | `"(module\|tags\|profile\|name)"` over every `module.json`: 130 lines, 14,609 bytes; `rg -C 4` over the importability principles: 212 lines | `service-api/behavior.jsonl:2` and `:6`, found by its first search (7 lines); the map's tags; the principles' "Browser Imports Require Browser-Safe Symbols" section |
| Codex CLI R1 | `rg -n -i 'ramify/analysis/model' .ramify-architect/`: 114 lines, 67,104 bytes (the module's own 63 records, 40 test records, 10 `module.json` lines) | `analysis/model/module.json` lines 19–28, `usedBy`; its next search, restricted to `module.json` files, returned the eight consumers' `uses` entries in 10 lines and 1,266 bytes |
| Claude Code D3 | Four repeats of `reconnect\|backoff\|retry` on `service-api`, `daemon`, test files and `explorer` after the first search (12 lines, 2,078 bytes) | `service-api/supporting.jsonl:39` (`bindingBackoffMs`), `service-api/tests.jsonl:6` (RS03, hidden by Grep as too long) and `service-api/behavior.jsonl:1` |
| Claude Code P1 | `readme\|purpose` over the view (50 lines, 13 hidden), then four searches in `analysis/project` and `analysis` for `ProjectIssue`, `readPurpose` and diagnostics | `analysis/project/behavior.jsonl:30` (shown), `supporting.jsonl:6` and `:19`, `module.json:12` (hidden) |

What the evidence supports:

- **A query interface, or a split keyed by module.** Questions about one module's use, exposure or callers are
  answered by one small `module.json` or a module's own records, but a text search for the module's identifier
  returns everything that mentions it. A query for "records of module X", "usedBy of X" or "who may call X" (the
  consumer's API view answers the last) bounds the answer by the question.
- **Shorter searchable lines.** At most 500 characters per line would keep every record visible to Claude Code's Grep;
  test records (mean 761 characters, forty titles and twelve `exercises`) are the first candidates for splitting or
  for moving `exercises` and long signatures out of the searched lines.
- **Uncut member lists for negatives.** Absence answers need a class's complete member names, which a cut signature
  does not give.

The view itself stays useful: every core answer came from it. Plans 4 and 7 take up the query interface and
ranked search; the record-length and hit-cost work is the user's later performance work.

## Completion boundary

| Item | Status | Evidence |
| --- | --- | --- |
| 1. Every AV row passes, macOS excepted | Met except AV32 | See the [matrix](#acceptance-matrix). AV32's toolkit hit cost exceeds its thresholds; by the user's decision it is recorded, not fixed. AV31's macOS half is unexecuted: no macOS host. |
| 2. The API view is byte-identical | Met | AV34, iterations 8 and 9: `577b980`'s build and this build publish identical `.ramify` trees for the reference project and the toolkit; the Plan 2A harness and its 57 materialize handlers pass. |
| 3. Build, checks and the full suite pass | Met | Iteration 9 on `27f661e`: `npm run build`, `npm run check:reference` (15 owners, 54 files, 294 accesses, 0 errors, 2 warnings) and `npm run reference:cases` (36 files, 386 tests). This iteration on `6fa0a53`: `npm run type-check` and `npm run check:self` (below). The cucumber-viz audit of `6fa0a53`: overall pass, Vitest 156 files and 2,135 tests passed, type-check and worktree dependencies passed. Iteration 10 changes no module input. |
| 4. Invariance, and no revision from publishing | Met | AV30, iterations 8 and 9. |
| 5. Hit cost within the thresholds | Not met | Toolkit exceeded for five of six terms; the reference project is within. Recorded by the user's decision of 2026-09-18. |
| 6. Core trials pass on both harnesses; extended recorded | Not met as H1; recorded | Every core key passes on both harnesses, but the cost criteria fail; the extended set is recorded. By the plan's clause, a falsified H1 completes the plan with this evidence. |
| 7. Documents describe the result | Met | The specification's status and implementation status, `daemon.md`, the architecture index, the roadmap's Plan 2B row and section, the main plan's status line and this report. `AGENTS.md` describes the implemented view since iteration 8 and needed no change. |

Plan 2B is complete with H1 falsified; the roadmap records the verdict for the user.

## Acceptance matrix

| Rows | Iteration | Status |
| --- | ---: | --- |
| AV01–AV03 | 1 | pass |
| AV04–AV07 | 2 | pass |
| AV08–AV11 | 3 | pass |
| AV12–AV18 | 4 | pass; re-run in 6 on the regenerated golden files |
| AV19–AV23 | 5 | pass |
| AV38–AV39 | 6 | pass |
| AV24–AV28 | 7 | pass |
| AV29, AV30 | 8, 9 | pass |
| AV31 | 8, 9 | pass on Linux; macOS unexecuted, no macOS host |
| AV32 | 8, 9 | measured; **exceeds the thresholds on the toolkit** for five of six terms; the reference project is within |
| AV33, AV34 | 8, 9 | pass |
| AV40–AV43 | 9 | pass |
| AV35 | 10 | recorded: the core cases ran on both harnesses; the cost criteria fail, recorded as H1's falsification with its evidence |
| AV36 | 10 | pass: the extended cases ran on both harnesses and are recorded |
| AV37 | 10 | pass: `AGENTS.md`, the specification, the roadmap and this report |

## Verification

On `6fa0a53`, before this report:

```sh
npm run type-check     # exit 0, all four scopes
RAMIFY_ENDPOINT_DIR=/tmp/rp2b10-v npm run check:self
  # passed: 15 owners, 413 source files, 15 resources, 6128 accesses; 0 errors, 0 warnings, 0 analysis limits;
  # 4274 allowed, 0 denied, 1854 external
```

`check:self` started daemon 667325 (session worker 667402) in the owned directory `/tmp/rp2b10-v`; it was stopped
with `daemon stop`, both PIDs are gone, status answers not running, and the directory was removed. The two commands
were run again on the final tree of this iteration, before the results commit, with the same outcome; that
`check:self` started daemon 674476 (worker 674501) in `/tmp/rp2b10-w`, stopped and removed the same way.

The audit, run on `6fa0a53` (tree `ddfb9c7`) before this iteration, retrievable with
`git notes --ref=audit show 6fa0a535a8f957b6cd99ef219252273b83214cc6` and
`git show refs/audited/runs/2026-09-18T15-07-37Z-6fa0a53:reports/audit/summary.json`: overall pass in 186 s;
regression, Vitest 156 files and 2,135 tests passed in 2:34; static, worktree dependencies and type-check passed;
sealed files passed. The full Vitest suite was not run here.

Processes: the trial daemon (659428) and the two `check:self` daemons (667325, 674476) were the only daemons this
iteration started, and each was stopped by `daemon stop` and confirmed gone by PID with its worker. The trial runner
and every trial session ended; no `claude -p` or `codex exec` process remains. Other sessions' processes were not
touched.

## Deviations

- **Claude Code's Bash restriction** is a PreToolUse hook in addition to `--allowedTools`, because the allowlist
  alone let read-only commands run.
- **Codex CLI's read-only sandbox** is the legacy Landlock one, because bubblewrap cannot start in this container.
- **Codex CLI configuration.** `--ignore-user-config`, `--disable memories`, `--disable multi_agent` and `--ephemeral`
  keep other sessions' memory, MCP servers and sub-agents out of each run; the user's model settings are passed
  explicitly.
- **Interrupted attempts.** Claude Code D1 and D2 ran twice: the first attempts were cut off by the runner's crash and
  are kept unscored.
- **Reads through `rg`.** `rg -n '^' <files>` reads are counted as reads, not searches, so that reading a file is not
  scored as hit cost; their bytes are reported in their own column.
- **Explorer.** The test cases' procedure has the scorer open the explorer for the refactoring keys; the keys are the
  view's own lists, which AV14 and AV29 verified against the same dependency facts, so the explorer was not used.

## Deferred performance work

By the user's decision of 2026-09-18, and now with the trials' evidence:

- **Hit cost per term and per task:** toolkit terms up to 549 lines and 325 KB; module-identifier searches up to
  158 lines and 89 KB.
- **Record length:** mean behavior record 402.1 characters against the 300-character target; test records 761.2;
  593 records over 500 characters, which Claude Code's Grep hides.
- **The publication lock** is held through the dependency wait.

## Remaining gaps

- H1 is falsified; the split view or a query interface is for the user and Plans 4 and 7 to decide.
- AV31's macOS half is unexecuted.
- `CLAUDE.md` still says "`npm run check:self` checks all eleven toolkit owners"; it was left unchanged because
  another session is editing `CLAUDE.md` in `/ramify`. The toolkit has fifteen.
- Historical gates outside `reference:cases` still encode eleven owners: Plan 2's I2-30:self-check-eleven and
  I2-30:declarations-final ("Eleven declarations match owners.md"), its Plan 1 regression check
  (`completion-regression.ts`), Plan 2A's I2A-12:toolkit-scale and completion case, and Plan 5's I5-14 cases, all run
  by `reference:verify` for their plans.
- The trials ran once per harness and task; model variance is not measured.
- Codex CLI's model received shortened outputs for long searches; the hit counts are the full outputs, the cost the
  searches incurred.

## Handoff

- **User:** H1 is falsified on cost with every core answer correct. Decide between a query interface (Plans 4 and 7),
  a split view keyed by module, or record-length work on this view; the evidence is
  [above](#evidence-for-a-split-view-or-a-query-interface).
- **Plans 4 and 7** receive the view format and its measured limits (the specification's implementation status),
  the trial transcripts and scores in [`evidence/trials/`](../evidence/trials/scoring.md), and the finding that
  module-keyed questions are answered cheaply by `module.json` and expensively by text search.
- **The toolkit** keeps the export-shape operation, the test-title reader, the test references, the publisher's
  project-root target and `ramify materialize --view architect` as implemented.
