---
name: bugfixing
description: Reproduce and fix executable defects in Ramify source or tests, then verify the correction and affected behavior. Use for bug reports and failing checks; prose-only corrections use document validation instead.
---

# Bugfixing

Read the relevant contract and the
[bug-reproduction guidance](../../../docs/development/testing.md#regression-scope-and-bug-reproduction).
For Studio startup, scheduling or check-dispatch failures, use
`cucumber-viz-debugging` to identify the failed operation before changing Ramify.

Prefer extending the nearest meaningful test. Confirm it fails for the reported
defect rather than a setup problem, then make the focused correction. Preserve
the accepted behavior and ownership contracts; changing a test expectation is
not a substitute for fixing a regression.

Verify the reproduction passes and run the affected regression checks. If a
deterministic reproduction is impractical, record why and retain the actual
process/browser evidence used. Do not claim an unrun check passed or import
another project's test commands.

Report the cause, correction, verification and any remaining limitation. Respect
the current task's scope, existing edits and workflow ownership of commits.
