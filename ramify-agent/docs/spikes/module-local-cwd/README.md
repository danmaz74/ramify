# Module-local session starting directories

**Date:** 2026-09-25. **Status:** completed isolated spike; not adopted or merged.

## Question and experimental boundary

Can an engineer complete a module task from that module's `src/`, discovering
received interfaces through its hidden `.ramify/` view, without first surveying
the project? Does the same starting point help a local architect while leaving
focused global discovery available when it is needed?

All variants start from commit
`a015ce0dba22e246e903f4d9f3637b0a79618cad`. Uncommitted changes in the main
checkout are excluded. The experiments are separate:

| Variant | Worktree | Branch |
| --- | --- | --- |
| Baseline | `/tmp/ramify-cwd-baseline` | Detached at the baseline commit |
| Engineer | `/tmp/ramify-engineer-cwd` | `spike/engineer-module-cwd` |
| Local architect | `/tmp/ramify-architect-cwd` | `spike/architect-module-cwd` |

The engineer variant changes engineer sessions and their equipment. The
architect variant changes local architect sessions. Neither changes the other
role's starting directory. The spike preserves existing write authority;
it does not implement the proposed non-functional coordinator or engineers
that may write across module boundaries.

## Prompt review

The original engineer and local-architect prompts explicitly identified the
project root as their working directory. They named API views relative to a
module or the project, and did not give an immediate module-local discovery
procedure. Simply changing the session directory would make those instructions
and some briefing paths incorrect.

The engineer prompt changes make these choices explicit:

- File tools and each shell invocation begin in the starting module's `src/`.
  Its README and declaration are `../README.md` and `../module.ramify`;
  its ordinary tests are under `tests/`.
- Search `.ramify/external` and `.ramify/children` explicitly for ordinary
  source interfaces. Search `tests/.ramify/external` and
  `tests/.ramify/children` for testing source. Do not combine the views.
- Hidden, ignored API directories must be named in the search path. Search
  for the needed behavior or symbol, then read matching pages. Generated
  documentation is never an import target, and missing or incomplete views
  cannot establish that an interface does not exist.
- Start with the assigned goal, local source and received interfaces. Foreign
  source is available for a specific unanswered behavior question; a whole
  project survey is unnecessary.
- Tool paths and structured submission paths have different bases. Preserve
  project-relative machine fields such as injection sites. The briefing must
  label project-relative paths or provide directly usable paths.
- Prefer the existing scoped-test tool. A project-level shell command needs
  an explicit change to the project root; shell `cd` does not persist between
  calls.

The local-architect variant uses the same local discovery instructions. Its
global architect view remains available at an absolute project path for a
specific ownership, placement or dependency question. A proposed module may
not exist yet; the reader must receive an explicit fallback and accurate paths
without creating source directories itself.

These are bundled directory and prompt experiments. A behavioral difference
cannot be attributed to the directory alone.

## Verification design

Deterministic tests exercise session wiring, relative file operations, shell
execution, write refusal outside the assigned scope, post-write checks and
project-relative activity attribution. Include nested and root modules,
continuation and the missing/proposed-module case as applicable. Project
commands retain their required package working directories.

Live trials compare the unchanged and modified variants on matched tasks,
fixtures and model settings. Engineer work should require using a received
interface and changing local source/tests. Architect work should establish
existing behavior and produce an actionable assignment. Record the actual
model, tool calls, paths, API use, foreign-source reading, broad searches,
path failures, task correctness, checks, elapsed time and token usage where
available. Missing measurements remain unavailable.

The trial set is small and exploratory. Passing source tests is separate from
successful live execution, and fewer tool calls or tokens alone do not prove
better implementation quality.

An evaluator setup error first started an architect at the module directory
instead of its `src/`. That attempt reached one model response before being
stopped, used 15,376 reported tokens and produced no submission. It is retained
as experiment overhead, outside the matched comparison. The completed
candidate uses the correct `src/` directory, verified against its exact pi
session header.

## Live observations

The matched trials used `openai-codex/gpt-6-sol` and copies of the same
Collection Review seed. Both roles worked on a Reviews-owned JSON binding
method: reuse the exposed `revisionScopeSchema`, validate before mutating
session state, preserve the binding counter on invalid input, and test it.

Engineers ran through the actual standalone harness session service. Local
architects ran bounded role sessions through the real pi adapter, prompt and
briefing renderers, generated views and submission validator. Their full-loop
directory wiring was tested separately through the harness. These were not
full autonomous plan runs.

| Agent-turn observation | Engineer baseline | Engineer module `src/` | Architect baseline | Architect module `src/` |
| --- | ---: | ---: | ---: | ---: |
| Accepted submission | Completion proposed | Completion proposed | Assignment | Assignment |
| Tool calls, including submission | 15 | 15 | 24 | 14 |
| Path/tool errors | 1 | 0 | 0 | 0 |
| Global architect-view calls | 0 | 0 | 2 | 0 |
| Foreign source reads | 0 | 0 | 1 | 0 |
| Foreign declaration reads | 0 | 0 | 1 | 0 |
| Agent-turn elapsed seconds | 62.957 | 65.320 | 47.735 | 37.131 |
| Reported total tokens, including cache reads | 101,195 | 106,877 | 118,002 | 53,440 |
| System prompt bytes | 19,970 | 21,871 | 55,203 | 56,924 |

