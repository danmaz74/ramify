# Iteration 2 installed-provider consumer evidence

`native-readiness.json` is the raw result of the focused `runReadiness` test using the
installed `ramify-audit@0.7.1` public service through the harness audit child.
It retains the committed configuration blob, requested and audited source
commits, fresh and reused full results, report commits, run refs, and the
working-tree output recreation assertion. The temporary Git project is
removed after the test; this artifact preserves its exact result. This check
uses a configured command with `parser: none`; it witnesses native full
readiness and preparation order, not Vitest discovery.

`f2.bundle` preserves the separate configured Vitest discovery project and
published reports. `f2-full.json` is the fresh full baseline at
`34beebf9b477ad1a02f1f1e551b33d9da8a72b7b`; `f2-partial.json` is the
normal partial successor at `c93c956874af67329a275337a8f4b23c39b3eb86`.
Both are direct installed CLI producer results, not harness readiness results.
The source runner includes custom `*.check.ts` filenames and excludes the
deliberately failing default `src/tests/excluded.test.ts`. The partial result
records configured expected/run files as 3/3 complete, executes a custom
`src/tests/new-root.check.ts`, omits the excluded file, and composes a scoped
pass over the full baseline. The child consumer test reads the committed
definition from this bundle and checks these producer identities and recovery
qualification.

Replay F2 by cloning `f2.bundle`, checking out the named source, installing
its locked dependencies with `npm ci --ignore-scripts`, and running the
installed `ramify-audit audit --cwd . --full --json` for the baseline or
`ramify-audit audit --cwd . --json` for the successor. Existing published
results may be reused unless the bundle's audit refs are omitted in a fresh
clone; the JSON files contain the original fresh responses.
