# Acceptance optimization integration

**Date:** 2026-10-08. **Status:** merged; integrated focused verification passed.

Implementation `18b7eccf89acb0a83589b69874ec3eb5870fb017` and reconciliation
branch head `5a1ec03c5d5b4d98a50f51aeec0f2867146851f3` were reviewed and merged
into the Plan 21 target as `b8b3e055a08ab2f6ab437a36e80b9945db0ad571`.
The other parent is `1f2785f5c6dbfed794c0d52d4ae62e34de33bcb8`.

Plan 21 had 32 modified tracked files at integration, including disjoint edits
in `run/service.ts`. Git's merge tree contains only committed inputs. The
coordinator applied the optimization's disjoint hunks, verified all unrelated
dirty file bytes unchanged and verified the overlapping service against a
three-way merge retaining its original user edits. The index was protected
and ended clean; the branch update checked the original HEAD. The Plan 21
working changes remain uncommitted. Its untracked boundary test was untouched.

From the target's **ramify-agent package directory**, the same seven-file
focused command in the optimization receipt passed all 37 cases, zero failed
or skipped. All twelve ordinary cases retained the zero-process recorder.
The ordinary file took 9.824 s; the actual witness took 7.047 s. These are
focused observations under current host load, not full-audit timings.
The selected CA20 real-process crash/recovery case also passed independently.

The coordinator's first integrated command used the enclosing repository
directory with Vitest `--root ramify-agent`. The actual witness's existing
fixture links tools relative to `process.cwd()`, so that invocation linked the
wrong tool directory and failed readiness. Its 36 other cases passed. Repeating
the documented command from the package directory passed all 37. No assertion,
source or timeout changed to obtain that pass. Reports remain at
`/tmp/plan22-acceptance-integrated.json` and
`/tmp/plan22-acceptance-integrated-package-cwd.json`; CA20's report is
`/tmp/plan22-ca20-integrated-package-cwd.json`.

The subagent also qualified the combined source against the copied Plan 21
tracked working patch, then removed that copied patch from its own worktree.
See its committed reconciliation receipt for exact inputs and limits. Newer
concurrent Plan 21 edits remain independently owned. Final full-audit
qualification must capture their eventual delivered source along with all
optimizations; it has not yet run.
