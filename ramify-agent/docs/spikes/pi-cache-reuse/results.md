# Pi subscription cache reuse: observed results

The later [concurrent sibling spike](concurrent-results.md) addresses the serial
experiment's concurrency limit: all six shared-identity first turns hit the
cache, with independent replies and verified HTTP overlap. Its observations and
adoption recommendation are recorded separately below that link.

Completed 2026-10-09 using the pinned Pi 0.87.1 public ModelRuntime,
`openai-codex/gpt-5.6-sol`, Pi-owned subscription/OAuth authentication, SSE,
medium reasoning and zero provider retries. This is a direct fork simulation,
not a production harness integration test.

**The current Pi identity scheme can reuse cache while alternating between two
forks, but often processes the inherited prefix again on each child's first
turn. Sharing only the body cache key did not improve first-turn hits in this
sample. Sharing the provider session header identities as well gave every
child a first-turn hit. Later misses still occurred.**

## Experiment

Two repeats, three strategies per repeat, ten requests per strategy: **60
completed live requests**. Each cohort has a unique early fixture namespace,
256 synthetic reference records and its own parent identity. Input sizes were
12,626–12,788 tokens, comfortably above the documented minimum. Strategy order
was reversed for repeat 2.

Each cohort seeds a parent, replays its identical request with the same key,
replays it changing only `prompt_cache_key`, continues the parent, then copies
the complete checkpoint into independent A and B forks. It alternates A1, B1,
A2, B2, A3, B3. Both children retain all parent messages including original
assistant continuation artifacts. Parent state remains unchanged and neither
child receives the other's task or answer.

| Strategy | Logical child UUID | Body `prompt_cache_key` | `session-id` and `x-client-request-id` headers |
| --- | --- | --- | --- |
| `session-key` (current adapter) | Independent | Child UUID | Child UUID |
| `shared-key` | Independent | Parent UUID | Child UUID |
| `shared-routing` | Independent | Parent UUID | Parent UUID |

There are no repository tools, file edits, agent loops, compaction, background
warming, explicit cache breakpoints or concurrent requests in the experiment.
All branches send their complete current transcripts on every SSE request.

## Observations

| Strategy | First child turns with a cache hit | Later alternating turns with a hit | Cached share across all 12 fork requests |
| --- | ---: | ---: | ---: |
| Current `session-key` | 1/4 | 8/8 | 73.75% |
| Body-only `shared-key` | 1/4 | 7/8 | 65.60% |
| `shared-routing` | 4/4 | 7/8 | 90.22% |

The last column is total reported cache-read tokens divided by total input
tokens for all fork requests of that strategy, including cold calls; it is
not a mean of the per-request percentages. A hit means `cacheRead > 0`.

First-turn details:

| Repeat | Strategy | A1 cached input | B1 cached input |
| --- | --- | ---: | ---: |
| 1 | Current `session-key` | 0% | 97.91% |
| 2 | Current `session-key` | 0% | 0% |
| 1 | Body-only `shared-key` | 98.72% | 0% |
| 2 | Body-only `shared-key` | 0% | 0% |
| 1 | `shared-routing` | 98.69% | 98.69% |
| 2 | `shared-routing` | 98.68% | 98.68% |

Controls across the six cohorts:

- Parent seeds: **0/6** cache hits, consistent with isolated fixture namespaces.
- Identical same-key replay: **6/6** hits, with 98.10–99.03% cached input.
- Identical replay changing only the body key: **5/6** hits. Session headers
  stayed unchanged. Changing the body key is therefore not an absolute cache
  barrier on this subscription transport.
- Parent continuation: **6/6** hits, with 97.93–98.86% cached input.

Two later fork calls were cold despite their unchanged inherited prefix:
`1-shared-routing-B2` and `2-shared-key-A3`. This prevents a claim that shared
identity guarantees cache reuse. The backend's actual placement and routing
decisions were not visible.

All 60 calls returned HTTP 200, and 45 reported nonzero cache reads. All reported
cache-write counts were zero. This says what the subscription backend reported;
it does not mean no cache entries were created.

## Interpretation for ramify-agent

