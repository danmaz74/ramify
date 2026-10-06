# Three kinds of nested tree

**Date:** 2026-10-06. **Status:** proposed; not started. The decisions below
are Dan's. The [proposals](#proposals-to-confirm) need his confirmation, and
every protected patch in [protected documents](protected-documents.md) needs
his approval, before iteration 1 starts.

This plan spans three projects. Ramify (this repository) changes its model
and releases `ramify.ts` 0.4.0. ramify-audit reads the new answers and
releases 0.7.0. ramify-agent changes only documentation: its harness
specification, its glossary and its unexecuted Plan 21. The agent's code
adoption stays in Plan 21.

## Motivation

A module description declares nested trees of two kinds today:
`owned-ignored`, owned by the module and never analyzed, and `external`, not
part of the project. Decision 7 of the
[project-boundary proposal](../../architecture/project-boundary.proposal.md#12-decisions)
deliberately put example and fixture projects into the same `owned-ignored`
kind as samples and spikes.

That one kind now has to serve two needs that conflict.

1. **Code that is not project code.** Every project has trees whose code is
   kept but is never part of the running project: documentation with code
   examples, spike scripts, evidence-capture scripts, parser samples. For
   ramify-agent's `docs/`, Dan's requirement on 2026-10-06 was: the code there
   must never be considered by audits, must never be imported by project
   code, and must stay editable by agents as ordinary owned content.
   `owned-ignored` gives the first two: Ramify never analyzes the tree, an
   import into it fails `ramify check`, and paths beneath it select nothing in
   an audit. ramify-agent's docs today hold seven `.ts`, `.mts` and `.mjs`
   files, which Ramify would otherwise analyze as auxiliary source.

2. **A separate project inside the tree.** An example application or a
   fixture project has its own description, package, commands and
   instructions. The adopted harness design therefore makes every
   `owned-ignored` tree unwritable unless an assignment includes it
   explicitly, with a reason and that project's instructions
   ([harness specification](../../../ramify-agent/docs/harness.spec.md),
   "Every Agent Scope Is a Cut on the Module Tree"). ramify-audit discovers
   nested projects for nested audits beneath the same trees.

Declaring `docs` as `owned-ignored` would satisfy need 1 and then block every
documentation write behind need 2's inclusion rule. Inferring "this tree is a
project" from its contents does not work either: Ramify promises never to
read inside a declared tree, a consumer would have to walk it, and a project
may lie deeper than the declared directory. Ramify already knows the
distinction. An undeclared root-marked description or package manifest is an
`undeclared-project-boundary` error that forces a declaration, and the
declaration then discards what Ramify detected.

The fix is to name the two owned kinds separately:

| Kind | Owned by the declaring module | Ramify analyzes it | Analyzed source may import it | Its directory is a separate project's root | Agent writes |
| --- | --- | --- | --- | --- | --- |
| `owned-unwired` | yes | never | no | no | ordinary owned contents |
| `owned-project` | yes | never | no | yes, verified | only by explicit inclusion |
| `external` | no | never | no | not stated | never |

`owned-unwired` replaces the name `owned-ignored`. The code in such a tree is
not wired into the project: nothing imports it and nothing analyzes it. It
says how the code relates to the project, which allows a tree that holds
code. Dan rejected `inert`, `ignored` and `inactive` for this reason or for
collisions with existing terms. The one risk is the codebase's usual sense
of "wiring", "not connected yet". The glossary definition states that it is
deliberate, and the architect view shows the kind beside each tree.

## Decisions, 2026-10-06 (Dan)

1. Three nested-tree kinds: `owned-unwired`, `owned-project` and `external`.
   `external` is unchanged.
2. `owned-ignored` is renamed `owned-unwired`. The old keyword is removed,
   with no alias.
3. `owned-project` is a new kind for an owned tree whose directory is the
   root of a separate project.
4. Write authority: an `owned-unwired` tree is part of its owner's ordinary
   write scope. An `owned-project` tree needs explicit inclusion with a
   reason and instructions, as `owned-ignored` trees needed before.
5. ramify-agent declares `owned-unwired "docs"` and keeps
   `ignorePaths: ["docs/**"]` in its audit definition. The ignore entry is
   still needed: full-audit reuse never asks Ramify.
6. One plan across the three projects.

## Proposals to confirm

The planner proposes these. Each needs Dan's confirmation before iteration 1;
a change to any of them changes the patches and briefs that cite it.

| # | Question | Proposal | Why |
| --- | --- | --- | --- |
| Q1 | What makes a directory a project root for `owned-project` | The declared directory itself holds a `module.ramify` whose module line carries the root marker, or a `package.json`. Ramify checks only that directory and never walks the tree. A declaration without either is invalid: `owned-project-without-root`. | The same two signals `undeclared-project-boundary` already uses. The model forbids inferring a project from `tsconfig.json` alone (module-description spec, discovery). One check per declaration. |
| Q2 | May an `owned-unwired` directory hold a project root | No. A root-marked `module.ramify` or a `package.json` directly in an `owned-unwired` directory makes the declaration invalid: `owned-unwired-project-root`, whose message says to declare `owned-project`. Deeper roots are not checked. | Without it a misdeclared project silently loses its write protection and its nested audit. The check is one stat per declaration. |
| Q3 | Where each toolkit tree goes | `docs`: `owned-unwired`. `examples/collection-review`: `owned-project` (marker and manifest). `site`: `owned-project` (manifest). `scripts/reference-harness`, `scripts/probes/fixtures/compiler-api` and `scripts/probes/fixtures/plan2a-symbol-details`: `owned-unwired`; each has only a `tsconfig.json`, which is not a project root under Q1. | Follows Q1 and Q2 mechanically. The reference harness is run by `check:reference`, but nothing imports it and Ramify does not analyze it, so it is unwired. |
| Q4 | ramify-agent's fixtures | Three `owned-project` declarations in the harness, one per fixture directory beneath `subs/harness/fixtures/`, made by Plan 21 where it adopts 0.4.0. Each already holds a `package.json`. | Q1 checks the declared directory itself, so the parent `fixtures/` cannot be declared as one project. |
| Q5 | Placement rules | Both owned kinds keep `owned-ignored`'s rules: strictly beneath the module, outside child modules, allowed beneath `src/tests/`; the directory must exist. | No new requirement. |
| Q6 | The undeclared-project message | `undeclared-project-boundary` suggests `owned-project "<dir>"` or `external "<dir>"` (only `owned-project` beneath `src/`). | The tree it reports holds a project root, so `owned-unwired` would be refused under Q2. |
| Q7 | Nested audits | ramify-audit discovers nested audit definitions in ordinary owned paths and beneath `owned-project` trees, as it does today beneath `owned-ignored`. It skips definitions beneath `owned-unwired` trees with skip reason `owned-unwired`. | An unwired tree is declared not to be a project. |
| Q8 | Seed kind of a path in an owned nested tree | Stays `ignored`; `exclusion.kind` says which tree. | The meaning is unchanged, and renaming it adds churn to every reader for nothing. |
| Q9 | Description format version | Stays version 1. `owned-ignored` becomes an unknown statement whose error names `owned-unwired` and `owned-project`. | The precedent of the root marker, R7, which made existing descriptions invalid in version 1 until migrated. |

## What changes in Ramify

### Model and behavior

- **Grammar.** `nested-tree-line = ( "owned-unwired" | "owned-project" |
  "external" ), hws, STRING, LF ;`. The reserved keywords lose
  `owned-ignored` and gain `owned-unwired` and `owned-project`, which tag
  names also accept despite their keyword status. `owned-ignored` is no
  longer reserved.
- **Both owned kinds behave as `owned-ignored` does today.** Ownership is
  kept, nothing beneath is inventoried, compiled by Ramify, checked or
  watched, an import into it is `project-boundary-import`, compiler-selected
  source in it is a warning, and its paths select nothing in `ramify
  affected`.
- **Validation (Q1, Q2).** `owned-project-without-root` and
  `owned-unwired-project-root`, both layout errors located at the
  declaration. `missing-owned-ignored` becomes `missing-owned-unwired` and
  `missing-owned-project`.
- **Warnings.** `compiler-selected-owned-ignored` becomes
  `compiler-selected-owned-unwired` and `compiler-selected-owned-project`.
- **Messages.** `undeclared-project-boundary` (Q6), the `ignored-but-walked`
  git advice and the `ramify affected` help text.

### Formats

Under the version policy in
[cli-invocation.spec.md](../../architecture/cli-invocation.spec.md), every
document whose payload carries the kind moves to its next version, with no
reader for the old one:

| Document | From | To |
| --- | --- | --- |
| Analysis report | `ramify.analysis/2` | `ramify.analysis/3` |
| Affected selection | `ramify.affected/3` | `ramify.affected/4` |
| Affected CLI document | `ramify.affected-cli/3` | `ramify.affected-cli/4` |
| Changed-path check | `ramify.check/2` | `ramify.check/3` |
| Architect projection | `ramify.architect-projection/2` | `ramify.architect-projection/3` |
| Architect view module and view | `ramify.architect-module/2`, `ramify.architect-view/2` | `/3` |

`ramify.ipc/2` stays, as it did for `/3`: daemon and client come from one
build, and the build key already refuses a mismatch. `ramify.modularity/3`
stays: it serializes directories only.

The kind strings in these documents become `owned-unwired` and
`owned-project` wherever `owned-ignored` appeared: `ProjectExclusion.kind`,
`not-analyzed` reasons, architect `boundaries[].kind` and the warning and
diagnostic codes above.

### The toolkit's own declarations (Q3)

```ramify
owned-unwired "docs"
owned-project "examples/collection-review"
owned-unwired "scripts/probes/fixtures/compiler-api"
owned-unwired "scripts/probes/fixtures/plan2a-symbol-details"
owned-unwired "scripts/reference-harness"
owned-project "site"
```

The external trees are unchanged. The comment above them in `module.ramify`
is rewritten to match.

## What changes in the documentation

[Protected documents](protected-documents.md) holds the exact wording for each
protected file and lists the rename-only sites. In summary:

**Ramify model (protected).**
- `docs/model/module-description.spec.md`: the nested-trees section is
  rewritten for three kinds, with the table above, Q1, Q2 and Q5; the
  grammar, keyword list, tag rule, statement form, error table, discovery
  paragraph and warnings paragraph change with it.
- `docs/model/glossary.md`: "Nested tree" names three kinds; "Owned-ignored
  tree" becomes "Owned-unwired tree"; a new "Owned-project tree" entry;
  "Files belonging to a module", "Auxiliary source" and "Inert file" name
  the owned nested trees. `site/src/pages/glossary.md` follows.
- `docs/model/cross-module-importability.spec.md` and
  `docs/model/typescript-source-interpretation.spec.md`: the kind names, and
  "a project within an ignored tree" becomes "a project in an owned-project
  tree".
- `docs/agents/module-architect.principles.md`: "owned-ignored trees"
  becomes "owned nested trees". A principles edit: Dan's approval names it.

**Ramify architecture (protected specs).**
- `docs/architecture/cli-invocation.spec.md`: warnings, the nested-project
  example, the affected seed paragraph, the human-output line and the version
  table for the moved documents.
- `docs/architecture/architect-view.spec.md` and
  `docs/architecture/modularity-report.spec.md`: kind names and examples.

**Ramify, not protected.**
- `docs/architecture/project-boundary.proposal.md`: an amendment to
  decisions 2 and 7 that records this plan, with the table; sections 2, 5 and
  10 follow. The rest of the proposal stays as the record of 2026-10-01.
- `docs/architecture/daemon.md`, `docs/architecture/README.md`,
  `docs/development/batch-verification.md`, `README.md`, `CLAUDE.md` and the
  module READMEs of `analysis`, `analysis/descriptions`, `analysis/project`,
  `analysis/typescript`, `cli` and `daemon/contexts`, plus
  `scripts/reference-harness/README.md`: names and the new kind.

**ramify-audit.**
- `docs/partial-audit.principles.md` (protected): "A project within an
  owned-ignored tree" becomes "A project in an owned-project tree".
- `docs/partial-audit.spec.md` (protected): the seed-kind sentences and the
  nested-discovery paragraph (Q7).
- `README.md`: the kind names, the nested-discovery rules and the release
  notes for 0.7.0. Dated decision and analysis documents and earlier plans
  are history and do not change.

**ramify-agent.**
- `docs/harness.spec.md` (protected): the scope paragraph and the
  verification sentence name `owned-project` trees for explicit inclusion
  and leave `owned-unwired` trees in the owner's scope.
- `docs/glossary.md` (protected): "Included tree" becomes an `owned-project`
  tree; "Included child" names the project-tree rule.
- Plan 21 (untracked, in `/tmp/ramify-plan20-project-boundary-preparation`):
  the docs decision becomes `owned-unwired "docs"` plus `ignorePaths:
  ["docs/**"]`, P1 is withdrawn, fixtures become three `owned-project`
  declarations, `includedOwnedIgnoredTrees` becomes `includedProjectTrees`,
  and PB3-A02 and PB3-S03 follow. Its pins move to `ramify.ts` 0.4.0 and
  ramify-audit 0.7.0.
- Plan 20's "What waits for the providers" and decision D2 name
  `owned-unwired`. `README.md`'s fixture section stops explaining the
  fixtures as independent scopes because of their `tsconfig.json`.

## Iterations

| # | Brief | Where | Outcome |
| --- | --- | --- | --- |
| 1 | [Model and engine](iterations/iteration1.md) | Ramify worktree | Approved patches applied; grammar, validation, kinds, formats and messages; toolkit declarations migrated; every test, script and doc updated |
| 2 | [Ramify release candidate](iterations/iteration2.md) | Ramify worktree, evidence directory | Version 0.4.0, production artifact, expected toolkit answers, qualification answers |
| 3 | [Audit reader and release candidate](iterations/iteration3.md) | ramify-audit checkout | `/4` reader, three kinds, Q7, docs, real suite on the artifact, qualification on a toolkit clone, 0.7.0 release commit and gate |
| 4 | [Publication and adoption](iterations/iteration4.md) | All three | Clean audit of Ramify's release commit by the 0.7.0 candidate, Dan's publication approval, both publications, toolkit adoption, ramify-agent documentation, handoff |

[Acceptance](acceptance.md) lists the cases and the iteration producing each.

## Execution rules for every iteration

- **Worktrees.** Ramify work happens in `/home/app/ramify-nested-kinds`,
  branch `plan/nested-tree-kinds`, created from `f9a13153`. ramify-audit work
  happens in a new worktree of `/home/app/ramify-audit` from `main`
  (`38cfb30`). Never touch `/ramify`'s working tree before iteration 4, and
  then commit only the named files: it holds Dan's uncommitted work.
- **Gates.** Each Ramify iteration ends with a full audit from a clean commit
  with the installed 0.6.0:

  ```sh
  env -u FORCE_COLOR /home/app/tools/ramify-audit-0.6.0/node_modules/.bin/ramify-audit \
    audit --cwd /home/app/ramify-nested-kinds --full --json
  ```

  From iteration 1 on, the toolkit's own `ramify` answers `/4`, which 0.6.0
  cannot read, so expected-file verification is `ramify-unavailable` and the
  verdict is `indeterminate`. An interim gate passes when every check passed,
  no test failed, and expected-file verification is the only reason for the
  verdict. The results file records the counts and that reason. Iteration 4
  replaces these with a passing audit by the 0.7.0 candidate.
- **ramify-audit gates.** Its own audits use the installed 0.6.0; ramify-audit
  is not a Ramify project, so they are unaffected.
- **No full suite outside the audit.** Never run `npm test`. Allowed:
  `npm run build`, `npm run type-check`, focused `npx vitest run <file>...`,
  `npm run check:self` and the CLI.
- **Flaky tests.** A failure that passes three isolated reruns is flaky:
  record it and move on.
- **Scope.** Nothing beyond the decisions and confirmed proposals. No
  opt-ins, aliases for the old keyword, configuration switches or extra
  declarations.
- **Protected documents.** Apply only the approved patches, verbatim, after
  checking the baseline hash. Record each protected file's sha256 before and
  after the iteration.
- **Shell.** Remove files only by literal absolute paths. Never kill all node
  processes.
- **Writing conventions.** As in `CLAUDE.md`.
- **Results.** Each iteration commits `iterations/iterationN-results.md`
  with commits, commands, outcomes, gate verdicts and report refs, protected
  hashes and remaining gaps.

## Out of scope

- ramify-agent's code adoption of 0.4.0 and 0.7.0: Plan 21.
- Moving a module's purpose from README into `module.ramify`.
- Preventing a test runner or tool from executing files in an owned tree;
  that remains a convention, as the model says.
- Detecting project roots deeper than a declared directory.
