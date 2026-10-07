# Provider contracts needed by the agent

**Date:** 2026-10-06. **Revised:** 2026-10-07. **Status:** prepared for provider review; no provider
change or new public API is claimed implemented. P1 is withdrawn; this package makes P3
and P4 in [provider requirements](provider-requirements.md) concrete. P2's
former `/2` versus `/3` disagreement is resolved in the current plans.

Source/document identities are in the [refresh snapshot](evidence/iteration0-provider-refresh.json).
The audit implementation is changing concurrently; its working-tree inspection
is distinguished from the [released-package inspection](evidence/iteration0-public-api-inspection.json).
Provider plan completion alone does not satisfy the additional contracts below.

## P1: withdrawn by the three-kind decision, 2026-10-06

The earlier request for a provider rule treating every undeclared docs path as
inert is withdrawn. Agent adoption declares `owned-unwired "docs"` and sets
`ignorePaths: ["docs/**"]`. This provides retained ownership, not-analyzed
check dispositions, empty affected seed selection and ordinary write scope;
the explicit audit ignore separately permits full reuse. PB3-A02/PB3-H01
still verify the actual installed provider with `.md`, `.ts`, `.mts`, `.mjs`,
new/deleted docs paths and analyzed scripts controls. Child-owned docs witnesses
declare owned-unwired at that owner. No provider-specific docs classifier or
write-scope exclusion is requested. P3/P4 remain independent public integration
requirements.

## P3: expose the existing committed-configuration reader

**Owner:** ramify-audit. **Consumer:** agent audit child's configuration
operation, used by preparation/readiness and committed gates.
**Acceptance:** PB3-P01, PB3-P02 and PB3-P04.

Recommended provider change: expose the existing operation from the public
package entry, retaining its existing validation and source identity. Inspected
implementation: `src/cli-configuration.ts::requestFromCommittedConfiguration`.
The concrete existing signature is:

```ts
requestFromCommittedConfiguration(input: {
  git: GitExecutorPort;
  repositoryPath: string;
  sourceCommit: string;
  projectRoot: string;
  full: boolean;
  force: boolean;
  nested?: boolean;
}): Promise<AuditRequest>
```

This is the proposed public signature, not an export available today. The
2026-10-07 review confirmed on the installed published 0.7.0 entry that the
operation is still internal: `dist/cli-configuration.js` and
`dist/audit-service.js` use it, `dist/index.js` does not export it, and the
CLI still has no configuration-only command. P3 therefore needs a ramify-audit
release after 0.7.0. The
provider owns any validation improvements needed for direct callers. Preserve
the exact committed definition blob in the returned coverage provenance,
normalized ignore/undetected policy, declared workspace and original check
definitions. Loading must not run preparation, execute checks, publish audit
refs or mutate the definition. Existing error handling must distinguish a
missing/non-regular definition from invalid configuration.

The released public CLI is not a configuration-only alternative: `CliRuntime`
accepts only cwd/signal, and `audit` reads HEAD then submits execution. It has
no request-capture or arbitrary-commit configuration operation. The public
audit service accepts an already constructed request, so it does not solve
configuration construction. Copying its parser or importing an internal file
would create the consumer substitute this plan is removing.

Witness procedure, through the eventual installed public package:

1. In temporary Git project F3, commit valid definition A, then commit different
   definition B and leave malformed definition C in the working tree.
2. Request A's exact commit. Assert A's commands, workspace, policy and blob,
   even though HEAD is B and working bytes are C. Request B and assert B.
3. Test a nested project, missing definition, symlink/non-regular definition,
   invalid policy, and malformed committed JSON. Compare diagnostics with
   the provider's CLI configuration behavior.
4. Assert that no checks/setup commands ran and no audit refs were written.
5. Resolve through the package entry in the installed/packed artifact; retain
   version, integrity, command and results. A source-tree import is not the
   acceptance witness.

## P4: configured committed execution

**Amended 2026-10-07. Owner:** ramify-audit for execution, configured discovery,
completeness and results. **Consumer:** the existing agent audit child.
**Acceptance:** PB3-T01–T06, PB3-P03 and PB3-E01/E02.

