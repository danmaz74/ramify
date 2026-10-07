# Provider requirements and convergence

## Inputs and precedence

1. [Ramify Phase 1 contracts](../../../../docs/plans/project-boundary-ramify/contracts.md)
   and [handoff](../../../../docs/plans/project-boundary-ramify/handoff.md).
2. Audit [Plan 7 Phase 3 handoff](/home/app/ramify-audit-pb/docs/plans/07-ramify-only-partial-audits/phase3-handoff.md)
   and [contracts](/home/app/ramify-audit-pb/docs/plans/07-ramify-only-partial-audits/contracts.md).
3. The updated [ignore-list analysis](/home/app/ramify-audit-pb/docs/2026-10-06-ignore-list-analysis.md),
   and [D10](/home/app/ramify-audit-pb/docs/2026-10-06-ramify-only-partial-audits.md#d10-projects-may-declare-ignored-paths-decided),
   including permission to list any project tree and configuration precedence.
4. The concurrent audit [Plan 8](/home/app/ramify-audit-pb/docs/plans/08-ignore-paths/main-plan.md)
   and [contracts](/home/app/ramify-audit-pb/docs/plans/08-ignore-paths/contracts.md),
   which record D10 and supersede the analysis's open-option framing. They
   target 0.6.0, explicitly consuming affected `/3`, but do not yet establish
   a released capability. Ramify's
   affected-rule work is in `/home/app/ramify-affected`, branch
   `feat/affected-rule`; its [contracts](/home/app/ramify-affected/docs/plans/affected-rule-selection/contracts.md)
   define `/3`. Use its actual handoff at convergence.

Dan's amended decision is `owned-unwired "docs"` plus
`ignorePaths: ["docs/**"]`. P1 is withdrawn. The current adoption pair is
published `ramify.ts` 0.4.0 and `ramify-audit` 0.7.0, with affected CLI/answer
`/4`, analysis/check `/3`, architect projection/module/view `/3`, IPC `/2`,
modularity `/3` and audit evidence schema 4. See the three-kind
[handoff](/home/app/ramify-nested-kinds/docs/plans/nested-tree-kinds/handoff.md).
The earlier Plan 8 and affected-rule target versions above remain historical
planning inputs and do not override these released pins.

Published 0.5.0 is an inspected reference, not the adoption target. It consumes
`ramify.affected-cli/2` / `ramify.affected/2`, writes evidence schema 4 and
refuses `enclosingProject`, `fullAuditPaths` and `ignorePaths`. Its existing
handoff requires joint adoption with the Ramify affected-rule release. Future
ignore support changes the last refusal and reuse contract; do not copy 0.5.0's
removed-field assumptions into the new adapter.

## Release and behavior prerequisites

| ID | Required contract | Current evidence / required action |
| --- | --- | --- |
| P1 | Withdrawn by Dan's three-kind decision | Declare docs owned-unwired and ignorePaths docs/**; retain PB3-A02 installed-provider witnesses, with no new provider docs classifier |
| P2 | Audit consumes that answer and supplies the final ignore/reuse policy | Published 0.7.0 consumes affected /4; the three-kind qualification passes actual partial selection, full reuse and configuration fan-out. Verify the agent adapter and committed policy against that pair |
| P3 | A public operation reads and validates committed audit configuration for a specified repository, project root and source commit | `src/cli-configuration.ts::requestFromCommittedConfiguration` exists in inspected audit source but is not exported from `src/index.ts`; confirmed still internal in published 0.7.0. Prefer exposing this existing operation and its contract in the release after 0.7.0, which iteration 0 obtains and iteration 1 pins as the single bump (Dan, 2026-10-07). A demonstrated public alternative is acceptable; copying the parser or importing `dist/cli-configuration.js` is not |
| P4 | Public configured committed test execution retains truthful source identity, completeness and complete producer results | Earlier assignment/scenario certification is withdrawn. Recheck `createAuditService`, `dispatchCheck` and the public CLI against actual agent needs. Demonstrate existing paths first; require a provider extension only for a named execution gap. Settle this before adoption; integrate final delivery in iteration 9 |
| P5 | Final `nested: true` result preserves every project and discovery result | Already present in `AuditRequest`, `AuditResult.projects`, `discovery` and `createAuditService`; qualify through the installed release with the agent adapter and cancellation/recovery |

P3 and P4 are identified integration work, not claims that the provider lacks
the underlying algorithms. Keep any extension in ramify-audit. Consumer planning
does not authorize modifying or releasing that other repository.

### P4 revised execution contract

**Amended 2026-10-07:** the former two-conclusion assignment/impact composition
is no longer a prerequisite. Audit receives configured checks and diagnostic
execution requests, not registered scenarios or required-test declarations.
It establishes test health, not whether an assignment or behavioral case is done.

Iteration 0 demonstrates public committed partial/full execution, using the
project's declared preparation, commands and runner configurations. Retain
source/configuration identities, all command results, diagnostics,
cancellation and process/artifact hooks. The harness requests no dirty audit
(decided 2026-10-07): every audit it requests runs over a gate's candidate
commit, and an engineer inspects uncommitted work through named focused
runs only. Configured discovery/completeness belongs to the provider. The
harness never builds its own file inventory.

Use existing public operations if they suffice. A missing exported helper is
not automatically a blocker when the public service/CLI already owns execution.
Any remaining gap needs a failing concrete witness, consumer operation, minimal
public contract and qualified release before dependent work. Do not request
suite/scenario identifiers, architect declarations, assignment satisfaction
conclusions or per-case evidence matching in the provider API.

Revised PB3-T06 demonstrates the configured committed execution path; it
no longer forces unchanged assigned tests into an ordinary impact audit.
Final full audit still executes the configured suite. An agent may run named
tests to inspect its work without turning that target into a harness-tracked
completion obligation. No scope probe, scoped test tool, union-certification
operation or new full fallback is required by this plan.

The approved Plan 8 defines optional `ignorePaths` within evidence
schema 4 and partial-selection report version 3. Preserve schema 4 if that is
the qualified contract; do not force a schema bump in the agent. Its old 0.3.2
baseline still needs replacement. Plan 8 also preserves nested discovery
independently of ignore matching. Recheck these details in the release receipt.

## Joint adoption receipt

Iteration 0 writes `provider-receipt.md` beside this file with:

- each package's exact version, registry, source revision, tarball digest and
  lockfile integrity, linked release gate and handoff;
- actual check, architect/API view, affected and audit evidence identifiers;
- P1–P5 outcome, operation signature, witness command, result/artifact identity
  and known limitations;
- the settled ignore-list validation, full-reuse and baseline-policy rules;
- whether captured-input classification and compiler-configuration fan-out are
  implemented, explicitly deferred by their owners, or still a release blocker.

Do not guess new identifiers. If the affected answer changes incompatibly,
adopt the audit release that consumes it. Record accepted provider limitations
as limitations, not new agent full-audit heuristics.

## Current convergence findings, amended 2026-10-06

Ramify 0.4.0 and audit 0.7.0 are published and qualified together. The
three-kind handoff binds exact artifacts, integrity values and complete release
gates. P1 is withdrawn; all-extension docs behavior follows the explicit
owned-unwired declaration. The earlier inspection found P3 unexported and left P4
assignment composition unsettled. P3 needs a refreshed public configuration
witness. P4 now needs only the revised execution witnesses above; the former
assignment composition is withdrawn, not a remaining release blocker. Historical
inspection revisions and original observations remain in the provider receipt.
PB3-A02 must still verify docs with source-like extensions and new/deleted
paths through the actual installed agent providers; no runtime agent adoption
is claimed by this documentation amendment.

## Agent policy under the updated analysis

- Remove `enclosingProject: "ignore"`; exact registry pins already keep the
  enclosing toolkit's changes from becoming an unpinned dependency.
- Set `ignorePaths: ["docs/**"]` as Dan's permanent project-policy decision.
  Full-reuse lookup does not ask Ramify; the owned-unwired declaration alone
  cannot establish reuse.
- Ignore entries may name both owned kinds or external trees; provider validation
  does not query ownership. This changes audit policy, never write authority
  or nested-project discovery. Known runner configuration, preparation inputs,
  listed undetected configuration and the audit definition remain protected
  from ignore matching.
- Leave `undetectedConfigFilesForcingFullAudit` absent/empty unless the actual
  checks read a specific otherwise-undetected configuration file. Do not copy
  old broad globs, compiler inputs or runner-detected files into it.
- A future explicit ignore belongs to project policy, remains guarded, and
  changes baseline compatibility. The harness consumes the provider's reuse
  decision; it does not calculate a tested-tree identity itself.
- Owned-unwired documentation adding no selected module does not by
  itself mean a full audit can be reused. A+ concerns explicitly ignored
  paths. The provider decides reuse, carried failures, caps and widening.

The earlier no-docs-ignore proposal is superseded by Dan's explicit decision. Audit self-adoption Plan 6 is not an agent prerequisite unless a
provider release explicitly makes it one.
