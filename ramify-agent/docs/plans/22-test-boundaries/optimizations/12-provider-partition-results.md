# Optimization 12: separate pure provider cases from native witnesses

Implementation `55439402348440621579d90dc1037d8303b431bf`, tree
`cf84fc8b4b4f8b7c45970e6acfd2e775e801be95`, on
`perf/plan22-provider-test-partition`, based on main
`58579fe4e54326b6195e032cb70b956b1c41fa09`. Integration targets `/ramify` on
`ramify-agent`; main's unfinished changes were neither copied nor modified.

All **42 original cases** remain once: **six ordinary and 36 native**.
All 39 original registration sources, including the template expanded into
four wrapper probes, are byte-identical in their destinations. All **191
original assertion source calls** remain. No new test, skip, retry, timeout
increase, production change or configuration change was introduced.

Four mixed files now keep their pure environment projection, environment-name
redaction, progress accounting, schema parsing and held/unavailable lock cases
in the original files. Hoisted guards refuse process launches before application
imports and verify zero attempts after each ordinary test, without resetting
the recorder. Native registrations and their helpers move into four exact
`.boundary.test.ts` files in the same owners. This prepares explicit ordinary
selection; filename suffixes do not yet establish runner membership.

Actual wrapper/executor output, exit, stdin, environment and process-group
settlement claims retain actual commands. Committed Git objects, public-provider
execution/publication/recovery, runner selection and in-place diagnosis retain
the installed adapters. Private kernel lock cases retain actual holders and
wait/expiry/cancellation/error observations. The case map states why a scripted
response cannot establish each native claim. The first three originals passed
36 cases before modification; the subsequently discovered lock file passed
six separately while still byte-identical to the original base.

Verification from the package directory:

- Nine focused files: **53 passed, zero failed/skipped**, including all 42
  originals and all 11 composition cases. The six ordinary cases asserted
  **zero attempted process launches**.
- `npm run type-check`: all four compiler scopes passed on the final sources.
- `npm run check:self`: zero errors/warnings; 313 existing analysis limits.
- Actual configured file discovery: **275 files, 258 Node and 17 web**,
  including conditional `fixture-trials.test.ts`. Exactly four boundary files
  were added; no configured file was removed.
- Complete base-to-implementation and last-commit diff checks passed.
- Released full nested audit: **unrun and required before merge**, owned by
  the coordinator. This receipt does not declare Plan 22 complete.

The final ordinary files took approximately 0.0206 s summed, while retained
native provider, command, preparation and kernel-lock files took 43.024 s,
1.478 s, 0.657 s and 0.127 s respectively. The original provider file took
39.662 s. These shared-host observations show the cost excluded by ordinary
selection; they do not claim a controlled full-suite speedup or removal of
required native coverage.

Foreign testing API discovery first materialized the evidence and audit views
through an owned private endpoint. They confirm the existing named harness
exposure of `guardedChildProcess`, `spawnAttempts` and signature companions;
the audit view also confirms the existing `CommandRunner` type. No exposure
change was necessary. Supported daemon stop succeeded, the captured daemon and
compiler were absent, and the empty owned endpoint was removed. Existing native
resource cleanup remains unchanged; no shared process or daemon was killed.

An initial authoring command used unavailable `python` without fail-fast,
which left the split unexecuted and ran the unchanged 36 originals again.
That passing redundant baseline is retained; subsequent dependent commands
used `set -e` and `python3`. The first 47-case qualification passed every
original execution case but failed composition's current producer-file address.
Only its four moved native addresses were corrected; the pure indeterminate
address and all titles, values and assertions remain. Final qualification then
included the discovered lock split and passed all 53 cases.

Current owner README and todo addresses follow the moved native witnesses;
historical Plan 21 receipts/commands and authoring snapshots remain intact.
One necessary README correction shares main's dirty
`ramify-agent/subs/harness/README.md` path: this optimization changes the witness
filename at original line 1222, while observed main edits occupy 1036–1068.
The coordinator must recheck those independent hunks and preserve main's bytes
when merging; this worktree contains no copy of that unfinished prose.

[Evidence and exact case mapping](12-provider-partition-evidence.json) records
source and registration hashes, per-case boundary rationale, configured files,
commands/results, retained failures and cleanup provenance. Automated health
and source preservation remain evidence for the responsible architect's
semantic-preservation judgment.
