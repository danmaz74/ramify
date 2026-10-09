# Iteration 4: metric access, documentation and final qualification

**Date:** 2026-10-09. **Outcome:** complete. Worktree:
`/home/app/ramify-plan24-orientation`, branch `feat/plan24-orientation`.
Final audited source: `e1fa315c422d434b4a05ff196c8027c23e660fd1`.

## Delivered behavior

Existing records already hold role/work identity, the task kind in the retained
packet, actual/requested starts, timing, provider usage, exploration/tool counts
and fallback reasons. [Session observations](../../../metrics/session-observations.md)
documents their record paths, API fields, joins and coverage. No collector,
dashboard, pricing lookup, benefit trial or performance gate was added.

The small lineage projection join now uses the recorded degradation's requested
mode for a separate fresh fallback. Its actual operation remains fresh and its
fork generation remains null when there is no fork relation. One existing
projection test covers both intended fork and continuation without introducing
a new metric policy or required field.

Harness/catalog specifications, owning READMEs and analysis follow-up links now
describe own-item exploration, inherited selector inputs, ordinary fresh fallback,
last-attempt selection provenance, specific context-loss indication and historical
rebuild readers. Metrics/documentation source commit:
`d19babd71f828798959b8e232bdc9672dba75c67`.

The initial full audit found one obsolete session-fixture expectation for an
engineer replacement, retired by iteration 3. The correction asserts the old
engineer is lost, the later engineer opens fresh with continue-to-fresh degradation,
and no replacement relation is introduced. Its helper comments/title were updated.
Correction commit: `047508c281931bc3066f864e2caebf635a3073bf`. Historical replacement
reader tests remain. No runtime change or flakiness classification was needed.

## User-requested Pi integration

During qualification Dan requested merging the implementation described by
[adapter-results.md](../../../spikes/pi-cache-reuse/adapter-results.md).
Merged upstream source `729033c090a5fa5f65f2a27a29f1abf180a82423`, branch
`codex/pi-shared-provider-identity`, using a genuine two-parent merge:
`e1fa315c422d434b4a05ff196c8027c23e660fd1`. Its first parent is correction
`047508c281931bc3066f864e2caebf635a3073bf`.

One conflicted Pi source file contained three overlapping hunks. Resolution keeps
upstream `providerSessionId` propagation, creation-operation lookup, independent
logical sessions and final cache-key/header fence, while retaining Plan 24's typed
known history/model/prefix losses and ordinary arbitrary provider/initialization
failures. Missing creation-operation identity remains an ordinary error. Owning
README and prefix tests merged both intents. Coordinator reviewed the resolution.