The earlier suggestion that a new body cache key necessarily separates the
parent's cache was too strong for this subscription path. The direct key-only
control disproves that categorical interpretation. Current forks can inherit
cache hits, and each child's subsequent turns can reuse its own cached prefix
while the other child also progresses.

The observation consistent across both repeats is better first-turn reuse when
the header pair and body key share the parent's provider identity. A potential
follow-up is a durable Pi-owned provider routing identity inherited across a
fork lineage, separate from harness session IDs. Preserve independent histories,
authority and task bindings. Merely overriding `prompt_cache_key` was insufficient
in this experiment.

This is a potential approach pending broader investigation, not an adopted
production contract. The sample is small, synthetic and serial. It does not
isolate `session-id` from `x-client-request-id`, prove backend routing causality,
or establish safety for concurrent calls or Pi's WebSocket connection cache.
Changing Pi's session ID can affect more than prompt caching; a production
implementation needs an explicit separation and its own acceptance evidence.
No statistical, monetary or latency improvement is claimed.

The official [prompt-cache documentation](https://developers.openai.com/api/docs/guides/prompt-caching)
describes prefix matching, model thresholds and routing limits. The experiment
measures the authenticated subscription backend directly; API documentation
alone does not establish its complete behavior. SDK dollar estimates were not
used as subscription charges; [Codex pricing](https://learn.chatgpt.com/docs/pricing#token-rates)
distinguishes credit billing and included subscription limits.

## Evidence and verification

Command from `ramify-agent/`:

```sh
node docs/spikes/pi-cache-reuse/run.mjs --output /home/app/ramify-pi-cache-evidence/2026-10-09-two-forks-02
node docs/spikes/pi-cache-reuse/run.mjs --verify /home/app/ramify-pi-cache-evidence/2026-10-09-two-forks-02
node docs/spikes/pi-cache-reuse/verify-wire.mjs /home/app/ramify-pi-cache-evidence/2026-10-09-two-forks-02
```

The successful run lasted approximately 140 seconds. Retained evidence:

- [Manifest and normalized observations](/home/app/ramify-pi-cache-evidence/2026-10-09-two-forks-02/summary.json).
- [All 60 request results](/home/app/ramify-pi-cache-evidence/2026-10-09-two-forks-02/results.md).
- [Request and fork verification](/home/app/ramify-pi-cache-evidence/2026-10-09-two-forks-02/verification.json).
- [Independent original SSE completion verification](/home/app/ramify-pi-cache-evidence/2026-10-09-two-forks-02/wire-verification.json).
- Archived `runner.mjs`, original fixture messages, native requests under
  `requests/`, and normalized responses, original completions and full SSE
  bodies under `responses/`. The manifest records the archived runner SHA256.

Both the runner's automatic verification and a separate later `--verify` pass
checked all 60 calls. Checks cover request hashes, original-versus-normalized
usage, key-only replay equality, inherited native instructions/tools/input and
reasoning/output settings, distinct logical child identities, shared checkpoint
equality and preserved child history with no sibling leakage. A separate
credential-free inspection compared all 60 original completion JSON artifacts
to their retained raw SSE completion events and verified the archived runner's
hash. No credentials or authorization headers were captured.

`node --check docs/spikes/pi-cache-reuse/run.mjs` passed. `npm run check:self`
passed with zero errors and warnings; all stages completed, with partial coverage
and 328 retained analysis limits. Its log is
[retained externally](/home/app/ramify-pi-cache-evidence/2026-10-09-two-forks-02/check-self.log).
This documentation-owned standalone spike changes no production modules or
configured automated-test discovery. No full audit or production live trial was
run for this spike.

## Retained failed attempt

The first attempt, which contained only the first two strategies, stopped after
16 completed calls on `1-shared-key-A2`: HTTP 200 followed by `TypeError:
terminated` after 5.114 seconds. The cause is undetermined. There was no provider
retry. Its successful partial observations, failed request, summary, failure
record and original runner remain in
[/home/app/ramify-pi-cache-evidence/2026-10-09-two-forks-01](/home/app/ramify-pi-cache-evidence/2026-10-09-two-forks-01/summary.json).
The fresh run used new namespaces and added the routing control. The counts and
tables above include only the complete 60-call run; the earlier successes are
not pooled with it.
