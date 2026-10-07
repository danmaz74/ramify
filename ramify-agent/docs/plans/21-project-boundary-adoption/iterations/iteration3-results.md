# Iteration 3: whole-owner authority results

**Date:** 2026-10-07. **Status:** iteration 3 source qualified by the
released `ramify-audit@0.7.2` full execution of a normal request on clean
`1f920462`; branch push awaits coordinator review. **Entry source:**
`e5735ddc96974868b6963bef37be35f8aa73ac5d`. **Source commits** on
`feat/plan21-project-boundary-adoption`:

- `9de371d2c6bdd7e30fb66512f3a8f182ee844835` (tree
  `bf8baa9bac87e9654510a2b46baf97848795c4a7`): capture whole-owner write
  authority under run policy 7;
- `035e62eb91e7bd4b5ce81ec99bbaa52e2058a0c5` (tree
  `0ed4449e26e92f612aefcc08e0271174dc265655`): preserve captured authority
  through candidate recovery;
- `1f920462d2495dd4a7c9786d15d5be2f81b4a2d7` (tree
  `05d6415e002db37167ad7ea228586000ea21398a`): retain related capability
  writer provenance. This is the audited source.

This is intermediate Plan 21 qualification work, not production enablement.
Architect reporting behavior remains for iterations 5–8 and native gate policy
for iteration 9. No protected document was edited, nothing was pushed by the
implementation agent and iteration 4 was not started.

## Provider prerequisite and pins

The actual installed `ramify.ts@0.4.0` F1 witness failed hard-exclusion
precedence inside an owned ignored tree: `fixture/.git/config` inside the
declared `owned-nested-project "fixture"` was classified as writable
([failing run](../evidence/iteration3-write-scope/f1-provider-0.4.0-failure.log)).
No consumer reserved-name classifier was added. The provider owner corrected
the precedence without changing affected CLI/answer /4 or discovering inner
project configuration. Qualified source
`11170110b764c35892049281cec9fd8174e9abe4` (tree
`9ecefbde1d2b4f16eaa2daf1f5354ecb643645cd`) passed a normal full audit with
204 files, 2,894 tests and a complete empty ledger, report
`a73f11bbee2aeac2a8f7e3af1ef82d7e4cac3131`. The coordinator published
registry `ramify.ts@0.4.1` and verified the fresh artifact/install controls and
branch push at provider receipt `90a1f580d70e36a75f384f3f45dd34beb61289e5`
(handoff `/home/app/ramify-audit-pb-evidence/ramify-0.4.1-prod/handoff.json`).
Artifact SHA-256 is
`66ca8cc2e37025da7855fc5240edb561e57e338928d49e5f092eb57daf174c2f`; the
consumer lock records integrity
`sha512-EU91GS5iq8WcqOv4vUmjTVTLB7a5hWtY6usyaNiGHhNLO6UlTt0gVVqZJcP5BWidDYLgZYdCUdrBM9FKPIxPXQ==`.

`package.json`, `package-lock.json` and the installed package pin exact
`ramify.ts` 0.4.1; `ramify-audit` remains exact 0.7.2. Earlier receipts keep
their actual 0.4.0/0.7.1 identities.

## Actual changes

**Whole-owner scope.** Source-prefix ownership is replaced by revision-bound
facts from the installed public ownership query: module identity, physical
directory, parent, configuration, excluded regions and included trees. An
assignment's base owner covers its real contents, including docs, auxiliary
source, configuration subject to authorization and scratch. One `included`
list carries whole trees with `reason` and `instructions`; each entry's kind
(child module or owned-nested-project) and owner are derived from the
ownership answer, and an architect-supplied owner or kind, a partial, loose,
external or nonexistent directory is refused. There are no separate
child-subtree and project-tree inclusion records. The internal
`IntegrationScope.includedChildren` module identities remain separate from the
public inclusion records.

**Hard exclusions first.** Excluded descendants (external, configured output,
repository metadata, packages, generated views and undeclared child trees)
are applied before every base, child, breaking, contract and extra-file
allowance. Logical and resolved physical targets must both pass the current
and captured boundaries; absent targets are validated through their nearest
existing ancestor. Current provider answers can only narrow captured
permission: a removed captured exclusion never widens it, and a newly external
declaration is refused live. Accepted bootstrap authority binds the exact
registry owner, parent and directory, independent of physical basename.

