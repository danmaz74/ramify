---
name: cucumber-viz-debugging
description: Diagnose cucumber-viz planning or implementation workflow failures while it operates on Ramify, including agent startup, scheduling, checks and recovery. Use for the external workflow tool, not ordinary Ramify runtime defects.
---

# cucumber-viz debugging

Read [workflow diagnostics](../../../docs/development/cucumber-viz.md#diagnose-workflow-execution).
Identify the installed tool revision, configured project root, workflow ID and
execution worktree before reading state or proposing recovery.

Trace the relevant snapshot and journal, then the associated turn and operational
logs. Correlate their IDs and inspect the actual check command, cwd and tested
revision. Distinguish a missing tool or unsuitable check configuration from a
Ramify product failure. Read only the evidence needed for the investigation.

Return the last completed step, failed operation, supporting paths/excerpts and
the concrete next action. Preserve the evidence. Use supported controls for
authorized recovery and account for other sessions affected by a restart; do
not repair execution by manually editing workflow state or check outcomes.

If a Ramify defect is established and repair is authorized, follow its ordinary
reproduction and verification procedure. A request to diagnose the workflow alone
does not authorize changing its implementation or restarting shared services.
