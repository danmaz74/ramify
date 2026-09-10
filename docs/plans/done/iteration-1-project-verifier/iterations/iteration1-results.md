<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 1 results: contract package and scope freeze

Status: review draft complete. This package is presented for architecture and
contract acceptance; it does not approve itself or establish checker conformance.
Iteration 2 may use the draft inventory. Contract acceptance remains required
before iteration 3.

## Delivered

- [contracts.md](../contracts.md): exact TypeScript vocabulary and signatures for
  identities, registry, source profiles, acquisition, descriptions, catalogs,
  accesses, decisions, inventory/validation/session operations, reports and
  injected CLI delivery. Includes the complete package export map, dependency
  boundaries, activation stages and type-only future AnalysisDriver boundary.
- [owners.md](../owners.md): all nine final module descriptions and README purpose
  paragraphs; named foreign-type exposure paths, explicit browser promises,
  header-only staging and a manual review against description validation rules.
- [move-map.md](../move-map.md): all 47 current source files and all 29 script/probe
  files, including legacy removals/splits, independent tooling, site consumers
  and the nine unchanged snapshot destinations after test migration.
- [scope.md](../scope.md): exact target configurations and staged build changes,
  versioned report semantics, deterministic production selection and clean
  pre-dist bootstrap, supported-platform consequences, finite limits and
  proposed numerical performance targets.
- [probes.md](../probes.md) and scripts/probes: seven executable compiler/input
  probes, source fixtures, a deterministic 100-owner workload generator and
  portable raw JSON results.
- [subcases.md](../subcases.md): 187 matrix groups expanded into 308 required
  execution records, including 168 syntax/behavior variants across 47 groups.
  Every record has an implementing iteration, capabilities, fixture/configuration,
  mutation and independent expectation. TypeScript and checked-JavaScript JSDoc
  import-type variants remain separate. All matrix instances are not executed.

No toolkit owner implementation, source migration, checker, harness runner or
application/configuration change was made. Existing workflow review-file changes
were preserved.

## Compiler findings and concrete choices

The installed compiler is TypeScript 7.0.2. Its root export lacks historical
createProgram/resolveModuleName APIs. The draft selects its exact-pinned exported
sync API inside a finite supervised helper at implementation time. Native
configuration-only parsing is available before source analysis, preserving
iteration 5's prerequisites.

The probes establish original identity through local/path aliases and the real
AppRouter forwarding chain, value/type flags for interfaces and merged runtime
bindings, complete fixture export enumeration, and .js substitution. Both real
CSS resources use the same native shim symbol, so the contract derives separate
resource identities from captured resource paths.

Configuration callbacks can use a captured filesystem view without live fallback.
A supervised helper can bridge synchronous native callbacks to a responsive
parent and terminate a stalled native request. Async API inspection and probes
show that async calls alone do not guarantee bounded close. Forced termination
evidence does not prove native-child reaping or the later real session's cleanup.
The contract includes cancellation during factory startup and retains the
real-session lifecycle gates in iterations 12 and 15.

Measured authored reference inputs total 181,115 bytes, including 152,358 owned
source/resource bytes. The deterministic 100-owner workload contains 1,152,000
source/resource bytes. These measurements ground finite defaults; cold latency,
peak memory and repeated real-session budgets remain proposed acceptance targets.

## Verification performed

Working directory for all implementation and git work:
`/tmp/worktrees/ramify-67e9dd0f/iteration-1-project-verifier`.

Base revision: `1b5157855eca81ddc98d208b6476c73c956988c5`.
Branch: `workflow/iteration-1-project-verifier`.

Passed:

- `npm run worktree:prepare`.
- `npm run type-check`, including the final probe scripts under
  `tsconfig.scripts.json`.
- `npx tsx scripts/probes/compiler-api.ts`.
- `npx tsx scripts/probes/reference-resolution.ts`.
- `npx tsx scripts/probes/config-input-view.ts`.
- `npx tsx scripts/probes/compiler-lifecycle.ts`.
- `npx tsx scripts/probes/fixture-sizes.ts`.
- `npx tsx scripts/probes/async-api-feasibility.ts`.
- `npx tsx scripts/probes/supervised-compiler.ts`.
- Strict TypeScript checking of all 19 extracted declaration blocks.
- Local Markdown links and anchors; 47/47 source and 29/29 script move coverage;
  exact matrix membership, duplicate/orphan variants and 308-leaf total.
- Manual final exposure review and `git diff --check`.

Static fixture spot checks corrected TypeScript 7's removed Node10 option,
top-level-await module status and an import-renaming shorthand before freezing
the inventory. A temporary document-audit regex initially treated quoted binding
and option names as subcases and missed the uppercase AppRouter label; the
corrected audit passes. These were validation tooling/fixture-draft corrections,
not checker execution failures.

Per the workflow check policy, Vitest/Cucumber regressions, scenario coverage and
sealed-file checks were left to the automatic checks. No I1 source-conformance
instance ran. Probe results are implementation-choice evidence only.

## Recommendations for Next Iteration

1. Review and accept the exact contracts, helper lifetime boundary, exposure
   stages and initial limits before iteration 3; revise this package first if
   an accepted contract needs to change.
2. In iteration 2 create only header-level owners, preserve transitional build
   output, and translate the frozen 308-leaf inventory into records and strict
   intermediate/full gate membership independently of available handlers.
3. At iteration 5 first compiler use, pin TypeScript 7.0.2 as a runtime dependency.
   Implement the configuration-only helper and captured view without a hidden
   dependency on iteration 6 or a live native filesystem fallback.
4. Later helper implementation must enforce the reviewed 1 MiB chunk framing,
   startup cancellation, normal child exit/reaping and result-detachment limits.
   The probes do not substitute for those real-session checks.