**One rule at every entry.** Intercepted tool writes, shell candidates and
candidate diff validation use the same shared scope. Iteration, work-item and
final committing checkpoints use their originating accepted assignments with
one coherent current ownership query per gate, without flattening scopes; final
may also use persisted coordinator-authorized nonfunctional repair scopes.
Audit, preparation and provider configuration, configuration candidates at
explicitly included roots, absent manifests/locks/runner configurations and
captured harness inputs stay guarded; a null input means actual absence, never
an I/O failure or a directory. A `tsc -p` directory protects its effective
`tsconfig.json`; a Vitest named project selection creates no invented
configuration path. Harness state and the captured plan, principles, features
and project configuration remain harness-only.

**Unchanged inherited bytes.** The ordinary/capability candidate evaluator
accepts exact unchanged inherited bytes only from actual earlier same-task
accepted or partial settled mutations, or from a validated originating
suspended-parent chain, with exact ledger order. Each path keeps its own
captured/current authority; every deeper ancestor snapshot must retain the same
hash, and a missing, misordered or cyclic relation fails closed. Changed bytes
never borrow a predecessor's scope.

**Run policy.** One literal `run-policy/7` names
`plan21-whole-owner-and-architect-reporting/1`. Provider provenance retains
`ramifyVersion`, `ramify.affected-cli/4` and `inputId`. Earlier and
unversioned records are refusal-only: the recorded and current policy and a
fresh-run requirement are reported before schema-body decoding, ledger loading,
cleanup, preparation or any writer. Direct read, record, stop and check-finding
resume, unserved projection/HTTP (explicit 422 with evidence) and standalone
entry are covered. Current-policy recovery restores captured scope and effects
exactly. Production open remains capability-only.

**Briefs and documents.** Included-tree reason, instructions, derived owner
and project `AGENTS.md` reach ordinary, capability and standalone briefs;
source cwd and separate source/testing API views are kept. The nonprotected
autonomous-loop architecture, agent and harness READMEs, and the local
architect and global fork procedures no longer treat child directories as
unconditional write roots or offer `outside-modules`. `main-plan.md` and
`execution.md` record the 0.4.1 prerequisite.

**Delivery corrections.** Attempt 1's failures led to bounded corrections in
`035e62eb`: HTTP policy refusal transports 422 with evidence; capability
inherited hashing rejects I/O and `EISDIR`; exact unchanged bytes require a
canonical regular entry or actual absence plus current/captured inclusion;
rendered harness features require regular canonical targets and actual
ordinary ownership; standalone scenario producer commits refuse unrelated
dirt, and recovered producers prove a single parent, no unrelated or deleted
path and every expected regular Git entry with exact bytes. The evidence
owner's `commitNameStatus` gains an optional single-parent requirement. A
pending gate intent with no matching commit re-validates through the shared
candidate authority in one fresh batch before render/commit; matched gate and
producer commits reuse immutable effects. `1f920462` adds the same-task
writer-provenance rule above after the 12-case capability diagnostic, and its
copied capability fixture declares the quick/full scenario runner as
`node_modules/.bin/cucumber-js` before capture.

## Removed inference paths and replacements

| Removed | Replacement |
| --- | --- |
| Source-prefix ownership and unconditional child write roots | Captured ownership-query facts and one derived `included` list |
| Active `outside-modules` purpose, its validation branches, caller plumbing, auxiliary-test suppression, hook warning suppression and prompt/file-list wording | Base-owner auxiliary source; narrow contract, conformance, fake-injection and bootstrap extras remain |
| Public `includedChildren` projection | The single `included` list |
| Historical environment-map decoder/default migration and old-record execution/inspection adapter | Version refusal naming both policies before any decoding or mutation |

The current scripted lifecycle seam `openForScriptedLifecycleTests` accepts
only literal `run-policy/7`; it is deliberate regression control of contract,
bootstrap and recovery engine paths until iteration 9, not historical record
execution. Tests name old policy versions only to prove refusal.

## Acceptance mapping

