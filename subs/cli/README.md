# CLI

The CLI parses supported arguments, reaches the resident daemon through an injected connector or runs an injected batch operation, formats completed reports, revision deltas for the files a caller names, streamed revisions and daemon status, and selects the documented process exit code. It contains no checking algorithm and keeps help, version and status independent of compiler and server startup. Its affected command prints module test selections from the resident service or a fresh batch session.

`runCli(argv, environment, control?)` accepts output sinks, a working directory,
the package version, a service connector, a `BatchOperation`, for
`affected --batch` an `AffectedBatchOperation`, and an optional Git command port.
Root supplies the real connector and batch bindings, lazy in the Node entry and a
Node child in the compiled client, and the production Git port, and owns SIGINT
and stream cleanup.
The handler validates the complete invocation before dispatch and checks stage
completion before reporting success. Pre-analysis invocation failures use
`ramify.cli/1`; plain check results retain the bare `ramify.analysis/2` document.

`check --changed <path>...` names each path relative to the selected root and
requests a compact delta with synchronized freshness, a two-second default
deadline and an optional `--since` revision. It cannot classify paths itself:
the daemon's `classification-changed` answer says which paths are analyzed, and
the command hashes those, a missing file as an absent identity, and asks again
within the remaining deadline, retrying a stale classification once. JSON output
is one `ramify.check/2` document with each path's disposition; human output marks
new findings, prints one `Path` line per named path, `checked`, `not analyzed`
or `not checked` with its reason, module and exclusion, then an `Outcome` line
with those counts, the checked set and the wait. Only a checked path reads as
checked. Findings anywhere in the project fail the check; a path
not analyzed changes nothing. Cold, overdue, unobserved, superseded,
configuration-named, unclassifiable and unavailable checks, and checks with a path
not checked, exit 2 explicitly. This command never calls the batch
operation, including after exhausted recovery.

The three `check` forms have distinct roles: `--changed` is the bounded hook
check, plain `check` the complete check and `--batch` the independent complete
check. A post-write hook treats exit 2 from `--changed` as not verified; a later
complete check gives configuration edits their verdict. The `--deadline` wait
never delays a configuration reply. See
[hook and complete checks](../../docs/architecture/cli-invocation.spec.md#hook-and-complete-checks).

An ordinary `check` opens a context and requests synchronized freshness. Its
human `Mode:` line identifies the daemon, context and revision, or explicitly
says no context when resolution fails. `--batch` uses an independent disposable
session. A check falls back to batch only after unexpected daemon failure has
exhausted recovery; the fallback is visible on stdout in human mode and stderr
in JSON mode. Explicit stop, incompatible peers and rejected requests retain
their errors. Neither watch nor the client entry falls back.

`affected` prints one line per path seed saying whether it is owned, with its
module, basis and any owned-ignored or scratch exclusion, excluded, with its
exclusion, or outside the project.

A complete check, resident, batch or fallback, inside a Git repository adds one
nonblocking `ignored-but-walked` warning for each directory Git ignores beneath
the selected root that Ramify still walks, in the human report and in the JSON
report's warnings and summary count. The command takes Git's NUL-terminated
list from the injected port and classifies each directory by the report's
ownership facts and the canonical reserved segments; excluded directories, their
descendants and entries outside the root give none. No port, no repository,
missing Git or a failed Git command give no advice and print nothing; the advice
never changes the outcome, findings or exit code. `--changed`, `watch` and
`affected` ask Git nothing.

`--no-snapshot` prints a complete check's JSON report with `snapshot: null` and
every other member unchanged. The batch operation receives it and drops the
snapshot before returning; a resident report drops it when printed. It requires
`--format json` and is rejected with `--changed`.

`watch` subscribes to context events and fetches each reported revision by its
exact id. JSON output is one `ramify.watch/2` object per line; an evicted report
has an explicit `revision-evicted` line. A bounded queue coalesces replaceable
updates. Recovery resubscribes once after unexpected loss, and context eviction
allows one reopen. SIGINT releases the subscription and exits 130.

`daemon status` and `daemon stop` use discovery without startup. Status exposes
the actual instance, contexts, budgets and counters; each context status, here
and in `ramify.watch/2` status lines, carries its watcher's registrations. Stop names the observed
instance and waits for that process to exit; absent daemons make both commands
succeed without launching anything.

The error adapter preserves service and disconnect codes and causes. The
command exception boundary renders those failures while cancellation and
output failures retain precedence. Root serializes publication writes and
bounds queued stdout bytes so streamed documents cannot interleave or grow
without a limit.

`materialize [--view <api|architect>]... [--from <path> | --all] [--root <dir>]`
refreshes generated views through the daemon and never falls back to batch.
Without `--view` it is Plan 2A's API-view request and output. `--view` may
repeat, once per view; unknown or duplicate values, and `--from` or `--all`
without `api`, exit 2 before connecting. With `--view`, a daemon whose welcome
lacks `materialize-views` gives `incompatible-service`, exit 2. A published
architect view adds the line
`Architect view: .ramify-architect, <modules> modules, <records> records, dependencies <measured|unavailable (<reason>)>`.

`measure [--root <dir>] [--format json]` requires the daemon's advertised
`measure` capability and requests one synchronized whole-project document. JSON
output is the returned bounded `ramify.measure/2` value exactly. Human output
is a compact two-row-per-module table for exact and subtree production, tests,
documentation and view buckets. The command adds no selectors or filesystem
attribution logic, writes no generated files, never invokes batch analysis and
never prints a partial measurement after an unavailable or resource-refused
outcome.
