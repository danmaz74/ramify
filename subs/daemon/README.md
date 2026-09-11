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
stop, handshake, connection-state, disconnect-reason, endpoint and client-option
declarations. N1 exposes the two real ports, N2 exposes discovery and record
reads, and N4 exposes only existing types. Root R7 relays the implemented
discovery and client-option types. The contexts vocabulary and controlled ports
remain relayed through N5.

`selectEndpoint` selects the private endpoint directory and hashes the real
package path, version, package.json and sorted production runtime bytes without
importing them. It requires the daemon entry, declared runtime package entries
and an owner runtime tree, so the present build without `daemon-entry.js` cannot
select a resident endpoint. Tests provide an independent fake build. Missing
files, unsafe directory permissions and paths exceeding 100 socket bytes fail
explicitly. File hashing establishes the selected bytes, while dependency
completeness is the production build's responsibility.

`readDaemonRecord` validates the complete record, including its selected group,
socket and stop disposition. The private writer uses a 0600 temporary file and
same-directory rename. Reads recheck directory permissions, reject symlinks and
non-regular files, bound input to 64 KiB, and reject malformed UTF-8 or JSON.
Missing records return null; invalid records are errors.

The private `launchDaemon` coordinates one start attempt with an exclusive lock,
detached child and bounded readiness wait. It passes the reviewed endpoint,
build, version and engine arguments, redirects output to a private log and
releases its descriptors. Stale cleanup requires a proven dead pid; a live pid
with a refused socket remains unavailable. Concurrent stale-lock reclamation
uses a temporary exclusive `.lock.reclaim` guard. An interrupted guard is left
intact and fails closed until explicitly inspected and removed; age alone never
authorizes removal. Cancellation does not kill a shared child: before readiness
the lock names that child so another caller cannot spawn a duplicate. A later
running record is usable even while that lock exists, and the lock becomes
reclaimable after the child dies. The future connector owns attempt counts,
handshake, recovery authorization and service requests. Fake-entry tests prove
only this private launcher's behavior, with no IPC or process matrix credit.

The private request validator checks every operation's parameter shape,
including token identifiers, freshness variants, printable request IDs and
bounded content expectations. It rejects unknown properties and non-data
objects, and permits arbitrary string registry/capability names structurally:
the future service must return unsupported setups as domain outcomes. Root's
R6 exposure currently provides only the five independent service operation,
capability, error and result declarations that this validator consumes.

Iteration 3's increment and project-resolution operations and iteration 4's
context manager are still absent. The shared service, complete root interface and
assembly, WireMessage schema, complete connection vocabulary and quick environment therefore
remain unimplemented. No `daemon-service` harness capability is registered.

The private byte-framing portion of `codec.ts` is implemented independently of
those providers. It writes a four-byte big-endian UTF-8 JSON length and payload,
decodes exact frames, and assembles fragmented or concatenated frames with at
most one bounded pending body. Zero/oversized lengths fail on the completed
header before body allocation. Malformed UTF-8 or JSON, extra frame bytes and
truncated streams fail explicitly. Decoder disposal drops the pending body and
listener; a parse or listener error closes the decoder. Decoded values remain
`unknown`: JSON syntax is not a WireMessage schema check. The future message
wrappers must perform that validation, and the socket owner must send failure
goodbye and close when decoding throws. No N2 codec exposure or client entry is
activated by these private helpers.
