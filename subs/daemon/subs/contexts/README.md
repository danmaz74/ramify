# Contexts

Contexts keeps each selected project root isolated as a context with its own generation, orders its updates and requests into one queue, publishes immutable revisions atomically, and bounds history, retained products, leases and idle lifetime. It drives analysis through a neutral port and never reads project files or transport objects itself.

The current implementation contains identity and fingerprint primitives,
controlled watcher and clock ports, and report history storage. The manager,
queue, publication, global retention and idle behavior are not implemented:
they require the analysis and project provider
contracts assigned to Plan 2 iteration 3. The interface and parent exposure
contain only the implemented subset; this does not activate the harness's
`contexts` capability.

The controlled clock's `advance(milliseconds)` runs due callbacks synchronously
in deadline order, using scheduling order for ties. Tests await asynchronous
operations separately. `pending` counts scheduled callbacks. The controlled
watcher delivers supplied batches to matching roots, supports a one-shot
attachment failure through `failNextWatch`, and reports live handles through
`active` and `roots`. Handles close idempotently, and disposing either control
releases all its callbacks. Neither control opens an OS timer or file watcher.

The private history store keeps reports by exact revision identity, accounts
their serialized UTF-8 bytes, and removes oldest reports to meet count and byte
bounds. An oversized candidate leaves existing history intact. Explicit pressure
removal keeps the current publication; cold retention drops every past report.
The manager will own publication eligibility, revision metadata, last-valid
status and retained analysis product accounting when those contracts exist.
