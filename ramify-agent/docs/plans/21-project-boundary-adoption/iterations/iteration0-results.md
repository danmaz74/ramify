> **Expanded-plan note, 2026-10-07:** this receipt preserves earlier evidence.
> [Plan 21](../main-plan.md) now also covers architect-owned completion. The former P4
> assignment/scenario certification proposal is withdrawn; revised execution
> witnesses and the declaration/lifecycle contract review remain unrun. No old
> witness is relabeled as passing the expanded prerequisites.

# Iteration 0: prerequisite review results

**Historical record:** the inspection below retains its original evidence.
The [three-kind amendment](#three-kind-amendment-2026-10-06) at the end states
the current adoption contract.

**Date:** 2026-10-06. **Status:** in progress; exit criteria not met.
This receipt records completed inspection and existing-baseline applicability.
It does not claim provider convergence, PB3-T06 acceptance or source adoption.

## Source and changes

Worktree `/tmp/ramify-plan20-project-boundary-preparation`, branch
`feat/plan20-project-boundary-preparation`, committed source
`d1497178f1e3733d92b2c4c0ab613e37961e5256`.
The agent still pins Ramify 0.1.0 and ramify-audit 0.3.2. Its committed subtree
is identical to Plan 20's accepted source `a2a4ad7d35790598f8d0b069f3aa552bdc7d2788`:

```sh
git diff a2a4ad7d35790598f8d0b069f3aa552bdc7d2788 HEAD -- ramify-agent
```

The command produced no diff. Working-tree changes are the Plan 21 documents
and their documentation-index entry. No runtime files, pins, provider files
or protected documents were edited. No commit or push was performed.

At the initial review the plan recorded the then-current external-only
restatement rule and `/2` versus `/3` disagreement. Both are superseded by
the continuation below and the current [provider receipt](../provider-receipt.md).
The direct docs decision remains unchanged.

## Applicable full baseline

From the repository root, using the installed released provider:

```sh
ramify-agent/node_modules/.bin/ramify-audit check-branch HEAD --project-root ramify-agent --cwd . --json
```

Exit 0. The provider returned `auditStillApplies: true`, `auditPassed: true`
and `composition.verdict: pass`, with no outstanding failures. The
[selected response fields](../evidence/iteration0-baseline.json) retain its
project-specific notes ref, both commits and the original report identity.

| Identity | Value |
| --- | --- |
| Checked committed source | `d1497178f1e3733d92b2c4c0ab613e37961e5256` |
| Original full-audit source | `a2a4ad7d35790598f8d0b069f3aa552bdc7d2788` |
| Original report commit | `7beb7e62d5c55b5066f2f3d40e81a02e362648ab` |
| Producer / evidence schema | ramify-audit 0.3.2 / 3 |
| Original execution time | 2026-10-04T11:29:28.450Z |
| Applicability kind | `exact-tree` |

This was a read-only applicability query. No tests or new full audit executed;
the uncommitted plan documents are outside the queried source identity. The
brief now explicitly permits this provider-confirmed baseline reuse. The new
provider pair will still require its own full adoption baseline.

An initial exploratory query with `--project-root .` addressed the enclosing
toolkit. It is excluded from agent evidence; the command above corrects the
target and returns `projectRoot: ramify-agent` with its own notes ref.

## Protected documents and remaining work

The five-file [protected baseline](../planning-validation.md#protected-file-baseline)
remains byte-identical to HEAD. The proposed specification correction is not
applied or specifically authorized. Historical `.superseded/` documents were
not inspected. Document validation is recorded in the continuation section of
[planning validation](../planning-validation.md#prerequisite-review-validation).

P1–P4 remain open. P5 is present in the inspected contract but awaits target
qualification. Release identity checks, PB3-T06's committed and dirty witnesses,
the final-provider adoption probe and the exact protected-patch authorization
remain unrun or pending. No acceptance ID is marked passing by this receipt.
The next work is provider convergence as specified in the incomplete receipt;
dependent iterations remain unstarted.

## Parallel prerequisite work: provider refresh and API review

Completed after Dan authorized work that can proceed while the provider plans
run. Read the current D10, both provider plans/contracts and the relevant public
and internal audit signatures. The new
[provider snapshot](../evidence/iteration0-provider-refresh.json) distinguishes
committed identities from concurrent uncommitted audit implementation.

- Removed the stale `/2` compatibility blocker: both plans now agree on `/3`.
  Actual artifact qualification is still pending.
- Updated ignore policy: owned-ignored and external trees can both be listed;
  there is no ownership-based restatement validation. Configuration precedence,
  nested discovery and agent write authority remain separate.
- Recorded the `.md` rule under `src/`, including runtime prompts. This is an
  affected-selection decision, not a source-check disposition. The all-extension
  docs requirement still needs provider inventory/check and selection witnesses.
- Prepared the [contract review package](../provider-contract-review.md): exact
  existing P3 signature proposed for export; concrete P4 inputs, results,
  reuse/dirty-source requirements and decisive positive/negative F2 cases.
  No provider review, implementation or publication is implied.
- Imported released audit 0.5.0 through its public ESM entry, inspected named
  exports and invoked `vitestOwnershipGroups` on a synthetic topology. Root
  and disconnected grandchild produced two groups with the necessary child
  exclusion. The [API evidence](../evidence/iteration0-public-api-inspection.json)
  records exact inputs, outputs and package-entry digest.

The public-package smoke exited 0. An earlier CommonJS-resolution attempt
failed because this package exports its entry only for ESM import; it ran no
provider operation and was replaced by the successful ESM invocation. No tests,
new audit, P3 configuration-read witness or PB3-T06 acceptance executed.

Plan documents now link the review package from the relevant iteration briefs.
Protected files and source pins remain unchanged. No source commit/push or
provider-repository change was made. P1/P3/P4 remain open; P2 agreement is
recorded separately from unrun release qualification. The next actionable step
is provider contract review and assignment of its additional work, followed
by the specified installed-package witnesses.

## Three-kind amendment, 2026-10-06

The preceding inspection and prerequisite evidence retains its original source
refs, package versions, document hashes and unrun witnesses. It is historical
evidence, not the current adoption contract. Dan's later three-kind decision
supersedes the earlier no-declaration/no-ignore docs proposal and withdraws P1.
Plan 21 now targets exact published pins ramify.ts 0.4.0 and ramify-audit 0.7.0,
affected CLI/answer /4 and audit evidence schema 4. Declare owned-unwired docs
at the agent root and ignorePaths ["docs/**"] for full reuse. Declare the three
actual harness fixture project roots individually as owned-nested-project;
their parent fixtures/ is not a project root. Owned-unwired contents remain in
ordinary owner write scope; includedProjectTrees carries explicit project-tree
inclusions. PB3-A02 and PB3-S03 follow those rules. See the current contracts
and the [provider handoff](/home/app/ramify-nested-kinds/docs/plans/nested-tree-kinds/handoff.md)
for artifact identities and qualification. P3/P4 remain open public integration
witnesses, and agent runtime adoption/acceptance remains unimplemented.

## Expanded iteration 0 execution, 2026-10-07

**Entry source:** `/home/app/ramify-plan21-project-boundary-adoption`, branch
`feat/plan21-project-boundary-adoption`, clean commit
`1c8764a85ed605893b1fde908d905e4d5aa3383c`. That commit contains the
planning package and Dan's accepted principle and scope edits. The installed
baseline dependencies after `npm ci --ignore-scripts` are the package/lockfile's
exact historical `ramify.ts` 0.1.0 and `ramify-audit` 0.3.2. No pin or runtime
source file changed in this iteration.

`ramify-agent/node_modules/.bin/ramify-audit check-branch HEAD --project-root
ramify-agent --cwd . --json` returned exit 0 from the repository root. The
[selected response](../evidence/iteration0-current-baseline.json) says
`auditStillApplies: true`, `auditPassed: true`, `auditKind: exact-tree` and
`composition.verdict: pass`. The checked source is `1c8764a8`; the reused
full-audit source is `a2a4ad7d35790598f8d0b069f3aa552bdc7d2788`,
producer 0.3.2, original report
`7beb7e62d5c55b5066f2f3d40e81a02e362648ab`. This is applicability,
not a new audit execution or an adopted-provider baseline. The earlier query
at `d1497178` remains historical.

The registry check and tarball SHA-256 comparison confirm published
`ramify.ts` 0.4.0 and `ramify-audit` 0.7.0 at entry. An isolated install under
`/tmp/plan21-iteration0-provider-probe` imported 0.7.0 through its public ESM
entry. The [entry record](../evidence/iteration0-published-0.7.0-entry.json)
shows `requestFromCommittedConfiguration` absent, while the execution service,
dispatcher and recovery functions were present. Dan then explicitly approved
the bounded provider export, qualification and publication on 2026-10-07. The
separate provider project published `ramify-audit` 0.7.1 from audited source
`1944162e7f73a00f81bd35c3536807eba307d982` after a passing full audit
(report `f4b2f11dc86794d19c46b521c578374a5b2b1dd0`, producer 0.7.0).
The published tarball SHA-256 is
`c9c2c6638ba0a8aa1775afb8eba5edcf880c4e0e44ab281da928464e6543074c`.
Provider implementation, qualification and publication are independently
recorded in the [provider receipt](../provider-receipt.md); no provider source
change is attributed to this agent iteration.

The [installed 0.7.1 P3 witness](../evidence/iteration0-p3-installed-public.json)
called only the public ESM export with committed F2 source A
`91171a132b47b9f0fd53d5d42a088463854a2301`, while HEAD was B
`9970c42913090bb1774110f40e2519a878155079` and the working definition C
had no checks. Its request retained A's two configured checks, exact definition
blob `35bda1067c8a3518e94e555e1a0f2bf6822e3294`, full mode and preparation
definition; Git refs were unchanged. This is a public installed-package witness,
not a direct provider-source import.

The stronger [F3 public-reader witness](../evidence/iteration0-p3-f3.json)
keeps different committed configurations at A
`e33eac4917f962e60e0e74f0b3bdbc250971e923` and HEAD B
`743f8894bf464cb2b4a1cc2d464a7f173da66473`, then makes working C
malformed JSON. Installed 0.7.1 returned A's `a-check`, `docs/**` ignore
policy, nodejs preparation directory and blob `e56a34dc67e40a64d4b12301f4b1bf27a7048576`;
B returned its different `b-check`, empty ignore policy, two preparation
directories and blob `3754992953a5a0e86bd6ae95a1e5596feb22c16f`.
A's committed nested definition with `nested: true` returned only
`nested-check`, the nested path and its own blob. Neither working C nor the
other committed definition leaked into these requests. Separate committed
missing, symlink/nonregular, malformed JSON and schema-invalid definitions
each rejected with an explicit diagnostic; all public-reader calls left refs
unchanged and executed no checks.

The [same-release P4 F2 witness](../evidence/iteration0-p4-installed-f2.json)
ran public committed full and partial audits with installed Ramify 0.4.0 and
real Vitest 4.1.11. Full source A passed both configured commands: five
runner-discovered files, five run, none missing; the custom `.check.ts` tests
and auxiliary `checks/aux.test.ts` ran, while the configured excluded test did
not. The partial audit of B passed and composed with A; it executed newly
added root and grandchild tests in separate ownership groups, without running
the intervening child or similarly prefixed `a-extra` test. Its declared
expected/run count was five, with no missing file. A deliberately failing
configured command at C `82a4922364123b66df8cc1717987805a041642fa`
forced full mode and yielded `overall: fail`, `expectedFiles.status:
unavailable` with `discovery-failed`, and a failed source command; it was not
misreported as passing coverage. A pre-start abort returned
`cancelled`, published no ref and had no completed-result lookup; this is a
pre-start cancellation witness, not an in-flight process-kill claim. These
observations concern configured execution, discovery and completeness only,
not scenario implementation or architect judgment.

Additional [F2 cases](../evidence/iteration0-p4-installed-f2.json) delete a
previously eligible root `.check.ts` file. The next partial audit passes with
two expected and two run files, neither demanding nor reporting the deleted
test as missing. A following README-only commit has a genuine empty Ramify
selection: selected checks and tests are empty, `expected: 0`, `run: 0`, no
check commands execute, and the composed verdict still passes through the
scoped chain. A committed long-running configured command wrote its child PID;
the public service was aborted only after that marker existed. It returned
`cancelled`, emitted `check.started` then `run.cancelled`, settled the child
process, published no ref and had no completed-result lookup. This is the
running-cancellation witness; the earlier pre-start abort remains separately
recorded. The five completed audits were recoverable by public request and
source identity with exact matching run/report IDs. The fixture Git histories,
published report refs, original producer JSON and reproduction commands are
retained in [public fixtures](../evidence/iteration0-public-fixtures/README.md).

The [minimal disposable Ramify probe](../evidence/iteration0-disposable-adoption-probe.json)
used installed 0.4.0 on a marked temporary project, committed as
`537061eac008b8c3dca27b4990c31325676cdd61`. `ramify check --batch
--root . --format json` completed with passing, complete analysis. The public
affected `/4` answer classified `docs/example.ts` under `owned-unwired` as
ignored with no selected module, and `scripts/aux.ts` as analyzed auxiliary
source selecting its owner. The current agent root under the same released CLI
is predictably refused as `invalid-project` because its `module.ramify` lacks
`root module`; the root and three project fixture descriptions all still lack
that marker. Iteration 1 must migrate them atomically, while ordinary child
descriptions remain unmarked. This bounded probe did not run the agent's
future nested fixtures or adopted audit suite. A second
[actual-agent disposable probe](../evidence/iteration0-actual-agent-adoption-probe.json)
used a detached copy of `1c8764a8` with candidate 0.4.0/0.7.0 pins, marked
agent and three fixture roots, owned-unwired docs, three individually declared
nested projects and `ignorePaths: ["docs/**"]`. Its real released Ramify 0.4.0
check completed analysis of 12 owners and 580 source files but failed 15
cross-owner imports. Seven are `not-visible` ordinary web imports; eight are
`testing-origin` imports from web test helpers. All occur in three
`scripts/browser-acceptance/` TSX fixture entrypoints. The 316
`signature-inferred` and three `shared-global` notes are coverage limits, not
denials; there was no missing-signature-companion denial. Affected `/4`
classified the plan Markdown under owned-unwired docs as ignored with empty
seed selection, while `scripts/browser-acceptance/main.tsx` remained analyzed
auxiliary source selecting the root owner. The three fixture roots were
recognized as owned-nested-project; scratch/output exclusions survived.

Iteration 1 should keep the browser driver scripts in the root tooling scope
and relocate the three browser fixture TSX entrypoints and their Vite HTML
resources into the existing web owner's testing source. Update the drivers'
Vite roots/input paths and HTML module URLs together, preserving their
browser behavior and external script commands. Ordinary web imports then become
same-owner; web test helper imports retain their testing classification.
Neither exposing testing helpers to root ordinary source nor excluding
`scripts/` from analysis is a valid repair. The focused verification is the
three Vite browser fixture builds/runs, scripts TypeScript check and released
Ramify check. The seven ordinary imports are
`ExecutionMapArea`, `loadExecutionMapPages`, `ExecutionMapSnapshot`, two
`ProtocolClient` references, `RunPage` and `PlanAndEntries`; the eight
test-helper imports are `canvasMap`, `capabilityDetail`, `scenarioDetail`,
`page`, `reply`, `sessionView`, `checkFindingKey` and `StubClient`.

The [contract freeze](iteration0-contract-freeze.md) traces initial, local and
capability submissions, engineer proposals, scenario rendering, handback,
rejected submissions and recovery to current source seams. It names the
three-state events and read projection, explicit case/test registration,
reporting during coordination, assignment completeness and removal inventory,
with PB3-D01–D12/C01–C06 receiving fixtures. This is reviewed contract
preparation only; none of those runtime cases has passed. It retains the
single `included` list and one readiness full-audit request already adopted
in [contracts](../contracts.md).

The coordinator inventoried all 16 protected `.principles.md`/`.spec.md`
files at the entry commit; their hashes are preserved in the
[protected baseline](../evidence/iteration0-protected-baseline.json). Dan's
accepted edits to `docs/harness.principles.md` and the two scope hunks in
`docs/harness.spec.md` are part of that baseline. On 2026-10-07 the
coordinator authorized exactly the replacement of both paragraphs of
`docs/harness.spec.md` section "Verification Follows Scope And Audit Policy"
with the full proposed verification paragraph in
[protected wording](../protected-wording-proposal.md), starting "Verification
executes" and ending "passing source analysis." This authorization is
frozen for the appropriate implementation iteration. The coordinator also
authorized exactly the one-sentence correction in "A Small Closed Set of
Outcomes Is the Whole Protocol" recorded in the same proposal: distinguish an
engineer completion proposal from an architect's accepted done report, without
changing its surrounding role and tool rules. Both corrections express the
accepted actor boundary; neither is applied in iteration 0. No other
protected patch has been authorized. The final
committed, staged, unstaged, untracked and renamed-file comparison is recorded
at handoff.

**Current gate:** the responsibility freeze, public P3 and revised P4 witnesses,
and bounded actual-agent adoption inventory are complete. This receipt still
requires its final committed-head baseline applicability and protected-file
comparison below before the two-track iteration-0 exit gate passes.
