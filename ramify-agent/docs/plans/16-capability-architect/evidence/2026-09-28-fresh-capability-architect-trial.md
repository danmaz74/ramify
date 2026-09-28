# Fresh capability architect: second Pi trial

**Date:** 2026-09-28. **Base:** `5a1934aa844c5ab95013653f15c7aeb422690b13`.
**Scope:** isolated test of `ramify-agent/docs/architecture/fresh-capability-architect.hypothesis.md` against `plans/self-explaining-denials/plan.md`. This branch is an experimental candidate, not a delivered feature.

## Method and authority

Four persistent Pi roles used `openai-codex/gpt-6-sol:medium`: CLI engineer (A), CLI architect (A), one fresh capability architect, and Analysis engineer (B). The original need and first consumer prompt, base commit, model, engineer write scopes, architect read-only tools and staged one-edit challenge matched the first trial. The old candidate, report and solution were withheld from Pi prompts. A temporary driver used the existing Pi adapter; no production harness cooperation workflow was added. The independent evaluator and per-turn prompts, results, submissions, event streams and plan revisions are under `/tmp/ramify-fresh-capability-20260928/`.

The final shared plan is archived at [2026-09-28-fresh-capability-architect-trial.plan.md](2026-09-28-fresh-capability-architect-trial.plan.md). The temporary folder retains finer turn evidence and the independent evaluator.

The intended rule is that the capability architect does all A-architect work needed for X from delegation until explicit handback, including A-side architectural decisions, cross-owner assignments and consumer verification. Turn 08 instead summoned A-architect to allocate routine X compatibility work. That was a protocol deviation, costing one Pi architect turn (74.539 seconds, 28,332 input and 2,444 output tokens). Subsequent prompts gave the active capability architect that authority. It handed back the **bounded experiment** at turn 20. The original five-code feature plan remains open and unaccepted.

Coordinator changes outside Pi engineer turns updated typed root, daemon/contexts and reference-harness fixtures to the new required diagnostic fields. The new CLI test initially imported forbidden root test helpers; a CLI engineer turn replaced those imports with a CLI-local fixture. These interventions and the temporary runner differ from the first trial and limit causal claims about the architecture alone.

**Proposed hypothesis clarification (not edited in the hypothesis):** “From delegation until explicit handback, the capability architect performs every A-architect task needed for X, including A's architectural implications, cross-owner assignments, compatibility decisions, integration and verification. A-architect does not resume or approve ordinary X decisions during that interval. Engineers retain their owner-scoped write authority. A change to a responsibility boundary owned by neither A nor B goes to the architect responsible for that boundary while the capability architect continues to coordinate X.” In workflow step 3, replace the sentence returning an issue affecting A's broader architecture to A-architect with: “The capability architect resolves X's effects on A's architecture; only a boundary outside A and B responsibility is routed to its responsible architect.”

## Observed behavior

The final candidate uses Analysis-authored diagnostic facts and one-edit proposal proof; CLI relays one complete block through batch and resident changed output. Real Analysis and CLI fixtures establish these bounded cases:

| Case | Independent result on the final candidate |
| --- | --- |
| No reaching same-file statement | Selected alias denied; exposures and received names are `none`; `proposal:null`; batch and changed blocks match, with unchanged exit 1. |
| Existing same-file statement | A denied selected alias has a proposal naming the actual `module.ramify` statement and the **exported spelling**, even when the original binding differs. Adding that name in one statement edit allows the import and removes the denial; batch and resident `--since` JSON/human, `new`/removed identities, fixed non-permission label and exit 0 are checked. A valid quoted reserved module name, initially a failing falsification case, now works. |
| Two missing relays | The real import stays denied with `proposal:null` before and after one branch relay edit. Analysis names the next missing root hop after that edit. CLI full and changed blocks and exit 1 agree for the tested topology. |

The new trial caught the first trial's false `proposal:null` oracle question in its initial CLI engineer investigation, before code. This occurred in the same role with essentially the same first prompt, so it does not establish that the new architect structure caused the earlier discovery. The capability architect later made its own incorrect prediction about key-shaped prose in the same-file fixture; the CLI engineer's real test failed and corrected that prediction.

