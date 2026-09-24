# Iteration 2: Pinned source sync and offline snapshot checks

**Plan:** [Shared guidance discovery and sync](../main-plan.md).
**Prerequisites:** Iteration 1's reviewed specification, fixtures and owner placement.
**Owners:** `ramify/guidance` if approved, or the reviewed alternative; only its declared contracts and owned tests.

## Goal

Produce a deterministic local snapshot from selected immutable source revisions and verify that snapshot offline without permitting unsafe or partial adoption.

## Read first

- Main plan: runnable workflow and GS01–GS08.
- Iteration 1's `guidance-sync.spec.md`, synthetic fixture identities and handoff.
- The approved owner's README and declaration; root/CLI public contract only where needed to implement its port.
- `docs/development/engineering-practices.md` for validation, lifetime and refactor guidance.

## Deliverables

1. Implement catalog and selection parsing with explicit schema versions and structured diagnostics. Validate every path against the source tree and destination root, including symlinks, traversal, duplicate/colliding output and reserved names. Reject executable source content; Git data is read as inert bytes.
2. Fetch source trees at full pinned commits through an injected Git operation, using the user's normal credentials without recording them. Validate all selected content and compute all outputs before touching the managed destination. A missing or inaccessible source fails explicitly.
3. Render canonical Markdown files, local index and lock. Rewrite selected companion links to local paths and refuse unresolved relative links. Preserve source and rendered hashes, source owner and revision, status, force, profile membership and use cues. Update only the managed directory; refuse locally modified managed files and collisions with unmanaged files. Implement a recovery/detection rule for interrupted publication.
4. Implement offline `check` against the checked-in selection, lock and snapshot. It distinguishes a locally edited file, a changed selection and missing or corrupt managed files. It makes no network call or freshness claim about owner repositories.

## Matrix rows executed here

GS01–GS08 and GS10 at the owner/service boundary. GS09's lazy CLI behavior belongs to iteration 3.

## Verification

Run focused tests with synthetic Git repositories, including pinned commits after a branch moves, invalid content, unavailable source, symlink escape, conflict with a user's file, interruption and recovery. Compare exact bytes from repeated syncs; run offline check after removing network access. Keep network and filesystem adapters controlled in unit tests and add one real local-Git integration path.

## Exit criteria

Every selected output traces to an immutable owner source. An unchanged sync is byte-identical, a failed sync claims no new complete snapshot, and offline check detects every tested drift. The owner does not depend on analysis or on source-owner packages.

## Handoff

Pass the public operation, structured results and error codes, build inputs, fixture identities and GS01–GS08/GS10 evidence to CLI integration.
