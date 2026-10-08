# Automatic guard investigation handoff

**Status:** historical considerations below; automatic enforcement implemented in optimization 13, pending full audit and integration.
These notes add no runner exemption or settled implementation choice.

The migrated acceptance files currently install
`subs/harness/src/tests/helpers/process-guard.ts` through a per-file
`vi.mock('node:child_process')` factory. That helper has a local resettable
recorder. Automatic enforcement must continue observing these refusals when
the test's own factory replaces a setup-file mock; a private persistent
recorder must survive its local reset. The existing helper needs compatibility
work rather than another independent recorder that misses those calls.

Investigate builtin instrumentation and/or explicit forwarding from this
existing helper to the project testing owner. Any foreign helper access needs
the project's `expose-test` declaration and testing API discovery. Keep guard
implementation and state out of production harness services. A fully scripted
port that creates no process remains a valid ordinary fixture.

Validate ordinary and actual-boundary files in the same Vitest invocation,
including both execution orders. A cached external module may capture a
process function while ordinary enforcement is active; that captured function
must not accidentally refuse an explicitly selected later boundary witness.
Conversely, a boundary file must not disable enforcement in the next ordinary
file. Test lifetime, shared worker state and setup ordering explicitly within
the configured runner's actual behavior.

Runner sentinel controls must prove refusals for named, default, promisified
and CommonJS builtin access, module setup, teardown and caught errors, including
the existing helper's reset. Sentinels are ordinary files launched by the
explicit boundary driver; they never execute real Git. Preserve global attempt
evidence even if application code converts the thrown error to unavailable.

Outer audit Git, test discovery and Vitest worker creation are infrastructure
outside ordinary test execution. They do not justify an opt-out available to
ordinary tests. The committed complete audit still discovers and executes the
union of ordinary and explicitly registered actual-boundary files.

## Delivered investigation

The installed Vitest 4.1.11 experiments demonstrated that native builtin
instrumentation followed by `syncBuiltinESMExports` reaches named/default,
promisified, both CommonJS spellings and `vi.importActual` routes. The builtin
wrappers retain private state across module resets and reused workers. Root
setup derives permission from actual testPath and the exact registry. Reinstall
of the current file preserves attempts; switching files cannot drop unfinalized
refusals. Root `aroundAll` wraps user setup, cleanup and teardown, and preserves
both an original thrown error and an enforcement error.

Actual child runners proved both ordinary/native orders with isolate:false in
one PID, sharing cached CommonJS and promisified exports. Native controls return
actual Node stdout; ordinary attempts fail the file despite catches and never
write the process-side marker. The retained harness compatibility recorder may
reset its local observations only; root enforcement remains independent. The
decoder's cloned hoisted recorder has been replaced by root forwarding.

Config validation asks the public installed `createVitest` /
`globTestSpecifications` for original include/exclude discovery, then closes all
owned projects/servers before returning configuration. It starts no workers or
test setup. Exact registration errors fail configuration; the aggregate audit
check remains unchanged. Per-file command observations are generated under the
installed package cache without changing guard permission.

Forwarding qualification also proves both worker orders through cached root and
harness adapters. Promisified exec/execFile retain stdout and stderr; native
ENOENT keeps its outcome and contributes no refused local observation. Local
recorder resets do not erase root enforcement. The committed MAIN fixture-trial
advance b23db328 was adopted before final qualification, preserving its ten
changed files verbatim.