The provider's first proposal proof had a concrete false negative for valid quoted reserved names and an unbounded sequence of synchronous relinks. The capability architect identified both; the CLI engineer retained a red quoted-name acceptance test, and Analysis repaired it. A later real five-denial fixture exposed different batch and retained diagnostic IDs when earlier denials exhausted a shared proof budget. Analysis changed to a per-denial allowance; that fixture now has byte-identical batch/retained diagnostic lists and a position-only retained delta. The last Analysis turn and its short reporting continuation both reached Pi's context budget **without a structured engineer submission**. Their saved report, events, source and independently rerun checks support the bounded observation; they do not constitute an accepted B-engineer handoff.

## Verification and remaining limits

On the final source, focused Analysis tests passed **109/109** across five files and real CLI tests passed **27/27** across two files. Whole-tree type-check, build and `git diff --check` passed. A cold isolated-endpoint `check:self` passed with complete coverage of 15 owners, 440 source files and 6,613 accesses, with zero findings; its owned daemon was stopped. The full reference suite on a clean copy of this exact source passed **381/390**. An independently built unchanged-base worktree also passed 381/390. The nine failing test names and expected/actual assertion blocks matched, after normalizing run-specific hashes, revision IDs and timing. This is regression parity, not a 390/390 pass or full reference-renderer acceptance.

High-severity deployment risks remain. With `maxDiagnostics=100000` and an allowance up to 8,000,000 structural units per denial, admitted request-wide work can reach **800,000,000,000 counted units**. The units are not a CPU, memory or decoded-text bound, and one synchronous `linkDescriptions` call cannot be interrupted between checkpoints. An incomplete proof has `proposal:null` plus an explanatory detail; JSON has no typed field distinguishing “unproved because of budget” from “disproved.” The bounded cases do not exhaust that budget in ordinary CLI use.

The original request is substantially unfinished: denied originals with their own ineffective or wrong-destination exposures can still get internal-key prose; the other four denial messages and both missing-export producers lack acceptance; general hop evidence, 50-exposure/50-received-name packing, 400/300-character bounds, complete related sorting and retained proposal-position semantics are open. Valid long identities may make the mandatory full message incompatible with a 400-character cap. The reference renderer still prints a flat one-line error rather than the complete block; not-checked provider-message transport and documentation are not fully accepted. No production merge follows from this experiment.

## Comparison with the first trial

| Measure | First cooperation trial | Fresh capability architect trial |
| --- | ---: | ---: |
| Pi turns | 23 | 20 (including one 12-minute stop and two context-budget turns without submission) |
| Architect turns | 15 | 9 (including the extra turn 08 A-architect call) |
| Summed Pi minutes | 47.612 | 73.574 |
| Input / output tokens | 576,584 / 78,562 | 1,148,542 / 106,685 |
| Cache-read tokens | 13,832,192 | 29,642,240 |
| Focused Analysis / CLI tests | 87 / 26 | 109 / 27 |
| Full reference suite on final source | Not run | 381/390, same nine failing assertions as unchanged base |

At the corresponding three-case CLI milestone, the new run had 14 turns and 47.851 summed Pi minutes, versus 23 turns and 47.612 minutes for the first trial's final bounded result. Thus the simplified structure reduced architect exchanges, **not** summed Pi time at that milestone. Later quoted-name, proof-budget and parity hardening raised the new total to 73.574 minutes. Most of the extra time went to engineers: the new Analysis engineer used 44.456 minutes versus 26.256, and the CLI engineer 16.432 versus 7.198; architect time fell only from 14.158 to 12.686 minutes.

The first trial's full reference run was on an earlier candidate (377/390), with only one failure reproduced on the unchanged base and no final-source run. It cannot be used as a like-for-like final reference comparison. The new trial used stronger alias, reserved-name, proof-budget and retained-delta oracles, additional coordinator compatibility edits, and a corrected authority rule after turn 08. These differences and the Pi context limits prevent attributing quality or cost changes solely to the new architecture. The observed result supports a narrower conclusion: one active capability architect can coordinate A and B through a sound small consumer/provider experiment with fewer architect turns, while substantial provider engineering and acceptance work still dominates elapsed Pi time.
