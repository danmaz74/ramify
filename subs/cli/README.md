# CLI

The CLI parses supported arguments, reaches the resident daemon through an injected connector or runs an injected batch operation, formats completed reports, streamed revisions and daemon status, and selects the documented process exit code. It contains no checking algorithm and keeps help, version and status independent of compiler and server startup.

This is the final owner responsibility. The current dispatch supports batch
checks, help and version; resident commands still require the missing providers.

`runCli(argv, environment, control?)` accepts output sinks, a working directory,
the package version and a `BatchOperation`. Root supplies the lazy real-session
binding and owns SIGINT and stream cleanup. The handler validates the complete
invocation before dispatch and checks stage completion before reporting success.
It preserves the analysis report in JSON and formats its diagnostics, warnings,
coverage and scope for humans. Pre-analysis invocation failures use the
`ramify.cli/1` envelope; analysis results retain `ramify.analysis/1`.

Human checks print `Mode: batch` immediately after `Configuration:`; JSON
reports contain no mode member. Both ordinary checks and `--batch` still use
the existing batch operation until the resident providers are available.

The private argument parser recognizes the planned `watch [--root <dir>]
[--format json]` and `daemon status|stop [--format json]` syntax, including
command-specific option and duplicate validation. Dispatch still rejects these
commands with `invalid-invocation` and exit 2 because the service connector,
daemon entry and quick environment are absent. Parsing these commands does not
establish resident availability. The connector integration, streamed documents,
recovery and fallback policy remain unimplemented.

The private error adapter translates the existing service and disconnect
vocabulary into CLI failures, retaining the source as the error cause. It maps
`stopping` to `stopped` and preserves other service codes. The command exception
boundary renders translated errors with their code while keeping unexpected
exceptions internal; cancellation and output failures retain precedence.
This adapter does not select recovery or fallback, and its tests supply no
resident service or lifecycle evidence.
