# Affected-rule selection for audits

**Date:** 2026-10-06. **Status:** draft for coordinator review. Execution runs
on branch `feat/affected-rule` in `/home/app/ramify-affected`, from `b4858aec`.
Nothing here is implemented.

## Purpose

`ramify affected` today selects the owner of every owned path seed and that
owner's importers. That includes paths in owned-ignored trees and scratch
directories, documentation, module READMEs and inert files. A path that can
change every module, such as the compiler configuration, selects only its
containing module. As a result an audit consumer re-runs tests for
documentation edits, and the toolkit audit keeps twelve `fullAuditPaths`.
Several of them make up for configuration paths that select too little.

This plan gives each owned path seed a kind and an explicit list of the
modules it selects. It then releases `ramify.ts` 0.3.0 with the rule, so that
ramify-audit 0.6.0 can read it and both projects can adopt it.

## Decisions, 2026-10-06 (Dan)

1. These paths select no module, in neither `changedModules` nor
   `affectedModules`:
   - a path in an owned-ignored tree;
   - a path in a scratch directory;
   - an inert file that is not a captured input, for example `.devcontainer/*`,
     an undeclared `docs/*` and `.md` files including module READMEs.

   External and other always-excluded paths already select nothing; the plan
   verifies this.
2. A captured input is marked as one in the answer. It selects every module
   its configuration governs; `tsconfig.json`, for example, selects every
   module the configuration compiles.
