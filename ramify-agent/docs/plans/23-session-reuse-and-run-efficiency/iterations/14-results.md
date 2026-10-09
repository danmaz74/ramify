# Iteration 14 results: complete qualification

**Result:** Q01, Q02 and Q03 PASS on clean source `aac47684aa8f4cfc4e524f6efb04c2de9ef01abc`, tree `fce8f7020553d1a0311706cbb2f472c04b58b9e4`. Together with the 49 accepted owning rows from iterations 0–13, this supplies all 52 [acceptance](../acceptance.md) rows. Historical receipts remain source-specific; their earlier pending integration statements do not override these completed gates.

## Source and ownership

Execution baseline: `d01a57bdbac6a56c29a893519f70297513824313`. Iteration 14 prerequisite: `7f9022f1`. The coordinator ran all final gates on exact aac source before this documentation-only receipt. This commit changes only `ramify-agent/docs/plans/23-session-reuse-and-run-efficiency/iterations/14-results.md`; it changes no runtime, configuration, registration or earlier receipt.

Initial source handoff `7b9fb813282a2350df00b51abf9af290b9f28ee5` covered ten paths: the root live script, harness live helper and ordinary test, three native witness files, three public READMEs and Pi options. Coordinator-owned narrow declarations and exact registrations accompanied integration. Qualification also found current-task literal/bound/source-point defects, stale fixture routing and recovery assumptions, physical store integrity costs, discarded-shutdown authentication and captured-commit fault-injection gaps. Narrow repairs retain the original workflow and authority assertions.

The final one-file fault-adapter repair, owner `dc4a3f2bae4fa88aa0c768a526378258c2a2725d`, intercepts both actual commit paths without disabling the advertised captured capability. All original 28 cases/assertions/bounds remain, plus three independent helper controls. Owning 31 cases passed in 31.83 seconds; five provider files/190 cases passed in 2.82 seconds. Its [receipt](/home/app/ramify-plan23-evidence/aac47684aa8f4cfc4e524f6efb04c2de9ef01abc/qualification/plan23-continuing-faults-receipt.md) retains the first four reds and TS2542 fixture correction. Counts from overlapping focused commands are not summed.

## Q03: released full configured audit

From the repository root, the coordinator executed:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

The audit completed EXIT0 in **653.636 seconds**, with agent tests taking 610.715 seconds. All six declared checks passed: scenarios, structure, tests, type-check, web build and patch integrity. Original four-worker configuration and the 1,200,000 ms runner bound remained. The configured root Cucumber check reports zero scenarios/steps; actual Cucumber behavior is independently witnessed by Q01.

- Audit report: `639b1eb3b379f0ddd37afc054385f2f9c10ef8f0`.
- Run: `01fd34ce-47f0-41f0-89df-8f361eaa9a40`; request: `3b75f703-e117-48dd-83c8-3851a597a51d`.
- Run ref: `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-09T03-52-34Z-aac47684a`.
- Tree ref: `refs/audited/projects/ramify-agent-f25e9a298228/by-tree/fce8f7020553d1a0311706cbb2f472c04b58b9e4`.

Actual configured discovery is **311 files: 242 node, 51 native-boundary and 18 web**. Full evidence accounts for 311 unique files, expected/run 311, missing [], with no unexpected file. Terminal totals: **310 passing files, zero failures, one inherited skipped file; 2,716 passing cases, zero failures, two inherited skipped cases** (2,718 total). The complete failure ledger has no entries and composition has zero outstanding failures.

The only skipped file remains the pre-existing opt-in `fixture-trials.test.ts`, containing status-badge-tone and reviewer-identity trials. No new unintended skip or configured-file removal occurred. Discovery is unchanged from 6dd3; compared with the prior 310-file candidate, only the ordinary ledger JSON-line appender test was added. The receipt author independently read the actual [audit JSON](/tmp/plan23-aac47684-final-audit.json) and [inspection](/tmp/plan23-aac47684-final14-readonly-audit-inspection.json); [raw output](/tmp/plan23-aac47684-audit-regression-output.txt) is retained.

All four configured TypeScript scopes passed through `npm run type-check`. `npm run check:self` passed with partial coverage: 687 sources, 50 resources, 13,368 accesses, zero errors/warnings and 328 retained analysis limits. `npm run build:web` and full baseline whitespace passed; the existing large generated web chunk warning remains.

## Q01: registered native witnesses

All three exact registered native files passed **14 cases in 12.72 seconds**:

```sh
npm run test:boundaries -- subs/harness/src/tests/plan23-trial-attribution.boundary.test.ts subs/harness/src/tests/plan23-cucumber.boundary.test.ts subs/harness/subs/agent/subs/pi/src/tests/plan23-transport.boundary.test.ts --maxWorkers 1
```

