# Iteration 0 probes: pi and session lifecycle

Throwaway probes for
[Plan 3, iteration 0](../../docs/plans/03-autonomous-implementation-loop/iterations/iteration0.md).
They live outside every module, outside the compiler's scope and outside the
Vitest selection, and nothing imports them. Their findings are recorded in
[iteration0-results.md](../../docs/plans/03-autonomous-implementation-loop/iterations/iteration0-results.md);
the port contract this plan implements is there, not here.

Run them from `ramify-agent/`:

```sh
node_modules/.bin/tsx spikes/autonomous-loop/run-all.ts          # the table and its evidence
node_modules/.bin/tsx spikes/autonomous-loop/run-all.ts --json   # the same as JSON
node_modules/.bin/tsx spikes/autonomous-loop/probes/p02-continue-after-terminate.ts
```

No probe reaches a network and none needs a pi login. Each runs a real pi
session — its real agent loop, tool validation, built-in tools, events, abort,
compaction and session file — over
[a scripted provider](lib/scripted-provider.ts) in a temporary directory, so
only the model's replies are invented. Probes 1 and 13 start a second process.

Each probe returns one verdict: `verified`, `verified-with-limitation` with the
limitation, or `unavailable` with what was searched for. A probe reports; it
never asserts.

| File | Probes |
| --- | --- |
| [p01-continue-session.ts](probes/p01-continue-session.ts) | 1 |
| [p02-continue-after-terminate.ts](probes/p02-continue-after-terminate.ts) | 2 |
| [p03-fork.ts](probes/p03-fork.ts) | 3 |
| [p04-append.ts](probes/p04-append.ts) | 4, 5 |
| [p06-context.ts](probes/p06-context.ts) | 6 |
| [p07-compaction.ts](probes/p07-compaction.ts) | 7, 8 |
| [p09-final-response.ts](probes/p09-final-response.ts) | 9 |
| [p10-guard.ts](probes/p10-guard.ts) | 10, 11 |
| [p12-cancellation.ts](probes/p12-cancellation.ts) | 12 |
| [p13-restart.ts](probes/p13-restart.ts) | 13 |
| [p14-no-shell.ts](probes/p14-no-shell.ts) | 14 |
| [p15-events.ts](probes/p15-events.ts) | 15 |
| [p16-invalid-input.ts](probes/p16-invalid-input.ts) | 16 |

[lib/scripted-provider.ts](lib/scripted-provider.ts) is copied from the pi
module's own test helper, with a model whose `contextWindow` the probe chooses
so that compaction thresholds are reachable cheaply.
[lib/probe.ts](lib/probe.ts) builds a pi session the way the real adapter does:
the spec's system prompt replaces pi's, discovery of context files, extensions,
skills, prompt templates and themes is off, and the tool allowlist is explicit.