The adapter, serial and concurrent result documents were copied byte-for-byte;
no README or runner was needed by their relative link topology. Their prior live
and audit claims remain historical evidence for their named source. Upstream full
audit report `5e7495c5c10ff01912b105bc8dfa6e5cd65c2083` and ref
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-09T09-24-29Z-729033c09`
are recorded by that document; this iteration did not rerun its live witness or
verify a benefit. The merged candidate received its own correctness audit below.

## Focused and structural checks

From `ramify-agent/`:

```sh
npm run test:quick -- subs/harness/src/tests/lineage-metrics.test.ts
npm run test:quick -- subs/harness/src/tests/session-fixture.test.ts
npm run test:quick -- subs/harness/subs/agent/subs/pi/src/tests --maxWorkers=4
npm run test:boundaries -- subs/harness/subs/agent/subs/pi/src/tests/plan23-transport.boundary.test.ts --maxWorkers=1
npm run type-check
npm run check:self
```

- Lineage projection: one ordinary file, 13 tests passed. Log:
  `/tmp/plan24-iteration4-focused.log`.
- Corrected HTTP session fixture: one ordinary file, four tests passed. Log:
  `/tmp/plan24-iteration4-fixture-correction.log`.
- Integrated Pi: 13 ordinary files, 111 tests passed. Log:
  `/tmp/plan24-iteration4-pi-focused.log`.
- Configured native transport witness: one file, four tests passed. Actual local
  HTTP/SSE routing identity, process restoration and existing Stop/inactive-tool
  controls ran without opt-in live captures. Log:
  `/tmp/plan24-iteration4-pi-transport.log`.
- Final integrated type-check passed all four configured compiler scopes. Final
  check:self passed: 12 owners, zero errors/warnings, 328 retained analysis limits;
  source analysis coverage remains partial. Logs:
  `/tmp/plan24-iteration4-integration-typecheck.log` and
  `/tmp/plan24-iteration4-integration-structure.log`. Initial and corrected-candidate
  agent checks also passed; their separate logs remain under the same prefix.
- An initial type-check ran from the repository root and passed; it was not used
  as agent qualification. Its log is `/tmp/plan24-iteration4-root-typecheck.log`.
- Committed/staged patch checks passed. Coordinator validated local document links
  and protected planning-checkout bytes separately.

## Audit history and final acceptance

The configured command ran from the worktree root on clean committed candidates:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

1. Candidate `d19babd7`: **failed**, exit 1, solely the obsolete fixture assertion
   above. All 311 configured files were accounted for, none missing: 309 files
   passed, one failed, one skipped; 2,771 tests passed, one failed, two skipped.
   Other five checks passed. Complete failure ledger had one entry. Original
   outputs `/tmp/plan24-final-audit.{json,log,exit}` and concise
   `/tmp/plan24-final-audit-summary.json` remain unchanged. Durable report:
   `747880b39f00a0e7ccc0896b9c5ad339971475cf`; ref
   `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-09T09-38-00Z-d19babd71`.
2. Corrected `047508c2`: **interrupted**, exit 130, after the new merge instruction
   superseded its candidate. SIGINT targeted only owned audit CLI PID 4184187;
   its worker 4184203 and Vitest 4184513 were confirmed gone. No completed verdict
   was produced and this is not passing evidence. Retained outputs:
   `/tmp/plan24-final-audit-corrected.{json,log,exit}`.
3. Merged `e1fa315c`: **passed**, exit 0; all six checks, invocation verdict and
   full nested composition passed. Configured runner discovery accounted for
   **311 expected/run files, zero missing**: 310 files passed, one existing skipped
   file; **2,777 tests passed, two existing opt-in tests skipped**, zero failures.
   Failure ledger is complete and empty; composition has zero outstanding failures,
   chain depth zero and no scoped limitation. The configured projects list contains
   `ramify-agent`, execution `ran`, verdict `pass`. The Cucumber profile selected
   zero scenarios/steps, so it establishes no scenario execution.

Final report: `51dbbf0c330737b60beb8a832f33a2512d341f07`. Durable ref:
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-09T09-58-50Z-e1fa315c4`.
Audited source tree: `13182210af76cf49809d0f0a5ea0b050536a0d0d`.
Raw outputs: `/tmp/plan24-final-audit-integrated.{json,log,exit}`; concise summary:
`/tmp/plan24-final-audit-integrated-summary.json`. Retrieval:

```sh
git show refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-09T09-58-50Z-e1fa315c4:reports/audit/summary.json
```

Final process-guard evidence covers 310 unique executed files: 260 ordinary files
with zero allowed/refused process launches, and 50 registered native files. The
native transport witness emitted two receipts, giving 311 receipt rows; this is
distinct from the configured 311 files, which includes the skipped file. No new
skip, quarantine or retry was added. Full audit runtime was 660.256 seconds; this
is execution-health evidence, not a benefit comparison.

## Handoff

All Plan 24 iterations are delivered. The final result/status commit changes only
ignored `docs/**` paths; the coordinator can confirm accepted full-evidence reuse
at that final HEAD through the default nested audit without repeating the suite.
The implementation branch has not been pushed. The planning checkout and its user
work remain preserved. Dan owns benefit assessment and agents retain semantic
judgment; no performance improvement is claimed here.
