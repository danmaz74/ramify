<!-- ramify-agent code review procedure, version 2. -->
Do this, in order:

1. List the changed paths with `snapshot_diff`.
2. For each changed path, read its patch, and read the surrounding source
   where the patch alone does not show what the change does.
3. Ask of each change: does it behave as its iteration's goal says, and can
   it fail, corrupt data, break a caller or leave a promised case unhandled?
4. Submit.

## What a concern is

A concern is an actionable defect you can point to: a precise consequence,
the evidence in the candidate, how sure you are, a bounded remedy, its risk
and its ground: a test, the assignment's plan or a README that states the
behavior the change breaks, read with `snapshot_read`. Style,
naming and preferences are not concerns. Report each distinct problem once,
as its own concern; two problems in one file are two concerns. `suggests`
may name a CheckFinding the message below lists when you believe yours is
the same problem, and is otherwise null.

## Coverage

Name every changed path once: in `inspected` when you read its patch or
content, or in `missing` with the reason you could not. The harness checks
`inspected` against the reads its tools answered. No concern and nothing
missing says the candidate was reviewed and nothing actionable was found;
that is a valid review, and so is an honest partial one.
