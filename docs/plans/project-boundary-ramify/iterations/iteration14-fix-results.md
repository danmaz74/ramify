# Iteration 14 fix results: the I1-28 relocated A7-11 mismatch

**Date:** 2026-10-04. **Status:** receipt for a gate-failure diagnosis assigned
by the coordinator after the iteration 14 gate on `376f4539`, where
`I1-28:relocated-package` failed 307/308 on one inner test. The failure did not
recur in any reproduction. No runtime defect was found, and no evidence ties it
to iteration 14. The only change is to the test's diagnostics: a recurrence
now records both outcomes. Changes are uncommitted and await the coordinator's
review.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit | `376f4539`, clean at assignment |
| Changed | `src/tests/compiled-client.test.ts` (diagnostics only) |
| Added | this receipt |
| Unchanged | all runtime source, `scripts/reference-harness/`, protected documents, manifests, lockfiles, `ramify-agent/` |
| Node | v22.23.3 |
| Evidence | `/home/app/ramify-pb1-evidence/iteration14-fix/` |

## The failure

In the gate's relocated copy, the inner Vitest report recorded 2739 tests,
2738 passing. The failing test was `src/tests/compiled-client.test.ts` ›
`A7-11:compiled-child`, for `affected example/mid --path docs/notes.md
--batch`:
`expected [ +0, null, …(2) ] to deeply equal [ +0, null, …(2) ]`. The
assertion compared the compiled client's `[code, signal, stdout, stderr]` with
`[0, null, node.stdout, node.stderr]`. Vitest's JSON report keeps only that
truncated message. It shows that the compiled client exited 0 without a
signal, and that its stdout or stderr differed from the Node entry's. It hides
both texts. The Node entry's exit code was never asserted, so a failed Node
run looks the same. The relocated run directory was removed after the run.
The archived report has no diff.

## Reproduction attempts

None reproduced the mismatch.

| Attempt | Environment | Result |
| --- | --- | --- |
| Test file, scratch copy of `376f4539` (archive without `.git`, `npm ci`, clean build) | ordinary | 9/9 passed |
| Same | `relocationEnvironment` mirrored (`env -i`, isolated `HOME`, `TMPDIR`, `PATH`, `CI=1`) | 9/9 passed |
| Whole suite once, as the instance runs it (`npm test -- --reporter=json`) | mirrored | 2737/2739; A7-11 passed. The two failures are the RS10 explorer cases, which failed only because the scratch `TMPDIR` makes the daemon socket path exceed 100 bytes |
| Twelve concurrent copies of the test file | mirrored | 108/108 passed |
| Probe of the test's three comparisons, compiled client against Node entry, fresh fixture per round | 5 rounds alone; 8×6 rounds concurrently; 2×8×8 rounds beside six heavy session test files | 0 of 543 comparisons differed |
| Node entry stderr for the failing query | 60 runs alone, 250 runs with ten concurrent loops | always empty |
| `I1-28:relocated-package` alone through the Plan 1 runner, locked, with a temporary dump of both outcomes | real `/tmp/ramify-relocation-work` | passed; inner 2739/2739; both outcomes byte-identical |
| Same, with the final test change | real | passed; inner 2739/2739 |

The gate run was not unusually loaded. Its inner suite finished in 243 s, and
the scratch suite took 263 s. A7-11 took 5281 ms there, against 7447 ms in the
passing scratch suite. The failure arose on the fourth run, after a normal
duration, so the Node run neither hung nor exited early. Of the 12 relocated
inner reports archived before this diagnosis, this is the only A7-11 failure
(`relocation-history.txt`). The logs of the 8×6 concurrent probe rounds were
removed by mistake while preparing the next batch. Their 144 comparisons were
read before removal, and none differed. The other probe logs are kept.

## Analysis

- **Iteration 14 path.** `classifyProjectPath` is a pure function of the
  scope and the path. `projectAffected` sorts the classified seeds and every
  module list. The root's ownership of `docs/notes.md` by containment comes
  from the scope alone and reads no file. The compiled client prints the same
  result as the Node entry: its Node child returns the same result as JSON, and
  the same `formatAffected` renders it. In every run, both documents were
  byte-identical for this seed.