These elapsed times cover the agent turns, not fixture preparation or final
checkpoints. Token totals aggregate provider-reported input, output and cache
usage across the session. They are not monetary costs. The expanded prompts
cost additional context; the engineer pair does not demonstrate a speed or
total-token improvement.

The live trials ran against the working variants during development, before
the final regression-fixture migration and missing-directory error handling
were finished. Their records identify the actual prompts and session headers;
they are not a live rerun of the final committed source. Final source validation
is recorded separately below.

The candidate engineer used `../README.md`, `../module.ramify`, `session.ts`,
`tests/sessions.test.ts` and its hidden API view from the module's `src/`.
The baseline also stayed local, but attempted an incorrect `sessions.ts` path
before finding `session.ts`. Both implementations reuse the shared schema,
parse before changing state, and add valid/invalid-input tests. Each changed
only its source and test file. The candidate architect produced a coherent
single-iteration assignment using local evidence and the generated interfaces,
without the baseline's foreign source/declaration and global-view reads.
Both assignments preserved ownership and required verification of state and
counter preservation.

The engineer task itself directed API discovery and discouraged foreign source
reading in both arms. Its result establishes that the workflow works under
those instructions; it does not isolate the benefit of the revised system
prompt. The directory and prompt changes were bundled, there was one task per
role, and model outputs are variable. The architect result is promising
evidence of a simpler navigation path, not a general efficiency guarantee.

Both engineers' scoped checks passed (3 files, 16 tests), as did the type
check, build and completion hook. Independent focused tests passed 10/10 in
each copy. The baseline post-session checkpoint was interrupted; the candidate
checkpoint reached an external time bound. Completion proposals and these
checks must not be presented as completed full harness gates. Fresh-endpoint
direct Ramify checks on both final trees subsequently passed with partial
coverage. The timeout was the evaluator's external 180-second bound, not the
harness check policy. No cwd-related failure was identified in those checks;
the original full checkpoints still have no terminal receipts.
Fresh-endpoint architect materialization also succeeded for each final tree
(15 modules and 137 records in each), and both owned daemons stopped. This
supports that the final trees can be checked and refreshed; it does not explain
why the original in-session checkpoint did not finish within the experiment.

The [live report](live/report.md), [machine summary](live/summary.json),
accepted architect submissions, engineer patches and final-tree check reports
are archived under `live/`. Actual pi session headers confirm all four starting
directories. The compact archive references raw transcripts retained under
`/tmp/ramify-cwd-eval`; it does not copy model credentials or dependency trees.

## Implementation validation

The [architect validation note](architect-validation.md) records its baseline
failure, passing regression commands and coverage limits. Its implementation
is commit `3101ac30886734a8b2f8ff4f7264cc9af81f4ffe`, with validation records
at `763135683993aaf17bfcd000c1077349f4c27df8` on the architect branch.

The first broad engineer suite run found 43 failures, 985 passes and 17 skips.
Many scripted fixtures still sent project-relative tool paths, which acquire
a different meaning when the harness correctly starts the session in module
source. The migration changes those concrete fixture calls to local or
absolute paths and retains the same scopes and assertions. The generic
scripted executor receives no compatibility path rewriting. Final engineer
verification passed: 133 test files, 1,041 tests passed and 7 tests skipped
across 135 files. An intermediate run retained 12 failures before the remaining
fixture calls were corrected. The implementation is committed as `6f12653e`
on `spike/engineer-module-cwd`.
The [engineer validation note](engineer-validation.md) records the exact
commands, intermediate failures and final results.

This broad regression migration went beyond what was needed to answer the
spike's live-behavior question. Some automated checks ran in parallel with
the live trials; the manual assessment should have preceded expansion into
the full suite. No further audit or broad-validation work is part of this
spike. Its recommendation rests on the observed sessions and focused
correctness checks, with the already-completed broad result recorded above.

## Assessment

The spike supports making module `src/` the engineer's actual starting
directory. The harness must select it for pi and for the shell, and use it
when interpreting guarded writes and recording read activity. Prompt and
briefing paths need to agree with that location. Keeping only a module label
in the assignment does not provide that behavior.

The local architect can use the same starting point without losing global
discovery. In this trial, the local-first instructions reduced unnecessary
navigation while preserving a sound assignment. Keep the global architect
view available for concrete questions that local evidence cannot answer.

An authorized engineering bootstrap can prepare its missing `src/` directory.
A read-only architect instead uses an explicitly reported project-root
fallback, pinned for the continued session. Contract engineers retain their
existing project-root behavior in this spike. The two role variants remain
separate branches; their combined integration has not been tested.
The live trials cover an existing nested module, not a new-module bootstrap
or a running session upgraded from the old root-directory implementation.
Root, bootstrap, multi-module and continuation behavior have deterministic
coverage where listed in the validation notes.
