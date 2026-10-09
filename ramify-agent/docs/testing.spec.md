# Testing ramify-agent

Ordinary tests exercise real feature logic with small, meaningful examples.
Mock long or repeated external operations, including bulk filesystem persistence,
validation and history scans. Keep inexpensive file checks where the behavior
needs them. Performance benchmarks, exhaustive input sweeps and arbitrary large
case counts belong outside the ordinary suite; use a small counterexample for
each distinct behavior. Checks at a declared maximum use only the minimum input
needed to cross that boundary. Timing rules use controlled clocks or observable
ordering, rather than elapsed-speed expectations.

Workflow tests mock the disk-backed session store with a directory-scoped
in-memory adapter. It preserves detached JSON values, copied payload bytes,
atomic compare-and-swap and close/reopen state while real session operations and
workflow logic execute. The small session-store adapter tests explicitly unmock
their subject to verify actual bytes, corruption and recovery. Registered native
witnesses keep their actual tool/kernel boundaries.

Performance and exhaustive/scale probes use `*.stress.ts` and the separate,
opt-in `npm run test:stress` configuration. They are absent from ordinary and
full-audit discovery, rather than skipped cases in those runs.

Ordinary tests run real services, schemas, small files, ledgers and projections in
process. They never launch Git, Ramify, audit producers, shells or other external
commands, including during fixture setup and teardown. Supply explicit scripted
Git/candidate/provisional-source, command and provider answers. An unstated,
exhausted or unused required answer fails even if application code catches it.

The configured `node` and `web` projects install the root process guard before
test imports. It instruments Node's seven process-launch APIs, including ESM,
CommonJS, default exports, `vi.importActual` and promisified use. Attempts are
recorded before refusal and checked after user hooks and cleanup. Local helper
resets, module resets and reinstalling the root guard cannot erase file evidence.
Guard controls use independent recorders; ordinary scenarios have no opt-out.
Forwarding helpers retain Node's promisified `{ stdout, stderr }` result and
record local observations only for refused calls; native adapter errors retain
their original outcome.

Some claims require native Git objects, installed producer/CLI behavior or kernel
process/lock behavior. Their exact files, claims, owning cases and reasons live in
[src/tests/test-boundaries.json](../src/tests/test-boundaries.json). Only those
files enter the `boundaries` project. Split mixed files before registering them;
a filename, suffix or owner grants no exemption. The configuration rejects bad,
duplicate, missing, excluded or non-Node registrations using the installed
runner's original configured discovery. Existing fixture and scratch exclusions,
Node/JSDOM environments, React deduplication/inlining and machine-lock setup stay
in effect.

Run commands from `ramify-agent/`:

| Command | Selection |
| --- | --- |
| `npm run test:quick -- <exact file filters>` | Guarded ordinary Node and web tests |
| `npm run test:stress -- <exact file filters>` | Optional performance, scale and exhaustive probes, separate from audit discovery |
| `npm run test:boundaries -- <exact file filters>` | Exact registered native witnesses |
| `npm test -- <exact file filters>` | Complete configured projects, filtered for focused work |
| `node_modules/.bin/vitest list --filesOnly --json` | Authoritative configured file discovery |

The committed `agent-tests` audit check executes the complete configuration with
four workers. It never selects quick tests alone. For full qualification, start
from a clean committed candidate at the repository root and run:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

Do not run another direct whole suite where audit discipline applies. Skipped,
failed, missing and unrun checks retain their status. Existing opt-in fixture
trials retain their setup and optional skips; guarding introduces no new skips,
retries or timeout changes. An audit establishes configured execution health;
responsible architects assess semantic completion separately.

The root guard writes per-file native/refused API and argument observations into
`node_modules/.cache/ramify-agent-test-processes/<SHA256 of absolute cwd>/`.
Receipts include cwd, file, PID and time. Select the exact run's time window and
cwd when gathering them. These generated observations are verification evidence,
never production readiness or semantic authority. A passed ordinary file has
zero refused attempts; native observations retain API invocation traces. Node's `exec` delegates to
its exported `execFile`, so that command has two API observations; do not equate
raw observation counts with successful child-process counts.
