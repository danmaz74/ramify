# Contexts

Contexts keeps each selected project root isolated as a context with its own generation, orders its updates and requests into one queue, publishes immutable revisions atomically, and bounds compact history, sessions, leases and idle lifetime. It drives one retained analysis session through a neutral port, answers a request from the published revision when that revision already covers the identities it names, and never reads project files or transport objects itself.

`createContextManager` preserves each opening lease's invocation and capability
order. Covered delta requests reuse a coherent publication when no influencing
change or sweep is pending. Other synchronized requests flush the queue; an
empty expectation requires a sweep started after acknowledgment. A synchronized
request that names a configuration path is answered at once as unavailable for
that reason, and the update its paths queued still runs, so the next request
waits for that revision. Unobserved and superseded identities cannot produce a
passing check. Request deadlines return cold or deadline-exceeded outcomes while
the session continues updating.

History retains revision headers, diagnostics, warnings, coverage and finding
deltas. Reports are projected from the session's immutable facts by exact
sequence only when requested. A request pins its retained baseline while it
waits. History eviction releases the corresponding worker version. Byte budgets
include the compact history and the session's facts; oversized candidates fail
explicitly. Intermediate session versions without a published header are released.

Watcher changes drive updates independently of requests. Required and periodic
sweeps reconcile observed inputs, and an idle audit verifies each revision at
most once. Compiler budgets and inactivity demote hot sessions to warm. Cold
disposal retains a detached current report within the history budget, releases
the session and watcher, and eventually expires the generation. New activity
reopens the session; disposal releases requests, timers and all owned resources.

The controlled clock's `advance(milliseconds)` runs due callbacks synchronously
in deadline order, using scheduling order for ties. Tests await asynchronous
operations separately. The controlled watcher delivers supplied batches to
matching roots and supports a one-shot attachment failure. Neither control
opens an OS timer or file watcher; both expose live resource counts for cleanup
assertions.

An API-view request names the views it needs; without `views` it is the API
view alone. At the pinned sequence the manager calls the session's `apiView`
and `architectView` only for requested views, and either one's supersession
makes the whole outcome superseded. `dependencyFacts` answers from the same
analyzer jobs and retained result as `dependencyDiagram` and adds the test
references retained with the diagram; `dependencyDiagram` is that answer
without them. The references count against the retention budgets; when only
they exceed one, the diagram is retained without them.