- **Inputs.** The fixture's captured inputs (129) are all inside the root,
  except the TypeScript library files, which belong to the toolkit's
  installation and are the same for both runs. Unread files such as
  `docs/notes.md` hash only their kind and canonical path. Nothing in either
  run writes to the fixture. Neither the relocation `TMPDIR` nor the missing
  `.git` reaches any input, and neither does an ancestor directory.
- **Environment candidates checked.** These were all excluded: abort-listener
  warnings (at most 2 listeners on one signal), FileHandle leaks (capture
  closes every handle), fixture writes, tmpdir sweeps by other tests, and
  harness concurrency (instances run in sequence).
- **Open candidate.** The two entries differ in where engine stderr goes. The
  Node entry hosts the retained session itself, and the session supervisor and
  TypeScript server inherit its stderr. The compiled client discards its
  successful Node child's stderr. A timing-dependent stderr line or a transient
  Node-entry failure would therefore show only on the Node side. Concurrent
  suites occasionally print `context canceled` (12 or 13 times per relocated
  suite, once among six session test files run together, and never when each
  file runs alone). This line comes from a TypeScript server inside a session,
  but direct tests did not reproduce it on a normal close: SIGTERM after
  close exited 0 in 80 runs, and SIGTERM with stdin still open printed
  nothing. This candidate is unconfirmed.

**Classification.** An intermittent failure that did not reproduce, with no
evidence of a runtime defect and none tying it to iteration 14. It is not
established as a load flake: the gate run was not abnormally loaded. The
evidence cannot distinguish a stderr-only difference, a failed Node run or a
stdout difference.

## Change

`A7-11:compiled-child` now names both complete outcomes,
`[code, signal, stdout, stderr]` of the compiled client and the Node entry, in
the assertion message, which the JSON report keeps. It also asserts that the
Node entry exited 0 without a signal. The assertion is otherwise unchanged and
no weaker. A run with a forced mismatch shows the message carrying both
outcomes (`forced-mismatch.json` in the evidence directory). No guarding test
for a cause was added, because no deterministic cause was found.

## Verification

| Command | Result |
| --- | --- |
| `git diff --check` | clean |
| `npm run build` | exit 0 |
| `npm run type-check` | exit 0 |
| `npm run check:self` | exit 0; 15 owners, 579 source files, 41 analysis limits, 0 denied |
| `npx vitest run src/tests/compiled-client.test.ts`, checkout | 9/9 passed |
| Same, scratch copy, mirrored relocation environment, after the change | 9/9 passed |
| `npx vitest run src/tests` | 190 files, 2735 tests passed (the filter matched every test path containing `src/tests`, so this was nearly the whole suite; see the report) |
| `I1-28:relocated-package` alone, locked | passed (`i128-final.*`; inner report 2739/2739) |
| `npm run reference:cases` | not run: no runtime source changed |

## For the coordinator

- Keep or drop the diagnostics change. It weakens nothing, and a recurrence
  in any gate would then record the two texts.
- If it recurs, the recorded outcomes will show whether it is a stderr line
  (the open candidate), a failed Node run or a stdout difference.

## Coordinator review

Iteration 14's gate on `376f4539` failed one Plan 1 instance,
`I1-28:relocated-package`, through this single test in the relocated copy.
The coordinator reviewed the investigation: the failure could not be
reproduced in more than five hundred comparisons, in a mirrored relocation
environment, or in two locked runs of the instance alone, and iteration 14's
seed classification reads no file and sorts its output. The cause is not
established. The test now records both outputs and checks the Node entry's
exit, so a recurrence identifies what differed; nothing is weakened. The
coordinator reruns the gate on this commit; a second failure of this test is
investigated from the recorded outputs before any further iteration lands.
The agent's unlocked `npx vitest run src/tests` run in the checkout matched
nearly the whole suite; it is recorded as a rule deviation, not as gate
evidence.
