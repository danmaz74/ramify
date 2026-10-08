# Optimization 13: main integration and verification

Merged into `/ramify`, branch `ramify-agent`, at `30ef84809ac31a484c394fc9a75dc548c33da607` after the
[passing full nested audit](13-premerge-audit.md) of `ce70bf386386e41326b43a4944f32137fae7fc24`.
The merge has parents `b23db328` and audited receipt `b6456e95`; its committed
tree equals that receipt exactly. All 26 concurrent staged, unstaged and
untracked user files were preserved, including the exact 19-path staged patch.
No user work was stashed/reset. No push was requested.

## Verification and retained failure

The 38-file focused run on the working tree containing concurrent edits
reported **270 passed, one failed, two existing optional skips**. The sole
failure was the existing real nested-module materializer assertion:
`Compiler server request failed: Offset is outside the bounds of the DataView`.
The real CLI returned 2; its assertion continued to require 0. That run remains
failed and is not presented as an all-pass result.

The same assertion then **passed in 33.883 s** on a fresh clean
checkout of committed integration `30ef84809ac31a484c394fc9a75dc548c33da607`. Four other cases were deliberately
unselected by the focused name filter; that is separate from optional fixture
skips. The clean full premerge audit passed all 2,088 cases, with the two existing
optional skips. The clean integration worker PID settled.

The guard, configuration, native test and corrected SDK helper have no
HEAD-to-working-tree differences. The installed compiler wrapper retains only
the exception message, so these observations do not identify its originating
operation or establish whether WIP, transient compiler state or transport
conditions caused the failure. No further whole-suite retry or source repair
was justified. The committed optimization is qualified; unfinished user work
and the failed working-tree observation are excluded from that conclusion.

[Exact preservation, commands, failure and source data](13-integrated-results.json).
[Final delivery and timing limits](../final-results.md).
