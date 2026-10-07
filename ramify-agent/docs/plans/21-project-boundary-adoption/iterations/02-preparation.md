# Iteration 2: declared preparation and readiness

**Plan:** [Plan 21](../main-plan.md). **Prerequisites:** iteration 1, which
installed the release carrying P3.
**Owners:** audit child for provider configuration/preparation; harness for
captured policy, readiness and authorization.

## Goal

Prepare and verify what the project declares, without filesystem guesses about
which nested packages or test filenames matter.

## Read first

[Provider contract review](../provider-contract-review.md),
[Preparation contract](../contracts.md#5-preparation-and-project-policy),
P3's released signature/receipt, `run/policy.ts`, `run/readiness.ts`,
`run/project-config.ts`, `checks/checkpoint.ts`, audit
`check-execution.ts::workspacePreparationOf`, and Plan 20 scratch setup.

## Deliverables

- Expose a narrow harness-owned audit-configuration operation through the
  audit child, backed by P3; preserve blob/source/policy identity and provider
  validation errors. Add required named exposures/companions.
- Capture the effective workspace preparation, declared package directories
  and required commands. Preserve declared cwd, environment, timeouts and order.
  Package directories do not imply test commands.
- Remove nested-manifest walking and the depth limit from new-run policy
  construction. Remove readiness's default test-filename walk and test-script
  inference, consuming producer discovery/verification instead.
- Make the readiness baseline a full audit request of HEAD through the public
  provider, reusing applicable full evidence with both source identities
  recorded. Keep running the declared preparation in the run's working tree
  before the request. Remove the readiness check executor and its
  baseline-check steps; a provider failure or unavailable discovery stops
  readiness as today.
- Reconcile existing agent setup declarations with the committed audit
  workspace once in the configuration migration. Reject conflicting captured
  policies with an actionable error instead of running setup twice.
- Preserve clean-tree ordering, scratch checks, bounded preparation recovery,
  workspace intent/cleanup and process ownership. Keep the project audit file
  and relevant included-package configuration guarded.

## Verification

PB3-P01–P05 using F2/F3. Extend these existing focused files:

- `subs/harness/subs/audit/src/tests/workspace-preparation.test.ts`
- `subs/harness/src/tests/run-policy.test.ts`
- `subs/harness/src/tests/readiness.test.ts`
- `subs/harness/src/tests/readiness-nested-packages.test.ts`
- `subs/harness/src/tests/readiness-direct-recovery.test.ts`
- `subs/harness/src/tests/project-config.test.ts`

Rename an obsolete test file only if its replacement purpose is clearer; keep
its failure/recovery cases. The real P3 witness proves committed-vs-working
configuration and the deep declared package. A missing installation or failed
setup stops readiness without modifying audit policy. Run type-check/check:self.

## Exit criteria

New-run readiness uses declared preparation and provider discovery through one
full audit request, reused when applicable. An unrelated nested package cannot
create a new check, and a declared setup dependency cannot be skipped because
it has no tests. Failed preparation leaves truthful, recoverable evidence.

## Handoff

`iteration2-results.md`, effective-policy record and migration details,
P3 conformance artifacts and focused results.
