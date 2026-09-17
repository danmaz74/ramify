# Service API

Projects retained analysis reports into the bounded project-explorer service model
and hosts a resident, token-free local web server for one project: its
three tRPC procedures read the project binding for each request. The binding opens one project's resident context through an
injected daemon connector, subscribes to it and keeps it current across
evictions, daemon failures and explicit stops. The owner does not scan files
or run an analyzer.
