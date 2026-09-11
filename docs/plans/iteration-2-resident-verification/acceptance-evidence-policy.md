# Acceptance evidence reuse

The user approved this amendment on 2026-09-11 after reviewing the blast radius
of the lookup-test instrumentation and reference-harness report-limit fixes.
It replaces the requirement to repeat every acceptance case after any aggregate
source-hash change. It does not reduce the reviewed case inventory, measurement
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

All nine workloads remain required, including the exact repeated-edit counts.
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
