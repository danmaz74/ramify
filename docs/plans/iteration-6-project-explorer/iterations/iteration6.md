# Iteration 6: `ramify explore`

**Plan:** [Plan 6: Project explorer](../main-plan.md).
**Prerequisites:** Iteration 5's web process.
**Owners:** `subs/cli/` and root assembly.

## Goal

Launch or reuse the local explorer for the selected Ramify project with one
terminating CLI command.

## Read first

- [Main plan](../main-plan.md): runnable outcome.
- [CLI invocation contract](../../../architecture/cli-invocation.spec.md): root
  selection and exit conventions.
- Existing daemon discovery/start and CLI argument code.
- Iteration 1's web discovery, readiness and local access contract.

## Deliverables

1. Parse `explore [--root <dir>]` and add help text.
2. Resolve the project exactly as other resident commands do and ensure a
   compatible daemon/context.
3. Start or reuse one compatible web process, wait for readiness, and construct
   the project URL without placing filesystem paths directly in untrusted query
   text.
4. Open the platform browser and exit successfully once launch is handed off.
   A controlled browser-opener port makes tests deterministic.
5. Report daemon/web/start/open failures with explicit nonzero outcomes. The web
   process never falls back to batch analysis.

## Matrix rows executed here

EX27, EX28.

## Verification

Cover arguments, root selection, first start, compatible reuse, readiness
failure, daemon unavailability, URL construction, browser-opener failure and
cleanup of processes owned by a failed launch.

## Exit criteria

Both documented commands open the intended project in the explorer, reuse a
compatible process and return deterministic exits without loading web code into
ordinary CLI startup.

## Handoff

Iteration 7 receives the installed command and actual process workflow.

