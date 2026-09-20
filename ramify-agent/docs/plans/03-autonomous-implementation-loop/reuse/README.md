# Code reused from cucumber-viz

Reference copies for Plan 3, taken from the installed cucumber-viz 0.7.0. They
lie outside the compiler's scope and outside every module; an iteration places
each in its owner and adds tests. The
[MVP shortlist](../../../cucumber-viz-lessons/mvp-shortlist.md#2-code-to-lift)
explains the choice and the licensing.

| File | Source in cucumber-viz 0.7.0 | State |
| --- | --- | --- |
| [run-command-with-cleanup.sh](run-command-with-cleanup.sh) | `scripts/run-command-with-cleanup.sh` | Verbatim, with a provenance header. |
| [exec-and-collect.ts](exec-and-collect.ts) | `src/core/shared/services/test-process/test-process.ts:124-207` | Verbatim excerpt with its imports. To adjust: tell a timeout from a failure, write output to a file. |
| [clean-env.ts](clean-env.ts) | `.../check-execution/check-runner.ts:92-100` | Verbatim. |
| [resolve-contained-path.ts](resolve-contained-path.ts) | `.../sealed-files/sealed-path-containment.ts:40-71` | Adapted: the error type became a result; the logic is unchanged. Lexical only. |

To read and not copy: the remainder of `sealed-path-containment.ts`, for device
and inode revalidation around a rename, which the MVP guard does not need.

## Not copied: the commit audit

cucumber-viz's commit audit, which commits, runs the checks in a worktree of
that commit and certifies it afterwards, will be extracted from cucumber-viz
into a standalone command-line tool that ramify-agent integrates later. Its
code is therefore not copied here. For the MVP a gate runs the checks in the
working directory and the harness commits on a pass; see the proposal's
[run the checks, then commit](../core-records.proposal.md#run-the-checks-then-commit).