F1 uses actual installed 0.4.1 placement answers through the public ownership
query, recorded in the
[F1 table](../evidence/iteration3-write-scope/f1-installed-0.4.1-table.json)
(18 queries, input
`input/1:6fbe16e4f17938772281826c7c5d0e3389233f11aa10a77cc89421d9c2ca4166`).
The roots of the same run's other F1 tests in `write-guard.test.ts` (PB3-S04,
S06, S07 and P04 controls) are in
[other F1 fixtures](../evidence/iteration3-write-scope/f1-installed-0.4.1-other-fixtures.json).
Scripted ownership in lifecycle tests is separate from that conformance
evidence.

| Case | Evidence |
| --- | --- |
| PB3-A02 | F1 docs `.md`, `.ts`, `.mts`, `.mjs` and an inert docs `module.ramify` stay base-owner writable without inclusion; `scripts/new.ts` remains auxiliary source (`write-guard.test.ts`, PB3-S01–S05 S09 case). The fixture-root declarations and changed-check evidence are iteration 1's. |
| PB3-S01 | F1: root owner's docs, auxiliary source, scratch and source allowed; configuration independently guarded; excluded child refused at tool and candidate. |
| PB3-S02 | F1: declared `a` at physical `subs/group/physical`, an included immediate child admits its descendant module, an unincluded sibling is refused; `capability-assignments`/`iterations` validation. |
| PB3-S03 | F1: independent `fixture` needs a whole-tree entry with reason/instructions; its own `AGENTS.md` and derived owner reach briefs (`assignment-source-evidence.test.ts`); nested project inside an included child needs its own entry. |
| PB3-S04 | F1: external, configured `fixture/dist` output, repository/packages/generated paths refused under base, child, breaking, contract and extra authority. Actual shell candidates (`single-session.test.ts`): owned source passes; audit configuration and job state fail the checkpoint with no accepted commit. Committing checkpoints reject an iteration → work-item → final bypass. |
| PB3-S05 | F1: logical external alias to owned source, ordinary alias to external/sibling, absent nearest ancestor, prefix collision and symlink loop give the same tool and candidate decision. |
| PB3-S06 | F1: newly external declaration denied live; captured exclusion removal never widens; removed unassigned child now parent-owned denied at tool/candidate/restart; previously included child removal allowed; changed owner parent/directory identity denied. |
| PB3-S07 | `outside-modules` rejected by new schemas (`write-guard`, `local-architect-submission`); narrow contract/conformance/fake/exposure extras and bootstrap creation remain (`contract-injection-scope`); missing provider port and owner/parent/directory bootstrap collision refused. |
| PB3-S08 | Existing scratch lifetime suite plus owned-unwired and included-project preservation on child scratch release (`scratch.test.ts`); briefs keep source cwd and separate source/testing API views. |
| PB3-S09 | F1 assignment validation with child, nested-project, external, loose and descendant directories; architect-supplied owner/kind rejected. |
| PB3-P04 (iteration 3 part) | Audit/preparation/provider configuration and named included roots captured without workspace walk; nullable absent configuration creation/deletion/modification denied unless recorded authorization; `tsc -p` file/directory candidates; `EISDIR` refuses. Gate-wide audit compatibility remains iteration 9. |
| PB3-R01 (iteration 3 part) | `capability-historical-resume.test.ts`: run policies 1–6 and unversioned records refused before decoding, recovery, cleanup or launch; targeted read/record/stop/check-finding resume, HTTP and standalone preflight; current restart preserves exact scope/effects. F5 remains iteration 11. |

## Focused verification

All commands ran from `ramify-agent/` with the installed Vitest and explicit
files; no `npm test` or unrestricted `vitest run` was used.

Final source `1f920462`, after the delivery audit:

```sh
PLAN21_F1_EVIDENCE=<scratch>/f1-final.json ./node_modules/.bin/vitest run subs/harness/src/tests/write-guard.test.ts subs/harness/src/tests/iterations.test.ts subs/harness/src/tests/capability-assignments.test.ts subs/harness/src/tests/contract-injection-scope.test.ts subs/harness/src/tests/assignment-source-evidence.test.ts subs/harness/src/tests/capability-historical-resume.test.ts subs/harness/src/tests/scratch.test.ts subs/harness/src/tests/single-session.test.ts
npm run type-check
npm run check:self
```