3. Auxiliary source keeps selecting its owner and the owner's importers.
4. Keep `ramify.affected/2` readable by ramify-audit 0.5.0 if possible. If it
   is not possible, define `/3`, say why, and say what the next audit release
   must read. The answer is in
   [contracts: compatibility](contracts.md#compatibility-with-ramify-audit-050).
   It is `/3`.
5. Release `ramify.ts` on `https://npm.braimax.com`, built like the 0.2.0
   provider artifact. Publication waits for Dan's approval at the
   [publication gate](iterations/iteration2.md#6-publication-gate).
6. Write a handoff listing the toolkit and ramify-agent changes for joint
   adoption with ramify-audit 0.6.0. Adoption itself is not part of this plan.

## Planning decisions

The decisions above leave some questions open. These are the planner's
recommendations. The coordinator confirms them or asks Dan before iteration 1.

| # | Question | Recommendation |
| --- | --- | --- |
| J1 | Version | `0.3.0`. The answer schema is incompatible, which takes a minor version under 0.x, as 0.2.0 did. |
| J2 | Where the rule lives | The `ramify affected` paragraphs of [cli-invocation.spec.md](../../architecture/cli-invocation.spec.md) (patch P1), plus the affected row in [daemon.md](../../architecture/daemon.md). No principles or model-specification change. The glossary status line (P2) is optional. |
| J3 | Which modules a compiler configuration governs | Every inventoried module. The root configuration compiles all owned source, including auxiliary source it does not select. A configuration it extends, and a captured `package.json`, govern the same set. |
| J4 | Which modules any other captured input governs, such as an imported data file or an absent resolution candidate | The owners of the analyzed files that read or probed it (`indexes.contributors`). Every inventoried module when none did. |
| J5 | `.md` beneath a module's `src/` | It keeps selecting its owner: it is an owned resource, not an inert file. ramify-agent's runtime prompts live there. D5's wording "wherever it lies" is broader, so Dan confirms. |
| J6 | Module README | Selects nothing, by decision 1, even though the revision captures it with role `readme`. It feeds module purpose only, never a verdict. |
| J7 | Existence-only probes (`dependency`, 0 bytes, a signature hash) | Not captured inputs for this rule. They record that a walked file exists, not content or absence the analysis read, and the contexts' `analysisInput()` makes the same distinction. This is what makes `.devcontainer/*`, `CLAUDE.md` and the unread `tsconfig.*.json` files select nothing. |
| J8 | Where the captured-input predicate lives | A private copy in analysis that mirrors `analysisInput()` in `subs/daemon/subs/contexts/src/dispositions.ts`. Sharing one predicate is a follow-up. |
| J9 | How JavaScript admission reaches the query | A read-only member on `ProjectObserver` that answers whether a path would be auxiliary source under the revision's configuration. It reads nothing from disk and adds no new exported type name. |
| J10 | Deleted and new paths, `.` and directory seeds | They are classified by path, exactly like present files. `.` and directories that are not under `src/` are inert. |
| J11 | Toolkit audits between iteration 1 and adoption | With ramify-audit 0.4.0, toolkit audits in default mode cannot read `/3` and fall back to full (`ramify-unavailable`). Every gate in this plan already uses `--full`. |

## Engine limits found while planning

- **JavaScript admission.** The affected query cannot see JavaScript admission
  today. The answer is J9, a small addition to Project's interface.
- **No new type names.** A new exported type name in
  `subs/analysis/src/interfaces/affected.ts` would become a signature companion
  of `AffectedPathSeed`. The root description relays that file's names by an
  explicit list, so adding a name would force a declaration change. That change
  would in turn need a new named layer in `scripts/validate-final-contracts.ts`
  and a change to the reference harness's `final-contracts.test.ts`. The `/3`
  contract therefore uses inline unions and changes no `module.ramify`.
- **No historical graph.** Removing a configuration's `extends` makes the
  former base file absent from the new revision. It is then classified by its
  current captured role, or as inert. This is the same no-history stance as
  Plan 7's deleted paths. The edit to `tsconfig.json` itself still selects
  every module.

Nothing in decisions 1 to 6 needs a larger engine change.

## Iterations

| # | Brief | Outcome |
| --- | --- | --- |
| 0 | [Contract and baseline](iterations/iteration0.md) | Plan-start audit, characterization tests that fix today's 0.2.0 answers on the extended topology, recorded input facts and the toolkit's real answers. |
| 1 | [Selection rule and `/3`](iterations/iteration1.md) | Seed kinds and selections, captured-input marking, `ramify.affected/3` and `ramify.affected-cli/3`, readers, docs and the adopted spec patch. |
| 2 | [Release and handoff](iterations/iteration2.md) | Version 0.3.0, the production artifact, qualification on a toolkit clone against 0.5.0's reader, the publication gate and the adoption handoff. |

Read [contracts](contracts.md) for the exact answer, [acceptance](acceptance.md)
for the cases, and [protected documents](protected-documents.md) for patches P1
and P2.

## Execution rules for every iteration

- **Gate.** A full audit from a clean commit with the installed 0.4.0, run by
  the implementer:

  ```sh
  env -u FORCE_COLOR /home/app/tools/ramify-audit-0.4.0/node_modules/.bin/ramify-audit \
    audit --cwd /home/app/ramify-affected --full --json
  ```

  The audit takes the machine test lock itself. Iteration 0 also runs it at
  plan start, on the commit that adds this plan.
- **No full suite outside the audit.** Never run `npm test` or the full suite.
  Allowed commands: `npm run build`, `npm run type-check`, focused
  `npx vitest run <file>...` and the CLI. These do not take the lock.
- **Flaky tests.** A failing test that passes three isolated reruns is flaky.
  Record it in the results and move on; do not hunt it.
- **Scope.** No requirements beyond the ones listed. Do not add opt-ins,
  configuration switches or declarations that the decisions do not ask for.
- **Protected documents.** Never edit a `.principles.md` or `.spec.md` file, or
  the glossary, without the coordinator's authorization of the exact patch.
  Each results file records the sha256 of
  `docs/architecture/cli-invocation.spec.md` and `docs/model/glossary.md`
  before and after the iteration.
- **Foreign APIs.** Search the architect view before reading source:
  `rg -n -i '<terms>' .ramify-architect/`. Refresh it with
  `dist/src/ramify materialize --view architect` after a build.
- **Writing conventions.** Follow the conventions in `CLAUDE.md`: modules
  expose to a parent or to descendants; say enforced, verified or rule.
- **Do not touch** `/ramify`, other worktrees, `ramify-agent/` or any
  ramify-audit checkout. **Never kill all node processes.**
- **Results.** Each iteration writes `iterations/iterationN-results.md` and
  commits it with the work. It records commits, commands, outcomes, the audit
  verdict and report path, the protected-document hashes and the remaining gaps.

## Out of scope

- Adopting the rule in the toolkit's `ramify-audit.json` or in ramify-agent.
- Any ramify-audit change, including 0.6.0's reader.
- Moving a module's purpose from README into `module.ramify`.
- A shared captured-input predicate across analysis and contexts.
- Historical (base-revision) dependency graphs.
