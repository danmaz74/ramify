# Retained batch measurement evidence

## Merged main, 2026-09-10

The run on the merged `main` at `f5b0939`, after the end-of-workflow fixes,
passed every reviewed Plan 1 measurement target for both fixtures. It ran
from 21:34:16 to 21:40:35 UTC on Linux x64, Node v22.23.2, TypeScript 7.0.2
and tsx 4.23.13, with 182 build artifacts at measurement identity
`37318ecc2077863ec924a2f15b4b9766c2a8c70f78aeb6561b25cc38a5316408` and harness identity
`a2a0148124f14bad145e8779f0be66731ab3e6cdd83ebd41ea4b0b110f9c91b4`, the same build the completion
gate recorded. The lossless payload is [merged-main.json.gz](merged-main.json.gz) and
[index.json](index.json) names it as the final record.

| Target | Reference result / limit | 100-owner result / limit |
| --- | ---: | ---: |
| Median of five cold compiled CLI checks | 3.648 s / 5 s | 6.130 s / 15 s |
| Sampled combined parent/helper/native RSS peak | 480.863 MiB / 512 MiB | 367.785 MiB / 768 MiB |
| Last 20 cycles: heap growth minus retained serialized report bytes | -9.433 MiB / 16 MiB | -75.568 MiB / 16 MiB |
| Last 20 cycles: RSS growth | 21.594 MiB / 64 MiB | 62.270 MiB / 64 MiB |
| Maximum disposal after a completed check | 0.474 ms / 5,000 ms | 0.570 ms / 5,000 ms |

Both repeated workloads kept all 25 reports reachable: 41,032,300
serialized bytes for the reference and 174,147,450 for the synthetic
project. Every cycle returned zero active sessions, reachable disposed sessions,
open captured-input handles, helper or native descendants and analysis timers;
the reference opened and closed 57,990 file handles and the
synthetic workload 129,960. RSS again rose monotonically in both workloads
while adjusted heap declined, the same retained-report pattern investigated below.

## Iteration 15 final run, 2026-09-10

The final quiet run of iteration 15 on 2026-09-10 passed every reviewed Plan 1 measurement
target for both fixtures. It ran from 06:35:06 to 06:41:49 UTC on Linux x64,
Node v22.23.2, TypeScript 7.0.2 and tsx 4.23.13. Full hardware/runtime metadata,
request, scope, configuration, registry, capabilities, stages and per-process
samples are in [compact-final.json.gz](compact-final.json.gz).

| Target | Reference result / limit | 100-owner result / limit |
| --- | ---: | ---: |
| Median of five cold compiled CLI checks | 4.045 s / 5 s | 6.360 s / 15 s |
| Sampled combined parent/helper/native RSS peak | 502.328 MiB / 512 MiB | 365.270 MiB / 768 MiB |
| Last 20 cycles: heap growth minus retained serialized report bytes | -4.962 MiB / 16 MiB | -73.811 MiB / 16 MiB |
| Last 20 cycles: RSS growth | 31.855 MiB / 64 MiB | 58.516 MiB / 64 MiB |
| Maximum disposal after a completed check | 0.446 ms / 5,000 ms | 0.555 ms / 5,000 ms |

Each repeated workload ran five warmups and 25 measured create/check/dispose
cycles. All 25 full immutable plain reports remained reachable: 44,767,075
serialized bytes for the reference and 174,157,850 bytes for the synthetic
project. Every cycle had zero active sessions, reachable disposed session
`WeakRef`s, open captured-input handles, helper/native descendants and analysis
timers. The reference opened and closed 58,050 file handles; the synthetic
workload opened and closed 129,960. Each started and closed 60 helpers.
Reports retained identical input identities and 25 distinct run identities.

