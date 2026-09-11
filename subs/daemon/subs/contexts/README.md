# Contexts

Contexts keeps each selected project root isolated as a context with its own generation, orders its updates and requests into one queue, publishes immutable revisions atomically, and bounds history, retained products, leases and idle lifetime. It drives analysis through a neutral port and never reads project files or transport objects itself.

`createContextManager` implements the reviewed isolation, acknowledgment order,
publication, watcher reconciliation and retention contracts. Each client's
opening request is retained per lease, so sharing a canonical context preserves
its invocation facts and capability order. Synchronized checks run a fresh
capture after acknowledgment. Published reads can select an exact retained
revision; incomplete results are delivered without replacing a publication.

Warm contexts periodically verify inputs even when watcher events are missing.
Unleased contexts become cold, release watchers and retained analysis products,
and eventually expire. Count and byte budgets evict eligible history before
returning resource unavailability. A request to a cold context reattaches its
watcher and reconciles conservatively. Disposal cancels requests and releases
all handles, products and reports.

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
The manager owns publication eligibility, revision metadata, historical
last-valid headers and retained analysis product accounting.
