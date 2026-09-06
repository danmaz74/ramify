# Reference harness and implementation stages

**Status:** Plan only. The [project](README.md) and [case catalogue](cases.md)
describe the subject and intended expectations. This document defines how to
exercise them without confusing a runnable example with an implemented checker.

## Placement and independence

Put filesystem/process orchestration under `scripts/reference-harness/`, with a
dedicated TypeScript and Vitest configuration. The current
[`vitest.config.ts`](../../../vitest.config.ts) collects only `src/**/*.test.ts`,
and [`tsconfig.json`](../../../tsconfig.json) keeps Node ambient types out of
toolkit source. Do not weaken those defaults merely to host this harness.

The example has one independent package/configuration and explicitly declared
dependencies. Its install, type-check, Vite build and tests must work after
Ramify is extracted into its own repository. Do not depend on ancestor-installed
frameworks. The harness consumes the example's actual files and the toolkit's
supported public entry points; it does not become application source itself.

The example uses `src/tests/` and `src/interfaces/` inside every owner that needs
them. Resolve the testing profile before the enclosing ordinary-source profile.
Test discovery must find the nested test areas across `subs/`; production-only
selection excludes them while preserving interface vocabulary. Harness copies
retain this nesting and do not flatten source areas into sibling directories.

Prove independence once during scaffolding, and again after dependency changes:
copy the example without dependencies/build outputs to a temporary directory
outside both the enclosing repository and Ramify. Install from its own lockfile,
then type-check, build and run its application tests there, without ancestor
packages or inherited module-resolution overrides. Ordinary mutation runs can
use the cheaper placement below.

## One clean baseline, temporary variants

Keep every checked-in baseline import intentional. Never insert forbidden imports
into the running demo or rely on a comment telling readers to ignore them.

For a mutation:

1. Copy the baseline's source, descriptions and relevant configs into a uniquely
   named directory under the example's ignored `.reference-work/` area. Exclude
   dependencies, outputs and previous temporary copies. This placement permits
   ordinary resolution of the example's own dependencies without copying them.
2. Select the copied application root explicitly. A description above the copy
   or another fixture's source must not enter this analysis.
3. Apply a small recorded edit: add an import, remove an exposure, alter a profile,
   change a resource path, or introduce a malformed layout. A case should isolate
   one cause, even if the cause legitimately yields several diagnostics.
4. Run only the relevant supported checks. Most access-rule negatives should
   remain valid TypeScript and fail specifically because of Ramify's rule.
   Parser/missing-source cases intentionally test their different failure class.
5. Assert reason, importer/source area, original owner/binding or resource, and
   useful source location. Avoid brittle full-output snapshots or requiring
   exactly one diagnostic when a structural fault has several consequences.
6. Remove the copy. Offer an explicit preserve-on-failure option for inspection;
   never edit the baseline or another test's workspace as cleanup.

A different architecture probe may require a small overlay rather than one edit.
Record those changes explicitly. Do not disguise a broad restructuring as a
single-fault conformance test.

## Expectations independent of the implementation

Maintain small case records with:

- Stable case/instance ID and human-readable intent.
- Baseline entry or mutation/overlay description.
- Required capability: model, source areas, custom registry, loader, resolver,
  a supported source form, browser, or a host adapter contract.
- Authority status: adopted, chosen pending specification, or undecided probe.
- Expected supported result and the important original/source identities.
- Expected coverage notes where analysis is intentionally partial.

This is harness data, not a competing `module.ramify` format or permission DSL.
Expectations are reviewed independently; do not calculate the expected result
by invoking the same evaluator being tested.

Where the existing evaluator can test a core rule, a small explicit model witness
can supply early feedback. It does not verify the example's filesystem layout,
description grammar or source imports. Once the real loader is available, make
the corresponding reference cases consume its output. Keep focused model unit
tests useful without maintaining a second fictitious application indefinitely.

## Separate execution from semantic readiness

| Axis | States | Meaning |
| --- | --- | --- |
| Authority | Adopted / chosen pending specification / probe / separate responsibility | Whether an expected semantic result is binding. |
| Implementation | Available / absent / deliberately unsupported | Whether a checker can perform the requested analysis. |
| Execution | Passed / failed / not executed | What actually happened in this run. |
| Coverage | Complete for the case's stated scope / partial with notes | What the result establishes. |

