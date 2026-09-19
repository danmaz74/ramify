# Plan: Module architect skill

**Date:** 2026-09-18. **Status:** iteration 1 complete; iterations 2-5 pending.
This plan delivers a
skill that lets an agent act as the
[module architect](../../agents/module-architect.principles.md) on a
project, using the [architect view](../../architecture/architect-view.spec.md)
that [Plan 2B](../iteration-2b-generated-views/main-plan.md) implements. It
delivers no Ramify code. Its trials decide which further Ramify features are
worth building, and it records those candidates for the roadmap.

The skill is the first, cheapest harness for the architect role. A separate
harness may follow once the procedure is stable.

## Prerequisites

Both are met as of 2026-09-18:

- Plan 2B publishes `ramify materialize --view architect` for the toolkit
  with `dependencies` and `testReferences` measured; its
  [completion report](../iteration-2b-generated-views/iterations/iteration10-results.md)
  records the view's measured values.
- The [test cases](../iteration-2b-generated-views/test-cases.md) were run
  once without the skill, on both harnesses. Every core key passed; H1 was
  falsified on hit cost: module-identifier searches return every record
  that names the module, and Claude Code's Grep hides lines over 500
  characters, which caused the narrowing. That baseline is what the skill's
  search discipline must beat.

## Runnable outcome

An agent in a Ramify project, asked "does anything already do X", "can
module A use Y", "where should X live" or "should we split M", invokes
`module-architect`, works from the architect view and the requesting
module's API view, reads source only to confirm a candidate, and returns a
report in a fixed template that an engineering agent or a plan can act on.

## Resolved decisions

1. **Source reading is allowed, bounded and recorded.** The architect may
   read a candidate's defining file after discovery, a module's files when
   judging placement or a split, and `module.ramify` declarations along an
   exposure path. Every such read is listed in the report as verification,
   and the view remains the first surface. The view trials forbid source
   reads to measure the view; the skill trials count them to measure the
   procedure.
2. **Proposals, never edits.** The skill produces declaration lines, moves
   and new-module briefs; it does not edit `module.ramify` or source. A
   proposed change is verified by applying it in a scratch worktree and
   running `ramify check --batch`, when the answer depends on it.
3. **One skill for both harnesses.** `.claude/skills/module-architect/`,
   linked from `.agents/skills/`. Tool names in the procedure are generic:
   read, search, run.
4. **Project-neutral.** The skill never assumes the project is Ramify. Its
   only paths are the view root, `_meta.json`, the module's `src/.ramify/`
   and `module.ramify`.
5. **Fixed report template**, in `report.md` beside the skill, so trials are
   scorable and a later harness can parse it.
6. **Progressive disclosure within one skill.** `SKILL.md` holds only shared
   boundaries and routing. Discovery, access, placement, cognitive
   decomposition and refactoring live in separate references; an agent reads
   only the references needed by the outcomes it reaches. A chained request
   completes discovery before it loads placement guidance.
7. **Cognitive decomposition for placement and refactoring.** The first skill
   operationalizes the cognitive-decomposition hypothesis. Cohesion and
   coupling remain evidence about boundary quality rather than the sole reason
   to create modules.

## Skill contents

`SKILL.md` stays under eighty lines and contains only these shared sections:

1. **Trigger.** The four questions in a user's words, and the negatives: not
   for implementing a change; not for a question inside one module, which
   the engineering agent answers from its own API view.
2. **Preconditions.** Run `ramify materialize --view architect` (a no-op when
   unchanged). For requester-specific access, refresh the architect and that
   source area's API view together. Read `dependencies`, `testReferences`,
   coverage limits and unavailable details from `_meta.json` and carry them
   into the report.
3. **Routing.** Classify each requested outcome as discovery, access,
   placement or refactoring and name its reference. Access loads discovery
   only when its target is unknown. Placement loads discovery only when the
   request has not established that the capability is new. A chained request
   loads later guidance only if its earlier result reaches that branch.
4. **Rules.** The principles in operational form: the view creates no
   availability; absence is not proof; every claim cites a view line, an
   API-view file or a source location; a relaying module never "implements"
   a capability; facts use behavioral terms, the request uses capability;
   never say grant or route.
5. **Report.** Point at `report.md` and require the report to list the
   references actually read.

The routed references own their procedures:

- `references/discovery.md` owns term expansion, bounded search, candidate
  confirmation and the negative stopping rule.
- `references/access.md` owns the definitive API-view answer, exposure-path
  derivation and optional scratch verification.
- `references/placement.md` owns evidence gathering and candidate comparison
  for a new capability.
- `references/cognitive-decomposition.md` operationalizes the selected
  [cognitive-decomposition hypothesis](../../../ramify-agent/docs/architect-skill-design/2026-09-18-cognitive-decomposition.md)
  for placement and refactoring. It requires keeping the existing structure
  as a candidate and distinguishes existing-owner, child and sibling choices.
- `references/refactoring.md` owns split, move, merge and tree-change evidence.

