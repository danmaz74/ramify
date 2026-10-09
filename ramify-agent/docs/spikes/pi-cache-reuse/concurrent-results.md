# Concurrent forks with shared provider routing identity

Completed 2026-10-09 on Pi 0.87.1, `openai-codex/gpt-5.6-sol`, subscription/OAuth
authentication and SSE, with medium reasoning and zero provider retries.

**The remaining concurrency concern was not observed: both siblings completed
with independent responses and histories while sharing the provider header pair
and cache key. Every shared-identity first turn reused the parent's cache. This
supports adopting shared provider routing identity for related SSE forks, with
separate harness session IDs and histories.**

## Live test

Three repeats, two identity strategies, eight calls per cohort: **48 completed
live requests** in approximately 109 seconds. Each independently namespaced
parent carried 256 synthetic reference records. Input sizes were 12,662–13,095
tokens. Strategy order was reversed in the middle repeat.

Each cohort executed the existing four parent controls, then A1 and B1 together,
followed by A2 and B2 together. An HTTP-boundary gate released a pair only after
both calls had reached dispatch. Each call recorded its actual HTTP start and
the time its model stream completed; the verifier requires positive overlap.

- **12/12 pairs overlapped**, for 1.601–3.207 seconds. Dispatch gaps were 0–1 ms.
- Six of those pairs used shared provider identity, across three independent
  warmed parents. Six used the current separate-identity scheme as a control.
- Each sibling had a distinct logical session UUID and a complete independent
  transcript. In the shared strategy, both sent the parent's `session-id`,
  `x-client-request-id` and `prompt_cache_key`.
- The provider returned 48 distinct response IDs and HTTP 200 for every call.
- There were no stream failures, lost results or retries in this run.

## First-turn cache result

| Identity strategy | First-turn hits | First-turn cached share | Second-turn hits |
| --- | ---: | ---: | ---: |
| Current separate identities | 0/6 | 0% | 6/6 |
| Shared provider headers and key | **6/6** | **97.38–97.63%** | 5/6 |

The first-turn observation is decisive for forks used for a single request.
The second turns provide additional response/history isolation evidence.
One shared-identity second turn, `3-shared-routing-A2`, reported zero cache
reads; its response was correct. Shared identity still does not guarantee a
cache hit on every request.

The parent controls behaved as follows: six cold seeds, six same-key replay
hits, four hits out of six key-only changed replays, and six parent continuation
hits. All reported cache-write counts were zero. The earlier serial run's
observations remain separate and are not pooled with these counts.

## Response and history isolation

Concurrent tasks used stronger response controls than the original READY-only
experiment. Each branch received its own random private marker and each request
its own reply label. Its response had to contain exactly:

1. Its current request's label.
2. The marker given in its own first-turn task.
3. The requested record revision from the inherited parent reference.

Turn 2 did not restate the first-turn marker. A swapped response, wrong branch
history or lost inherited reference would fail the expected answer.

**24/24 fork responses passed**, including all 12 shared-identity fork requests.
Native requests retained the common checkpoint and each branch's own earlier
messages, with no sibling task content. Fork execution never mutated the parent.

The independent offline verifier read the original SSE completion bodies,
checked distinct provider response IDs and derived expected answers directly
from native request text. It independently confirmed labels, first-turn markers,
parent record revisions, normalized-versus-original replies and all 12 overlaps.

## Decision and scope

The tested concurrent SSE behavior removes the outstanding objection to adopting
shared provider routing identity for related forks. Keep provider routing
identity separate from logical harness identity; inherit and persist the former
across the fork lineage while retaining independent histories and task bindings.

This recommendation applies to the tested subscription provider/model/SSE path.
The spike does not test WebSocket sharing, cancellation interactions or durable
process restoration, and makes no claim about those behaviors. It is a focused
live experiment with two simultaneous siblings, not a production load test.
There is no remaining observed concurrency defect in this tested path; no
production implementation was changed by the spike.

## Reproduction and evidence

From `ramify-agent/`:

```sh
node docs/spikes/pi-cache-reuse/run.mjs --output /home/app/ramify-pi-cache-evidence/2026-10-09-concurrent-forks-01 --dispatch concurrent --modes session-key,shared-routing --repeats 3 --rounds 2
node docs/spikes/pi-cache-reuse/run.mjs --verify /home/app/ramify-pi-cache-evidence/2026-10-09-concurrent-forks-01
node docs/spikes/pi-cache-reuse/verify-wire.mjs /home/app/ramify-pi-cache-evidence/2026-10-09-concurrent-forks-01
```

The output directory must be new and empty for a live rerun.

- [Complete observations](/home/app/ramify-pi-cache-evidence/2026-10-09-concurrent-forks-01/summary.json).
- [Per-request cache table](/home/app/ramify-pi-cache-evidence/2026-10-09-concurrent-forks-01/results.md).
- [Native prefix, reply and overlap verification](/home/app/ramify-pi-cache-evidence/2026-10-09-concurrent-forks-01/verification.json).
- [Independent original SSE verification](/home/app/ramify-pi-cache-evidence/2026-10-09-concurrent-forks-01/wire-verification.json).
- Archived runner, verifier, initial fixtures, all native requests and full
  original/normalized responses and SSE bodies are retained in the same directory.
  The manifest records the actual runner SHA256.

Automatic live-run verification, a separate offline `--verify` pass and the
independent wire verifier all passed. Both JavaScript files passed `node --check`.
The extended runner also verified the previous 60-call serial artifacts, without
changing their original requests or responses.

`npm run check:self` passed with zero errors and warnings, all configured stages
completed and partial analysis coverage with 328 retained limits.
[Its log is retained](/home/app/ramify-pi-cache-evidence/2026-10-09-concurrent-forks-01/check-self.log).
This standalone spike stays in the project's documentation-owned excluded tree;
no configured automated-test discovery, production source or full audit changed.