Seven Git/public collector-CLI cases exercise exact setup identities, shifted/reverted/mixed changes, rename/deletion/binary partitions, prepared engineer cwd and external-output/symlink guards. The required missing-EOF positive produced two additions, one deletion, setup-only classification and exit zero on actual Git objects. The predicted defect did not reproduce; no conditional repair was made.

Three installed Cucumber cases exercise public configuration loading, declared support/world/loader, exact pending-feature execution and default-profile path/tag merging. Four Pi-owned cases exercise actual kernel HTTP/SSE, serializer/production-store restoration, inactive-tool refusal, pre-dispatch Stop fencing and meaningful verifier fixtures. Persisted request artifacts can precede the dispatch fence and are not themselves HTTP transmission proof. [Native log](/home/app/ramify-plan23-evidence/aac47684aa8f4cfc4e524f6efb04c2de9ef01abc/qualification/plan23-aac47684-final-native.log).

## Q02: authenticated original live evidence

The first fresh aac live attempt passed:

```sh
node --import tsx scripts/plan23-live-session.ts --source-candidate aac47684aa8f4cfc4e524f6efb04c2de9ef01abc --evidence-directory /tmp/plan23-live-aac47684-original-20261009
```

Initial PID **3867719 exited before restore PID 3867783**. Both phases completed using Pi 0.87.1, `openai-codex/gpt-5.6-sol`, SSE and provider retries zero. Initial READ/LEFT/RIGHT submissions were accepted. Append and sibling forks retain recorded source points. The distinct process reopened the production ledger; terminal RIGHT Retry caused no model/effect repeat, RESTORED was accepted, and repeated Stop returned identical stopped receipts with null reusable points and zero late acceptance.

Mandatory original-evidence verification passed **four cases in 3.28 seconds**:

```sh
PLAN23_REQUIRE_LIVE_EVIDENCE=1 PLAN23_LIVE_EVIDENCE_DIRECTORY=/tmp/plan23-live-aac47684-original-20261009 npm run test:boundaries -- subs/harness/subs/agent/subs/pi/src/tests/plan23-transport.boundary.test.ts --maxWorkers 1
```
Pi authenticates original bytes, public points/receipts, full settled prefixes including accepted terminal tool outputs, and every dependent request. Root/harness do not decode opaque provider transcripts; default fixtures do not substitute for this proof. [Verifier log](/home/app/ramify-plan23-evidence/aac47684aa8f4cfc4e524f6efb04c2de9ef01abc/qualification/plan23-aac47684-original-live-verifier.log).

## Retained failures and limits

| Source/attempt | Actual result | Disposition |
| --- | --- | --- |
| d01 baseline | Native materializer DataView failure | Original receipt retained; later focused native correction passed |
| 637d8ff7 | Full audit timed out after 1,243.606 seconds; no trustworthy end summary | Report `41209da07bbf06539523dc31c40afb52faef3aab` retained |
| fac6de30 | Complete 311-file audit: two failed cases | CA19 authentication/original 15-second workflow; report `572a512808b964c59c9628ba3553c82d31297e60` retained |
| 39aea6be | Original 15-second workflow timed out; other 63 targeted cases passed | Complete assertions retained |
| First 6dd3 live | Restore SDK error `terminated`, zero accepted submission | Failed originals retained; unchanged-source fresh rerun/verifier passed; network cause undetermined |
| 6dd3 full audit | Complete 311-file coverage, four continuing-work failures | Fault-adapter repair; report `7a5ea2f72e14b6820092a2ce38d9e95a9770c152` retained |

The direct user instruction “let's change this to 25 seconds” (2026-10-09 02:26:22.055 UTC) authorized the existing contract workflow watchdog. Current bound is 25 seconds; all phases, seven work items and assertions remain. Original 15-second failures are retained. This authorization is not a comparative performance result.

[Retained evidence](/home/app/ramify-plan23-evidence/aac47684aa8f4cfc4e524f6efb04c2de9ef01abc/README.md) includes 26 original opaque payloads and the complete production store with 78 record bodies; the coordinator owns final archive inventory and documentation-only delivery identities. Credentials and synthetic verifier-runtime credentials are excluded. Earlier failed candidate archives and narrow repair receipts remain separate.

Physical journal/body/provider integrity, owner/CAS authority, immutable input anchors, Stop fences and atomic reference publication remain. Explicit transcript bursts retain per-line datasync/close-before-acknowledgment; optional captured APIs preserve defensive defaults. Observation batching was deferred and is not delivered. Structural coverage remains partial; browser automation and existing opt-in long/status-badge trials are unrun. Token charges retain estimates/unknowns. No comparative speed, cache-hit, monetary or semantic-completion claim is made: engineers report, the responsible/local architect owns semantic completion, and audit establishes configured automated health.