The earlier proposed union of assignment scope and project impact, with two
certification conclusions, is withdrawn. It was a proposed contract, never a
released capability or successful witness. The responsibility
[analysis](../../analysis/2026-10-07-agent-declarations-and-audit-responsibilities.md)
explains the change. No provider scenario mapping or assignment conclusion is
required. The harness records configured execution results for agent inspection.

### Public paths to qualify

Inspect the installed target package's `createAuditService`, `dispatchCheck`,
CLI and lifecycle contracts. The earlier 0.5.0 public API inspection is useful
history, not proof of current 0.7.0 availability or a reason to export every
internal helper. Prefer the public path that already owns configured execution.

The 2026-10-07 review listed the published 0.7.0 entry's exports from
`/home/app/tools/ramify-audit-0.7.0`. Beyond the 0.5.0 inventory it publicly
exports `runAudit`, `findCompletedAuditRequest`, `getApplicableBranchAudit`,
`getBranchAuditStatus`, `classifyCommittedProjectChanges`,
`classifyDirtyProjectChanges`, `classifyProjectPaths`, `resolveAuditComposition`,
`readPublishedAuditArtifact`, `readRawCheckResults`, `createNodeRepositoryExecutionLease`
and `withMachineTestLock`. `requestFromCommittedConfiguration`,
`discoverVitestCommand`, `compareExpectedFiles` and `vitestRunFiles` remain
absent. Start the P4 review from this inventory, recorded with the entry
digest in iteration 0's receipt, not from the 0.5.0 snapshot.

| Request | Required behavior |
| --- | --- |
| Committed partial audit | Original committed definition, provider impact/retained-failure policy, source-bound results and complete artifacts |
| Committed full/nested audit | Entire configured suite and project discovery, complete results, faithful full-applicability/reuse |
| Multiple runner commands/projects/roots | Preserve configured discovery and each invocation; no default filename heuristics or adapter retaining only the last process |
| Cancellation/restart | Current process/lease/artifact hooks; settle before replacement; recover completed audit by durable identity |

No input is a registered scenario, required-test declaration or `where` string.
No result says an assignment, scenario or delegated need is implemented.
A configured command failing, missing or unrun retains its producer result.
A runner-excluded test is agent inspection context, not an independently inferred
missing acceptance obligation. Audit may flag execution missing under its own
configured completeness contract.

### Revised F2 witness

Use real pinned providers in F2 with two configurations, a custom root/name,
new/deleted eligible tests and a genuine empty selection. Establish a clean full
baseline and an ordinary committed partial audit after a dependency change;
retain actual affected output, provider selection, discovery and physical runs.
Do not add unchanged assigned-owner tests solely for an extra certification.

Cover failed discovery, incomplete commands, cancellation and any
source-mutation handling the public contract promises. No dirty diagnostic
witness is required: the harness requests no dirty audit (2026-10-07). These
tests establish execution health/provenance, never semantic completion.

If a public path fails a necessary witness, iteration 0 records the precise
gap, minimal owner-reviewed signature and required release. No automatic demand
for a new scope selector, parallel harness parser or assignment-coverage API.
PB3-T06 remains unrun until the revised paths are demonstrated.

## Evidence completed now and successor work

Imported released ramify-audit 0.5.0 using its public ESM entry. Confirmed the
available and absent operations named above, then invoked its public grouping
function for a synthetic root plus disconnected grandchild selection. It
returned two groups and retained the root group's child exclusion. The
[record](evidence/iteration0-public-api-inspection.json) contains the input,
output, public entry digest and limitations. No test runner or audit executed.

The first inspection attempt used CommonJS resolution; the package's
import-only export rejected it. The successful inspection uses native ESM
from `/home/app/tools/ramify-audit-0.5.0`, with `import * as api from
'ramify-audit'` and `import.meta.resolve('ramify-audit')`. It does not deep-import.

Next review refreshes P3's public configuration alternatives and runs the revised
P4 witnesses against the target artifacts. The 0.7.0 release's earlier scope did
not claim to solve every agent integration question. Do not enlarge provider
work without a demonstrated remaining gap. Preserve original snapshots and
failed/successful inspection identities; none is relabeled as a new witness.
No provider repository or external communication is changed by plan consolidation.
