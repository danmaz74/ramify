# Automatic guard investigation handoff

**Status:** implementation considerations for iteration 6, pending experiments.
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
