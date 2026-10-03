# Iteration 2: Scratch setup and lifecycle cleanup

**Plan:** [Main plan](../main-plan.md).
**ID:** H2. **Status:** pending.
**Project:** `ramify-agent`.
**Prerequisites:** H1 accepted with exact revision-bound handoff.
**Owners:** Harness preparation and shared iteration lifecycle.

## Goal

Scratch setup and lifecycle cleanup. Deliver only this capability and the supporting contracts needed for it.

## Read first

Relative source paths in this iteration are within `ramify-agent`. Run commands
from that project root and follow its own instructions; do not launch it in
the toolkit working directory.

Read [the main plan](../main-plan.md), including authority, contracts and acceptance. Read readiness, shared iteration executor/recovery and filesystem helpers; main plan scratch contract and harness specification.

## Scope boundary

Scratch setup/lifetime only within the shared iteration lifecycle; no readiness-package-discovery redesign or verification integration.

## Deliverables

Implement harness setup that adds missing effective anchored scratch rules to `.gitignore`, preserves existing content, avoids duplicates and handles newly introduced modules and later negations before scratch use. Record setup edits without expanding engineer root scope. Create scratch at iteration start; retain across repair/resume; clean union of project module scratch roots on terminal close/new-run readiness. Preserve evidence before cleanup; reject symlink traversal and expose cleanup failures.

## Matrix rows executed here

HB05, HB06, HB07. Cases assigned only in part retain pending status until the named integration iteration completes them.

## Verification

Use actual temporary files/Git ignore checks for missing/negated rules and symlink controls; fake clock only for scheduling. Cover every terminal outcome, interrupted resume, removed modules, old-run cleanup and retained evidence.

Use an isolated implementation checkout and preserve unrelated changes. Record candidate source/configuration revisions, commands, expected and observed behavior and primary artifact paths. A blocked or unrun stage is never a pass.

## Exit criteria

Scratch has exactly the iteration lifetime with safe project-local cleanup; hand off terminal/recovery witnesses.

## Handoff

Write `iteration2-results.md` with case outcomes, public contract changes, exact package/revision identities, resolved failures and remaining unrun acceptance cases and the next iteration's inputs. Advance status only from that evidence; planning validation does not establish implementation.