The eight files named by the brief passed **57/57 tests in 8/8 files**, none
filtered or skipped, in 111.65 s
([log](../evidence/iteration3-write-scope/focused-eight-final.log)); the same
run wrote the F1 tables. `npm run type-check` exited 0 for all four compiler
configurations. `npm run check:self` passed with 0 errors, 0 warnings and 319
nonblocking analysis limits over 12 owners, 583 source files, 55 resources and
11,638 accesses ([log](../evidence/iteration3-write-scope/check-self-final.log)).

Development-time results, retained as history rather than final evidence:
the eight required files passed 56/56 before the first source commit;
F1/single-session passed 29/29; composition/recovery controls passed 45/45.
Earlier focused and type failures, and the correction mapping for attempt 1,
are recorded in `/tmp/pb3-delivery-attempt1-correction-map.md` and the
`/tmp/pb3-*` logs. A consolidated 24-file correction run had 208 passed and
one failed: a new unassigned-restart control recursively replaced an already
mocked Git method; the control was corrected to keep its original mock and
assert the exact offending path and one real query.

**Capability lifecycle.** The 12-case
`capability-acceptance.integration.test.ts` file passed 12/12, zero skipped,
in 928.01 s ([results](../evidence/iteration3-write-scope/capability-12-case-results.json)),
command `node_modules/.bin/vitest run --project node --maxWorkers=1
--reporter=verbose subs/harness/src/tests/capability-acceptance.integration.test.ts`.
Its ownership and Ramify check are scripted; Git, Vitest, TypeScript and
Cucumber run as declared. Before it, a diagnostic run on `035e62eb` failed
CA08/CA11, CA28 and CA31 and was cancelled (exit 130, nine cases unrun); a
corrected run was cancelled after migration and drift passed and deferred
failed. The deferred failure was a fixture defect: captured quick/full argv
named bare `cucumber-js`, which existed only at `node_modules/.bin`. The copied
fixture's declarations were corrected before capture, with no production PATH
inference, timeout or scope change. External diagnostics are under
`/home/app/ramify-audit-pb-evidence/plan21-iteration3-development/`.

## Delivery audits

Every attempt used the exact normal command from the repository root:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --json
```

| Attempt | Source | Window (UTC) | Executed mode | Result |
| --- | --- | --- | --- | --- |
| 1 | `9de371d2` | 17:12:43–17:29:47 | full (preparation input `package.json`, `package-lock.json`) | **fail**: 29 tests in 19 files |
| 2 | `035e62eb` | 18:34:34–18:55:48 | full (drift cap 34 > 25) | **fail**: agent-tests timed out at 1,200 s |
| 3 | `1f920462` | started 19:42:41 | — | **no result**: process killed with the aborted session |
| 4 | `1f920462` | 20:00:58–20:16:56 | full (indeterminate baseline ledger from attempt 2) | **pass**: 254/254 files, 0 failed |

Projections of each attempt are in
[evidence/iteration3-write-scope](../evidence/iteration3-write-scope/)
(`delivery-attempt1.json` … `delivery-attempt4.json`); raw JSON is in
`/tmp/pb3-delivery-attempt{1,2,3,4}-audit.json` with SHA-256 recorded in each
projection.

**Attempt 1** (request `10413f05-eb19-4d2e-98c2-f6fdfd83b11d`, report
`e5e12b3dd260fcf75e00412882c05f70b8fcd573`, 1,022.386 s producer) requested
`ramify-partial` and executed full. Four checks passed; agent-tests had 254/254
expected files run, 233 passed, 19 failed and 2 skipped files; 1,980 passed,
29 failed and 6 skipped tests; complete ledger of 29 entries; unscoped
composition `fail`. The failures were stale fixtures and current-shape
expectations plus the production defects corrected in `035e62eb`.

**Attempt 2** (report `cb6f6b1552ea5a61f62d60fcb584c3aa51c0653d`, 1,273.625 s
producer) executed full because 34 distinct paths had changed since the full
audit at `9de371d2`. Structure, type, web build and patch checks passed;
agent-tests reached its declared 1,200,000 ms timeout and the provider stopped
its process tree. Without a released Vitest summary, counts are null,
expected/run 254/0, completeness and ledger `indeterminate`, composition
`fail`. A subsequent 12-case capability diagnostic on `035e62eb` found three
failing cases (CA08/CA11, CA28, CA31), addressed in `1f920462` by the
writer-provenance correction and the fixture runner declaration. The timeout
was not separately attributed beyond that.

**Attempt 3** started at 2026-10-07T19:42:41Z on clean `1f920462` and was
killed when the implementing session aborted. Its stdout is empty: it has no
report, verdict or source qualification and is not counted as passing.

**Attempt 4** ran on the same clean `1f920462` from 2026-10-07T20:00:58Z to
20:16:56Z: **958.03 s (15 m 58 s)** launch to exit, 957.605 s producer, CLI
exit 0. Request `347c9690-4977-4913-864d-28e3eec76fa9`, run
`5abf8253-9fbb-480f-aff6-7df8ff11bc4c`, report
`1cad33f30e760ed5561dff19c8698e028d00e4a3`, run ref
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-07T20-16-56Z-1f920462d`.
It **requested `ramify-partial` (defaulted) and executed `full`**: the provider
widened it because attempt 2's report `cb6f6b15` has an indeterminate failure
ledger. The ownership answer came from installed `ramify.ts` 0.4.1
(`ramify.affected-cli/4`, 12 modules, 17 exclusions), evidence schema 4.

