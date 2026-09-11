# Acceptance evidence reuse

The user approved this amendment on 2026-09-11 after reviewing the blast radius
of the lookup-test instrumentation and reference-harness report-limit fixes.
It replaces the requirement to repeat every acceptance case after any aggregate
source-hash change. That initial amendment retained the reviewed case inventory, measurement
counts, platform coverage, correctness requirements or cleanup requirements.

## Reuse and affected execution

Acceptance may combine original executions and focused reruns through a separate
receipt. Original artifacts retain their identities, timestamps, outcomes and
raw evidence. A receipt identifies every contributing artifact by content hash,
maps every required case or workload to its executed evidence, and records the
current checkout identity separately. A composed receipt must never describe
itself as a new unfiltered execution or change a historical failed report to pass.

Reuse requires evidence that all inputs relevant to the retained execution are
unchanged. This includes production source and build, runtime and dependencies,
fixtures, workload algorithms, parameters and assertions. Differences must be
enumerated with exact before/after file identities and a reviewed explanation
of their effect. Merely excluding all tests or scripts from a hash is insufficient.
Unknown differences or changed production, fixture or workload inputs invalidate
reuse for the affected behavior.

For the two latest corrections, the lookup-test spy changes test instrumentation
and toolkit self-check coverage; the shared reference-harness allowance changes
direct-analysis request configuration. Verify the lookup regression, the positive
and negative self-checks, affected CLI/API comparisons and relevant compiler
scopes. Account for every consumer of the shared helper when choosing reruns.
Retained process evidence must come from the required operating system. Linux
execution cannot replace macOS process evidence.

Changes that implement evidence composition itself must be distinguished from
changes to workload execution. Their validators require negative controls for
changed inputs, tampered artifacts, missing cases and failed evidence, plus
independent review. Their existence alone cannot justify accepting older evidence.

## Measurements

A fully completed workload in an interrupted multi-workload run may be retained
only if its raw observations, independently recomputed assertions and completed
cleanup establish its entire required execution. The interrupted workload cannot
count. Successful selected-workload runs may contribute under the same rules;
their parent report remains explicitly partial.

Under the initial reuse amendment, all nine workloads remained required, including the exact repeated-edit counts.
Execute the workloads that lack reusable passing evidence on an otherwise idle
host. Performance comparisons remain advisory under the earlier approval;
missing measurements, incorrect results, runtime capacity violations and failed
cleanup remain acceptance failures.

## Completion

The final evidence index must distinguish directly executed, reused and newly
rerun coverage, identify outstanding obligations and link the amendment. Commit
audit and workflow disposition remain required. This amendment authorizes
acceptance composition for this remediation; it does not silently change later
plans or their acceptance contracts.

## Stop performance-only execution amendment

The user's later instruction on 2026-09-11 was: "If there no errors, I don't
want to execute other tests only to measure performance." This supersedes the
remaining measurement-execution requirement above for this closeout.

No further performance-only workloads or measurement-consumer runs are required.
Retain the five verified workloads and their 1,355 independently checked raw
assertions, including all 400 repeated-edit cycles and all eight contexts.
The slow-consumer measurement was interrupted at the user's request and is not
a pass. Fresh S500, S1000 and publication-peak measurements were not started in
the resumed queue. Earlier successful large-project correctness preflights
remain historical evidence with their original identities.

The four unfinished measurement requirements are waived for this acceptance,
as is running the nine measurement-only acceptance consumers. This does not
waive an observed correctness defect, a runtime capacity violation or process
cleanup. Actual slow-consumer behavior has passed in the Linux and macOS
process suites. The stopped queue's final independent process check found no
owned survivors; its original immediate post-exit count of two and subsequent
cleanup remain recorded in the interruption evidence.

Acceptance is reported as 167/167 Linux behavioral cases, 78/78 macOS process
cases and composed 308/308 Plan 1 coverage, with the explicit measurement waiver.
Do not report a passing full 176-case Plan 2 execution or nine completed
measurement workloads. The strict full measurement validator is unchanged and
continues to reject incomplete evidence. The final configured regression/type
check audit and workflow disposition remain required; neither launches the
benchmark runner.
