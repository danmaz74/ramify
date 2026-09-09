---
name: testing
description: Design, run or assess Ramify tests and acceptance evidence, including model cases, CLI workflows, reference checks and later transport or browser verification. Use when verification is the task or needs deliberate design, not for every routine edit.
---

# Testing

Read the active acceptance criteria and the
[testing guide](../../../docs/development/testing.md). Inspect the actual package
scripts and runner scope before choosing commands. Read the
[quick-testing architecture](../../../docs/architecture/quick-testing.spec.md) when
designing a harness or deciding whether direct execution establishes a claim.

Identify the observable behavior, independently expected result and boundary
that must be exercised. Select focused cases and meaningful positive/negative
controls. Use real implementations behind direct adapters where specified, and
actual processes, transports or browsers where the required evidence depends
on them. Choose available tooling that exercises that boundary; report missing
evidence when no suitable facility is available.

Keep fixtures and resource lifetimes isolated, and run required regressions
according to the changed scope. If a failure appears, retain the original result
and use a focused reproduction instead of retrying a whole suite until it passes.

Report exact commands, outcomes and coverage limits. Catalogue validation,
example application tests and a successful report command do not by themselves
prove source conformance. A review-only testing request reports defects without
silently expanding into fixes; authorized repair uses the bugfixing procedure.
