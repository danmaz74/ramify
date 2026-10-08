# Cleanup integration and configured baseline

**Date:** 2026-10-08. **Status:** merged, including focused recovery correction;
final full qualification outstanding.

The coordinator reviewed implementation `42c1552737734de4ecb296855d76d3b923454e80`
and merged it into the Plan 21 target as
`e1ebdb755b123ffbcc92caa85c8866b8d136fc1b`. The integrated command-runner file
passed all 19 tests (1.62 s). No concurrent Plan 21 changes were discarded.

After the independently owned Plan 21 audit finished, the coordinator ran the
installed released audit CLI in the clean cleanup worktree:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

This audit captured cleanup commit `42c1552737734de4ecb296855d76d3b923454e80`,
before the acceptance conversion. Its report is
`01884a43306744e683a419053988ceac6ce572a6`; run ref
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-08T04-40-45Z-42c155273`.
Retrieve its durable evidence with:

```sh
git show refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-08T04-40-45Z-42c155273:reports/audit/summary.json
```

The invocation failed: 242 test files passed, one failed and one skipped;
1,936 tests passed, one failed and two skipped. Test-command duration was
297.123 s. Scenarios, structure, type checking, web build and patch integrity
passed. Zero discovered scenarios are not scenario acceptance evidence.

| Remaining conversion family | Test-file time in this audit |
| --- | --- |
| Capability acceptance (12 cases) | 98.916 s |
| Capability dependencies (13 cases) | 26.899 s |
| Capability recovery (18 cases, one failure) | 16.197 s |
| Nonfunctional recovery (14 cases) | 15.091 s |
| Capability delegation (12 cases) | 7.461 s |
| Capability assignments (4 cases) | 6.218 s |

These measurements identify the current conversion priority; they are not
passing qualification or a controlled comparison with the supplied 961 s run.

The failing CA20 real-process recovery case reported `LedgerCorruptError`:
another writer appended 243 bytes to the log. A focused repeat also failed.
The cleanup subagent reproduced failure with the optimized script and success
with the original script, then restored the optimized source. The fixture
freezes a registration callback while the old service remains alive in the
test process; recovery kills its real child and wakes the old executor,
allowing the supposedly crashed writer to append beside the recovering one.
The old delay masked this invalid crash simulation. Follow-up implementation
`84651baafbac7ae5f6de15f6188bf6e7b066ee8f` freezes delivery of the real
executor's completion after the simulated crash. It retains actual group
settlement and successor-blocking assertions and asserts the old service's
event sequence remains unchanged. Its 19 executor cases and CA20 passed;
type checking and structure checking passed. The coordinator reviewed and
merged it as `3d69f9236d90a32c39732f3ba7657586bc80e8a7`, preserving 21 unrelated
dirty Plan 21 files byte-for-byte. Integrated CA20 passed. The failed audit
remains part of the evidence; full-audit rerun is outstanding.

The independent Plan 21 work has since advanced the target. This report applies
only to its captured source. Final qualification must audit the final optimized
delivery, including the adopted concurrent Plan 21 changes.
