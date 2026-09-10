# CLI

The CLI parses supported arguments, invokes an injected batch operation, formats its completed report and selects the documented process exit code. It contains no checking algorithm and keeps help and version independent of compiler and server startup.

`runCli(argv, environment, control?)` accepts output sinks, a working directory,
the package version and a `BatchOperation`. Root supplies the lazy real-session
binding and owns SIGINT and stream cleanup. The handler validates the complete
invocation before dispatch and checks stage completion before reporting success.
It preserves the analysis report in JSON and formats its diagnostics, warnings,
coverage and scope for humans. Pre-analysis invocation failures use the
`ramify.cli/1` envelope; analysis results retain `ramify.analysis/1`.
