# Shared provider identity adoption

The Pi adapter now persists `providerSessionId` in its opaque transcript and
passes it as the provider stream's `sessionId`. Installed Pi emits that value in
`session-id`, `x-client-request-id` and `prompt_cache_key`. The SDK agent retains
the independent logical session ID. The final request fence refuses cache-key
rewrites by extensions.

Fork copying, continuation, retry and restoration retain this provider identity.
For legacy transcripts without the field, and forks before any provider request,
the adapter resolves the original creation operation's session ID through the
existing session-operation API. This works through multiple zero-turn forks
without consulting mutable parent sessions. Unrelated roots remain distinct.

## Live production adapter evidence

Successful evidence:
`/home/app/ramify-pi-cache-evidence/2026-10-09-production-adapter-02`.
The runner archives the exact production source and its own bytes with SHA256
hashes. The witness uses Pi-owned subscription/OAuth authentication, installed
Pi 0.87.1, `openai-codex/gpt-5.6-sol:medium`, SSE, no background warming or
provider retries, and the production durable session store.

| Request | Input tokens | Original cached tokens | Cached input |
| --- | ---: | ---: | ---: |
| Parent 1 | 11,008 | 0 | 0% |
| Fork 1 A, first and only turn | 11,138 | 10,880 | 97.68% |
| Fork 1 B, first and only turn | 11,140 | 11,008 | 98.82% |
| Parent 2 | 10,989 | 0 | 0% |
| Fork 2 A, first and only turn | 11,122 | 10,880 | 97.82% |
| Fork 2 B, first and only turn | 11,125 | 10,880 | 97.80% |

All four first-turn forks reused cache. Both sibling pairs overlapped at HTTP:
4,765 ms and 2,179 ms, with dispatch gaps of 0 ms and 1 ms. All six requests
completed with HTTP 200 and distinct original response IDs. All six submissions
contained their own expected label, private marker and inherited revision.
Logical fork IDs were distinct, parent snapshots stayed unchanged, and each
fork request preserved the parent's complete native prefix, including the
terminal submission output.

The separate offline pass compares original SSE completions, original
`cached_tokens`, normalized Pi counters, actual emitted headers/key, submitted
values, archived source hashes and dispatch overlap. Both live and offline
verification passed. This is a six-call adoption witness; the preceding
[serial](results.md) and [concurrent](concurrent-results.md) spikes supply the
comparison with separate provider identities. Provider cache hits remain
backend dependent.

The failed first attempt remains at
`/home/app/ramify-pi-cache-evidence/2026-10-09-production-adapter-01` and is
excluded from the successful witness. Its fixture instructed submission
"exactly once" across inherited history. Both children hit cache but correctly
declined another submission. The corrected fixture specifies once per current
task. No production change or automatic retry was involved in this correction.

## Implementation checks

From `ramify-agent/`:

- `node_modules/.bin/vitest run --project node subs/harness/subs/agent/subs/pi/src/tests --maxWorkers 4`: 13 files, 110 tests passed. Covers header/key inheritance, independent roots, nested zero-turn forks, legacy transcripts, malformed identities, final-hook refusal and existing preservation/recovery behavior.
- `node_modules/.bin/vitest run --project boundaries subs/harness/subs/agent/subs/pi/src/tests/plan23-transport.boundary.test.ts --maxWorkers 1`: 4 tests passed. Actual HTTP SSE headers/key and production ledger restoration in a new process were checked, alongside existing Stop/inactive-tool controls.
- `npm run type-check`: passed all four configured compiler scopes.
- `npm run check:self`: passed, 0 errors, 0 warnings; existing partial coverage with 328 analysis limits.
- `git diff --check`: passed.

The isolated committed audit candidate is `729033c0` on
`codex/pi-shared-provider-identity`, at
`/home/app/ramify-pi-shared-provider-identity`. It contains only the six Pi
implementation/documentation/test files. Main-checkout implementation bytes
match that candidate; unrelated user edits remain outside it.

The configured full nested audit passed on that candidate:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

All six checks, the invocation verdict and the nested composition verdict passed.
Vitest reported 2,760 passed and 2 existing opt-in tests skipped, in 310 passed
files and 1 skipped file. All 311 configured files were accounted for, with none
missing. The configured Cucumber profile selected 0 scenarios; this establishes
no scenario execution. Type checks, structural check, patch integrity and the
web build passed. The audit took 912.986 seconds; the regression suite took
869.842 seconds. No additional retries or skips were introduced.

Audit run: `d066e636-cbdd-41ec-9434-d7329d1ddef7`. Report commit:
`5e7495c5c10ff01912b105bc8dfa6e5cd65c2083`. Durable ref:
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-09T09-24-29Z-729033c09`.
Raw audit output is `audit.json` and `audit.stderr` in the successful live evidence
directory; `implementation-checks.json` contains the concise receipt.
Live captures establish provider behavior; the audit separately establishes
configured check health.
