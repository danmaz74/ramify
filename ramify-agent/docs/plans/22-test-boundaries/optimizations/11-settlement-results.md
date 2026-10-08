# Optimization 11: settlement, shell and session boundaries

Implementation `325c233bba6cd8e0d1f5ea2990f88b871c8a05ad` on `perf/plan22-settlement`, based on main
`7eda41ad266a0f0c9a0d14b528c231620b515caa`. Integration now targets `/ramify` on `ramify-agent`;
this cut did not modify main or copy its unfinished work.

All 30 original cases remain once: 21 ordinary and nine actual boundary
cases. All 200 original case assertion calls are preserved. The ordinary
settlement runs use real files, RunService, ledger and project locks with
explicit external facts; no fixture initializes Git. The shell schema correction
injects one exact command with a declared real marker-file effect. Session
ownership, topology and completion source paths are literal fixture inputs,
independent of files on disk. Unknown operations, exhausted responses,
unconsumed required answers and caught errors fail completion.

The three detached-group cases, five shell executor cases and PB3-S04 actual
shell-write case retain their native evidence in exact dedicated files.
Eight native registrations are byte-identical. PB3-S04 retains every original
assertion and its inner actual `execFile` callback, while its fixture arguments
add independently stated command inputs and an explicit unavailable changed
hook reply. Previously that latter call exceeded the supplied script: its
assertion error was swallowed as unavailable. The new reply preserves the
protected-file/write-scope/zero-commit outcomes and closes this fixture gap;
the complete PB3-S04 registration is **not** byte-identical.

Detached groups are registered for cleanup immediately on spawn and killed
with bounded absence verification, including failures. Cleanup loops collect
errors so one failure cannot prevent remaining cleanup or process-attempt
verification. The existing actual shell output, timeout, descendant and
settlement assertions remain. API discovery used a private endpoint, stopped
and removed after the supported stop invocation; no shared daemon was stopped.

Verification from the package directory:

- Focused eight-file selection: **53 passed, zero failed/skipped**, including
  all original cases, 12 strict negative/positive controls and all 11
  composition cases. File-local guards verify **zero ordinary launch attempts**.
- `npm run type-check`: all four compiler scopes passed.
- `npm run check:self`: zero errors/warnings; 313 existing analysis limits.
- Configured Vitest discovery: 271 files, 254 Node and 17 web; complete file
  listing, including conditional files, rather than a cases-only inventory.
- Full nested released audit: **unrun and required before merge**, owned by
  the coordinator. This receipt does not declare Plan 22 complete.

The original baseline passed 30 cases: shell 1.228 s, session 1.718 s,
settlement 1.002 s. A passing converted run reported ordinary shell 0.025 s,
session 1.350 s and settlement 0.635 s; native witnesses retained 1.221 s,
0.333 s and 0.204 s respectively. Final qualification overlapped compiler/module
checks and took ordinary 0.036 s, 1.966 s and 0.938 s. These shared-host results
are observations, not a controlled aggregate speedup. The key verified change
is that the ordinary files launch no external commands.

Authoring failures remain recorded in the evidence: overly narrow ownership
and completion path declarations, omitted captured audit/measurement/
materialization replies, an incorrectly required pre-readiness branch, the
old PB3-S04 swallowed assertion gap and one initial helper return type error.
Discovery cleanup initially used an unsupported `--root` argument; the
supported stop command then succeeded and resource verification found no
owned daemon/compiler. Historical Plan 21 receipts were not rewritten; no
current source metadata referred to the moved native registrations.

[Evidence, original case mappings and command provenance](11-settlement-evidence.json)
contains source hashes, native registration hashes, all configured files,
individual results, retained failures, resource observations and the pending
audit gate. Automated health and assertion preservation remain separate from
the responsible architect's assessment of semantic preservation.