All five checks passed: agent-structure 17.6 s, agent-tests 920.6 s,
agent-typecheck 6.2 s, agent-web-build 0.6 s, patch-integrity 0.01 s. One Vitest
invocation group ran 254/254 expected files (missing none, status
`complete`): 252 passed, 0 failed, 2 skipped files; 2,017 passed, 0 failed,
6 skipped tests. The skipped files are the opt-in `fixture-acceptance` and
`fixture-trials` suites; skips are unrun, not passes. The failure ledger is
complete with zero entries; unscoped composition is `pass`, chain depth 0,
zero outstanding failures. No flaky test was observed.

The released `check-branch HEAD` at source `1f920462`
([result](../evidence/iteration3-write-scope/source-applicability-1f920462.json))
reports an exact-tree audit, `auditStillApplies: true`, `auditPassed: true`.
This receipt commit changes only `ramify-agent/docs/**`, which the committed
`ignorePaths` excludes; the audit executed on `1f920462`, not on the receipt
commit, and the coordinator's check at the receipt HEAD establishes only
applicability of that source result.

## Limitations

- Included child deletion is scope-authorized, but scoped discovery after a
  module's removal is still `not-verified`/discovery error; the actual source
  commit occurs at the work-item checkpoint under the original accepted
  assignments. No passing scoped test, iteration or removal notice is claimed.
  Iteration 9 must reconcile this behavior.
- A failed or incomplete contract sub-session registers no contract; its
  foreign dirty interface is refused at the ordinary consumer iteration and
  committed only at the later work-item checkpoint under both recorded
  assignment authorities. No earlier passing ordinary iteration is claimed.
- The rooted provider topology does not emit repository, packages or
  generated entries; F1 path answers supply these hard facts, and no topology
  producer is fabricated.
- A denied outside-project seed may retain an unnormalized spelling such as
  `../a/../b` in its denied record. It permits nothing; no source change was made.
- Ledger/scripted-Git/`FakeRamify` restart controls are distinct from the real
  Git producer recovery and the installed F1 answers. The paid Plan 13 probe and
  the opt-in fixture acceptance/trial suites were not run.
- This receipt commit is documentation only. The audit checked source
  `1f920462`, not the receipt commit.

## Protected-file comparison

The coordinator's baseline at entry `e5735ddc` lists 16 applicable
`.principles.md`/`.spec.md` files. Before the receipt commit, all 16 match
that baseline in HEAD `1f920462`, the index and the worktree; no protected
path is staged, unstaged, untracked or renamed, and no protected file changed
in any commit since entry
([comparison](../evidence/iteration3-write-scope/protected-comparison.json)).
No protected patch was proposed or authorized for iteration 3. The
coordinator repeats the comparison at the receipt HEAD.

## Next-iteration prerequisites

Iteration 4 (hook dispositions) may start after the coordinator reviews this
receipt and pushes the branch, verifying `HEAD ==
origin/feat/plan21-project-boundary-adoption` on the live remote. It builds
on `run-policy/7` without another policy bump, the installed exact
`ramify.ts` 0.4.1 / `ramify-audit` 0.7.2 pair, and the removed hook warning
suppression. Iteration 9 inherits the scoped-discovery-after-removal and
contract sub-session limitations above.