RSS rose monotonically in both final workloads. This was investigated against
the deliberately retained reports: the paired setup samples give median report
heap differences of 1,541,568 bytes for the reference and 2,924,800 bytes for
the synthetic fixture, and the repeated samples show comparable retained heap
increments. Heap growth after accounting for report bytes declined, while
session reachability and all measured resource counts returned to zero. Both
RSS growth values passed the unchanged 64 MiB limit **without subtracting
report bytes from RSS**. These finite measurements do not establish a universal
leak-free guarantee or a resident daemon plateau.

Setup samples measure a completed report retained beside its session, then
release both. The engine has already released compiler/input resources when
analysis returns. Separate cold samples measure their peak cost; cooperative
cancellation is covered by the lifecycle fixtures, not by the sub-millisecond
completed-session disposal numbers above. Summed RSS counts shared mappings
more than once, and 50 ms sampling can miss shorter peaks. Actual sample times
remain in the raw payload. No OS page-cache flush or production GC policy was
introduced.

Both authored fixture identities match the reviewed iteration-1 probes. The
reference has 93 measured authored files / 181,115 bytes; its checker scope
contains 15 owners, 54 TypeScript source files and five resources. The canonical
synthetic fixture has 1,402 authored files / 1,164,385 bytes, with 100 owners,
1,100 TypeScript files and 100 CSS resources. The raw input and compiler scope
records remain separate from these authored-file measurements.

The final 182 build artifacts have two recorded hashes with distinct recipes:

- Measurement tree-of-file-SHA identity:
  `03f2de7666a273cb5b0e18bc81507abacc0e8b1f86df33b652a7e8726fcdc6f3`.
- Harness sorted path/NUL/content/NUL identity:
  `435bd02d03e953fd753479b086365e8e5a2570af9d8c9a6564b8412746df4cb4`.

The measurement runner verifies its build identity again at completion.
[index.json](index.json) records raw and compressed SHA-256 values, fixture
identities, individual outcomes and the matching harness build hash. Payloads
are retained without edits in gzip streams with level 9 and timestamp zero:

```sh
gzip -dc scripts/measurements/results/compact-final.json.gz
```

Earlier failures remain available:

- [baseline-cold.json.gz](baseline-cold.json.gz): the reference peak was
  526.770 MiB, exceeding 512 MiB.
- [baseline-repeated.json.gz](baseline-repeated.json.gz): reference adjusted
  heap grew 21.138 MiB; synthetic adjusted heap grew 86.598 MiB and RSS grew
  220.699 MiB. Lifecycle counters still returned to zero.
- [shared-reports-first.json.gz](shared-reports-first.json.gz): early compiler
  disposal and per-report structural sharing fixed cold and heap targets, but
  synthetic RSS still grew 77.023 MiB.
- [compact-shape-diagnostic.json.gz](compact-shape-diagnostic.json.gz): a
  diagnostic census of one real synthetic report found 32,456 unique objects,
  including 6,521 arrays. Compact object allocation reduced its observed
  report heap difference from 3,507,784 to 2,918,160 bytes. This one-session
  diagnostic motivated the final measurement; it is not acceptance evidence.
- [buffer-fix-cold-nonquiet.json.gz](buffer-fix-cold-nonquiet.json.gz): concurrent
  parent verification overlapped this intermediate run; it is diagnostic only.
- [interrupted-recorder.json.gz](interrupted-recorder.json.gz): an independently
  expected SIGTERM failure retains 19 RSS samples and explicit JSON parse-failure
  metadata, exits 1, and leaves zero observed owned processes.
- [baseline-setup.json.gz](baseline-setup.json.gz): initial setup/disposal samples.

The final corrections reuse helper receive buffers, release the compiler after
source extraction, and share equal immutable report subtrees using compact
object allocation. Serialized findings and retained report byte counts stay
unchanged. No target, fixture, cycle count or source capability was reduced.
Run the [documented recipe](../README.md) to produce fresh measurements; daemon,
MCP, web, revision history, queues and leases remain later-plan work.
