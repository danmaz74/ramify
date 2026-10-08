# Optimization 13: automatic ordinary test boundaries

**Status:** focused qualification passed; full nested premerge audit and integration
remain required. Core source `d8b1ab957f139fb55d4aec0343bd29e715cee095`; tree `bb3ece2559027e758d8a3a12f43b87a0013cac05`; base
`9be12ee55385490e9db45f923b7b9f517d3a27d7`.

Root testing owns automatic builtin instrumentation and the immutable persistent
recorder. Ordinary Node and web setup runs before imports and wraps user hooks
and cleanup. All seven spawning APIs, both builtin spellings, CJS, ESM,
promisified calls and importActual are refused before native invocation. Caught
errors, local reset, module reset and root reinstall cannot erase evidence.
Published state is frozen and takes no caller-supplied file/native permission.
Guard controls use isolated recorders. The old harness helper forwards through
root declared testing exposure, and the decoder's separate hoisted guard is
retired. Root/harness exposure and signature-companion checks pass.

The registry selects 43 exact native files with claims, reasons and owning case
titles. Configuration validates these against public installed Vitest discovery
and closes all owned discovery servers; discovery starts no workers or test
setup. Configured node/web/boundaries discovery is disjoint and complete:
217 + 17 + 43 = 277 files. Public case collection has 2,083 cases, retaining every
2,051 predecessor identity and adding 32 controls. The conditional optional
fixture-trials file remains registered with its existing two case titles and
skip provenance; it is absent from ordinary case collection under this setup.
No pin, audit selection, skip/retry or existing timeout policy changed.

Focused qualification passed 167 tests in 16 files, zero skips: 32 root guard /
actual-runner controls and 135 representative acceptance, dependency, recovery,
hook, readiness, shell, settlement, single-session, evidence, composition and
web cases. Four TypeScript scopes pass; self-check has zero errors/warnings and
313 existing analysis limits. Receipts record 15 ordinary files with zero
allowed or refused launches. The actual runner driver launched 33 Vitest
children. Its deliberate failing ordinary children retain refused attempts and
zero allowed launches; reused-worker native controls execute actual Node twice
per native file. Both execution orders are proven in one PID sharing cached
CJS and promisified exports. All 38 observed parent/control worker PIDs were
absent after completion; both owned discovery daemons were stopped and absent.

Commands and individual file durations, exact discovery/case inventories,
source hashes, native rationales, process observations and retained authoring
failures are in [the evidence](13-automatic-boundaries-evidence.json). Raw
reports are `/tmp/plan22-opt13-final-focused.json`,
`/tmp/plan22-opt13-final-types.log`, `/tmp/plan22-opt13-final-self.log`, and
`/tmp/plan22-opt13-final-{files,node,web,boundaries,cases}.json`.

The gain here is selecting guarded ordinary tests separately from genuine
installed-tool/kernel witnesses. Full-suite timing remains dominated by the
actual Plan 21 workflows; no controlled aggregate speedup is claimed.

MAIN advanced to runtime commit `b23db328` after the fresh worktree was created.
That committed advance must be adopted and requalified before the coordinator's
released full nested audit. Full qualification, safe integration and final case
reconciliation/architect preservation assessment remain outstanding.