Missing parser/custom-tag/source capabilities are **not executed**, not passed.
Do not populate a green suite with unconditional skips or silently drop those
cases from its summary. A stage command may pass its implemented scope while
reporting the remaining target work. A phase-completion command must require its
declared capabilities and fail if one is absent.

Conversely, an intentionally unsupported runtime loader does not make a supported
bounded check fail. Its report should expose the distinction:

```text
Application/tools: passed
Supported architectural assertions: passed
Known import violations: 0
Source coverage: partial — 2 runtime-selected loader sites not analysed
Target capabilities not yet implemented: filesystem descriptions, custom tags
Design probes awaiting decisions: associated types, vocabulary wildcard
```

The numbers and names above illustrate report fields, not current results.
An additional definite forbidden import must change the check result to failure
even when the same coverage notes remain. Missing framework execution is also
not interchangeable with an accepted static-analysis limitation.

## Execution tiers

| Tier | What runs | What it proves |
| --- | --- | --- |
| Application | Independent TypeScript check, in-memory business tests, Node entry/configuration and Vite build. | The reference is usable with its declared tools. |
| Protocol | Real typed tRPC request/client checks and MCP client/server list/call tests using the smallest supported transports, plus D02's source ownership review. | Factory composition, exact public typing and fresh session-context behavior; source review establishes handler placement. |
| Model | Supported evaluator queries over known originals and exposure/profile arrangements. | The evaluator's implemented rules, not a parser/source integration. |
| Filesystem/source | Real descriptions, original resolution, resources and supported source constructs, including temporary mutations. | The implemented loader/checker behavior on this reference. |
| Browser/tools | One real browser against Vite and the tiny API; focused Cucumber/Jiti fixtures. | Lazy/glob/style/setup/config behavior actually executes with normal tools. |
| Host contracts | Tiny adapter input/output fixtures, including H03's module README reads. | Declared IDs, source/test/metadata roots, README summaries and paths with explicit missing-documentation results, provenance and separate dependency/write concepts. |

Do not run a browser for every forbidden-import variant. Keep model/source cases
fast, reserve browser execution for the small compatibility suite, and reuse one
controlled browser session where isolation permits. A successful bundle/jsdom
test is not the browser execution evidence for lazy imports or applied styles.

Start in-process protocol checks early. Add one loopback transport smoke test for
the actual mounted endpoints; exhaustive HTTP/protocol testing belongs to their
libraries. No external service, credentials, agent account or fixed shared port
is required.

## Browser and tool fixtures

The browser should observe a review result, a lazy component, an eager/lazy
named-glob component and applied styles. A glob fixture deliberately exports
both a selected component and an unrelated private helper; this catches an
analyzer that broadens permission solely because the tool chose lazy loading.

Keep an ordinary runtime-selected fallback and a Vite-injected setting. The
future checker may leave these partially analysed; the runtime test must still
work. The example does not replace normal loading with a mandatory registry.

A tiny independent-project fixture supplies a component and TypeScript config
loaded through the real tools. Record that project's source scope separately.
An additional known alias into the primary example must still be attributed
to the primary application; an unknown target must not be fabricated as external.

The Cucumber smoke test uses actual runner registration and one scenario, not a
home-grown hook API pretending to certify that framework. CommonJS, packaging,
ambient/global and instrumentation samples are small separate fixtures with
explicit coverage expectations, not extra production owners.

## Prospective commands and milestones

Choose final command spelling when scaffolding. The required separation is:

- Run/build/type-check the example independently.
- Run fast application and protocol tests.
- Run currently supported reference-model/source cases and report missing stages.
- Require a named completed stage's capabilities and assertions in CI.
- Run the actual browser/tool compatibility suite.
- Run a named non-normative design probe and inspect its differences.

All commands are owned by Ramify or its example package. They must not require
an enclosing application's test runner, build scripts or dependency policies.

The implementation sequence should deliver the runnable reference and visible
pending-case inventory before the source checker. As each toolkit capability
lands, activate its already-described cases and require them for that stage.
Do not postpone all useful tests until the whole toolkit is implemented.