`report.md` fixes: request as understood; question type; architect revision;
references and source files read; evidence, one line per cited fact; answer;
alternatives for placement or refactoring; proposed changes as declaration
lines, moves or a new-module brief; verification performed; not verified, with
the metadata states; next step for an engineering agent or a plan.

## Iterations

| Iteration | Delivers | Prerequisite | Evidence |
| ---: | --- | --- | --- |
| 1 | Routed `SKILL.md`, `report.md`, five workflow references, `.agents/skills/` link; a dry run of D1 and P1 on the toolkit by the author to check the procedure and reference routing | Plan 2B materialization | Complete: [results](iterations/iteration1-results.md), with two reports in the template |
| 2 | Skill trials: the fourteen test cases on both harnesses with the skill loaded, scored on the test-cases table plus columns for skill references and source files read, scratch checks run, template followed, and which gap in the list below each hand derivation hit | 1, and a view-only trial run | Trial table and transcripts under `evidence/` |
| 3 | Skill revision from the transcripts; second trial of the failed and partial cases | 2 | Revised skill, second table |
| 4 | Roadmap update: for each candidate feature below, the trial counts that justify or defer it; a brief for any feature justified | 3 | Roadmap section, briefs |
| 5 | Installation: how the skill reaches a consumer project, as a Ramify-owned file that `ramify init` or `materialize` writes, or as a documented copy; decision recorded, not necessarily built | 3 | Decision in the completion report |

## Completion gate

1. Every core test case passes with the skill on both harnesses, under the
   test-cases thresholds, with source reads counted rather than forbidden.
   The view alone failed the per-task hit-cost and narrowing limits on
   three and two core tasks; the skill's search discipline is what brings
   them under, and a task that still exceeds a limit is evidence for the
   query interface rather than a waiver.
2. Every report follows the template, and every claim in it cites a view
   line, an API-view file or a source location.
3. Discovery-only cases never load placement, cognitive-decomposition or
   refactoring guidance. Access loads discovery only when its target is
   unresolved. Placement and refactoring load cognitive decomposition.
4. The roadmap records each candidate feature with its trial evidence.
5. A completion report records the trial tables, the skill's final text and
   the installation decision.

## Ramify features the skill may need

The architect can read source, so a feature is justified only where hand
derivation is unreliable, expensive at scale, or where Ramify's answer is
definitive and a hand-derived one is a guess. Each candidate names the
trial evidence that would justify it. None is required for iteration 1.

| Candidate | What exists | Why source reading is not enough | Justified when |
| --- | --- | --- | --- |
| **Access explanation** for a (module, original) pair: decision, reason, the failing hop, unmet tags, ineffective exposures. CLI form first, MCP later. | `explainImport` in `analysis/model` returns exactly this, used by `check` for existing imports and by the API view; nothing answers it for a hypothetical import. | The rules are subtle: effective exposure, `expose-sub` wildcards, testing origin, importer and symbol tags. A hand derivation from `module.ramify` files is a guess; the scratch-worktree check verifies one proposal but does not say why it failed. | Access cases in the trials need more than one hand derivation, or a hand-derived path is wrong. |
| **Candidate ownership** query: a file or module reassignment in, the boundary changes and metric deltas out. | `CandidateOwnership` and `BoundaryChanges` in the modularity code, reachable only inside `analysis`. | Judging a move by reading source is proportional to the module's size and misses indirect consumers; the computation is exact and cheap. | Refactoring or placement cases resort to reading more than one module's files to judge a move. |
| **Named indices in `module.json`**, as the [cohesion and coupling indices proposal](../../../ramify-agent/docs/architect-skill-design/2026-09-18-cohesion-coupling-indices.md) selects them from the modularity report. | Computed by the modularity report; the view spec marks `metrics` optional with no field names fixed. | Clusters and cycles are what a split or merge proposal rests on; reading files finds them for small modules only. | Split or merge cases read whole modules, or the modularity report lands and the field is free. |
| **Query interface** for "records of module X", "usedBy of X" and bounded search, Plans 4 and 7. | The view trials' evidence section names the searches it would replace. | A text search for a module identifier returns everything that names it; a query bounds the answer by the question. | The skill's search discipline still leaves a core task over the hit-cost limit. |
| **Per-suite test references**: `exercises` attributed to suites rather than files. | Reference locations and suite spans both exist; the view attributes per file. | A file with many suites gives one undifferentiated list. | Title hits on multi-suite files fail to reach the symbol. |
| **Consumer references at file level** for one original: which files, not only which modules. | Per-access facts hold the consumer file. | Needed to judge the blast radius of changing or moving a symbol; `rg` on source finds import sites but not aliased or namespace uses. | Refactoring cases grep source for consumers. |

Not needed: staleness detection, since `materialize` is a no-op when
unchanged; available-but-unused symbols, derivable from the API view and
`uses`; violations and outside-module source, reported by `check`.

## Handoff

The completion report hands the skill's final text, the trial tables and
the feature decisions to the roadmap. A separate architect harness, if one
follows, starts from the report template and the procedure as trialled.
