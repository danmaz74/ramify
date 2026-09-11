# Daemon

Daemon owns the resident process: the validated in-process service that implements the root's service interface over its contexts child, the local socket host and its discovery records, the lightweight client that other processes use to reach it, the wire codec, and the real filesystem watcher and clock ports.

The filesystem watcher and system clock are implemented. The watcher attaches
one native handle per directory, skipping `node_modules`, `.git`, `dist` and
`.reference-work` at every depth and never descending through symlinks. It
refreshes directory handles after rename or unknown-path notifications, including
replacement of a directory at the same path. Events carry root-relative paths;
native rename notifications remain `renamed`, without guessing create/delete.
Unknown paths and queue overflow emit `overflow` at the empty root-relative
path; watcher failures emit `error` there (native resource exhaustion also emits
`overflow`). Batches are frozen, deduplicated and delivered within a 100 ms
window, bounded to 10,000 distinct paths plus conservative signals. Closing a
watch cancels pending delivery, waits for scans and native handle closure, and
removes listeners. No event guarantees that disk inputs are current; synchronized
and periodic captures remain the context manager's responsibility.

The clock uses wall-clock timestamps and cancellable timers. Long waits are
split into supported native timer durations instead of overflowing Node's
32-bit timeout. Callers own each cancellation function.

`interfaces/daemon.ts` contains the independent instance, log, budget, record,
stop, handshake and connection-state declarations. N1 exposes the two real
ports and N4 exposes only those existing types. The contexts vocabulary and
controlled ports remain relayed through N5.

Iteration 3's increment and project-resolution operations and iteration 4's
context manager are still absent. The shared service, root interface and
assembly, codec, complete connection vocabulary and quick environment therefore
remain unimplemented. No `daemon-service` harness capability is registered.
