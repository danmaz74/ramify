# Existing capacities and resource acceptance

**Checked:** 2026-10-03 from toolkit dispatch sources. These are current
admitted capacities, not new performance claims. Recheck the exact execution
revision. New auxiliary inputs count normally against these bounds.

## Policy

Decided by the user on 2026-10-03: correctness under the new rules comes first
and optimization second.

- **No rule is weakened for speed or size.** An implementation never skips
  owned source outside `src/`, prunes by anything other than declarations,
  answers from ownership or analysis state that may be stale, or reports a
  pass where work did not complete. A slow correct implementation is accepted
  and its cost recorded.
- **Capacity limits are safety limits.** Reaching one yields an explicit
  incomplete or unavailable outcome, never a partial pass. If the toolkit or
  the reference project reaches a limit because of the new rules, raise the
  limit with the measurement recorded; do not narrow the analysis.
- **Timing targets are measured, not blocking.** Run the timing and latency
  measurements of the completed plans on the baseline and on the candidate.
  A missed earlier target does not fail an iteration, the final gate or the
  merge. The hook deadline keeps its meaning: a slower check answers not
  checked more often, never a wrong result.
- **The user is informed at the end.** The final handoff lists every earlier
  timing target with its baseline value, candidate value and whether it was
  met, as input to a later optimization plan.
- **These remain pass/fail, because they are correctness:** explicit outcomes
  at limits, deadlines and cancellation; release of processes, watchers and
  listeners; and no reading, hashing or watching of inert or excluded files.

## Current capacities

| Boundary | Current limit | Source |
| --- | --- | --- |
| Acquisition | 3 attempts; 50,000 captured files; 20,000 application files; 8 MiB per file; 256 MiB captured input; 64 MiB application bytes; 1,000 owners; depth 128; 30,000 ms deadline | `src/batch.ts`, `src/resident-assembly.ts` |
| Source facts | 250,000 exports/accesses; 1,000,000 selections; forwarding depth 256; 90,000 ms deadline | Same dispatch sources |
| Whole analysis | 1,000,000 exposure pairs; 100,000 diagnostics; 96 MiB report; 120,000 ms deadline; 5,000 ms disposal bound | Dispatch and `src/report-capacity.ts` |
| Retention | 96 MiB per context; 512 MiB global; worker heap 512 MiB; 8 contexts; 2 hot contexts | `src/resident-budgets.ts` |
| Revision work | 2,000 ms update; 30,000 ms sweep; 10,000 queued paths; one concurrent analysis | `src/resident-budgets.ts` |
| IPC | 1 MiB request; 96 MiB + 64 KiB response; 128 MiB outbound/CLI/history byte bounds; 16 in-flight requests | Resident budgets and report capacity |
| API views | 32 MiB area; 256 MiB invocation/staging; 32 MiB signature-detail result | `subs/daemon/src/service.ts`, `src/resident-assembly.ts` |
| Architect projection | 64 MiB projection/publication; 16 MiB test-title result; 40 titles/record | Same view dispatch sources |
| Affected query | 4,096 modules/seeds; 100,000 edges; existing cooperative cancellation | `subs/analysis/src/affected-query.ts` |

PB1-24/37 verify limit exhaustion yields explicit invalid/incomplete/unavailable
results, never a completed partial pass; listeners, watches and owned compiler/
daemon processes close on failure and cancellation. Include boundary metadata,
warnings and path dispositions in existing serialized/fact byte accounting.

The scale fixture contains 10,000 inert files and 5,000 excluded files. Assert
no inventory/content-input growth from those files and zero watch registrations
within excluded trees; ancestor directory observations needed for discovery or
boundary existence are separate. An ordinary directory can still be walked.
Auxiliary source additions must increase source counts/bytes by the exact
independent expected amounts. Compare batch/retained inventories and counters
on identical inputs, with repeated-run plateau/cleanup evidence.

Capture baseline and candidate timings/memory without inventing a new latency
threshold. The completed plans' timing predicates are run and reported under
the policy above; their correctness instances remain binding in their
reference gates. Passing below one memory ceiling alone does not establish
semantic acceptance or an absence of leaks.
