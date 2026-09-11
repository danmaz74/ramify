# CLI

The CLI parses supported arguments, reaches the resident daemon through an injected connector or runs an injected batch operation, formats completed reports, streamed revisions and daemon status, and selects the documented process exit code. It contains no checking algorithm and keeps help, version and status independent of compiler and server startup.

`runCli(argv, environment, control?)` accepts output sinks, a working directory,
the package version, a service connector and a `BatchOperation`. Root supplies
the real connector and lazy batch binding, and owns SIGINT and stream cleanup.
The handler validates the complete invocation before dispatch and checks stage
completion before reporting success. Pre-analysis invocation failures use
`ramify.cli/1`; check results retain the bare `ramify.analysis/1` document.

An ordinary `check` opens a context and requests synchronized freshness. Its
human `Mode:` line identifies the daemon, context and revision, or explicitly
says no context when resolution fails. `--batch` uses an independent disposable
session. A check falls back to batch only after unexpected daemon failure has
exhausted recovery; the fallback is visible on stdout in human mode and stderr
in JSON mode. Explicit stop, incompatible peers and rejected requests retain
their errors. Neither watch nor the client entry falls back.

`watch` subscribes to context events and fetches each reported revision by its
exact id. JSON output is one `ramify.watch/1` object per line; an evicted report
has an explicit `revision-evicted` line. A bounded queue coalesces replaceable
updates. Recovery resubscribes once after unexpected loss, and context eviction
allows one reopen. SIGINT releases the subscription and exits 130.

`daemon status` and `daemon stop` use discovery without startup. Status exposes
the actual instance, contexts, budgets and counters. Stop names the observed
instance and waits for that process to exit; absent daemons make both commands
succeed without launching anything.

The error adapter preserves service and disconnect codes and causes. The
command exception boundary renders those failures while cancellation and
output failures retain precedence. Root serializes publication writes and
bounds queued stdout bytes so streamed documents cannot interleave or grow
without a limit.
