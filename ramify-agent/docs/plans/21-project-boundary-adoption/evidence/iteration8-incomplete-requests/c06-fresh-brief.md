<!-- PB3-C06: scenario-states.test.ts, the third local architect turn's brief (excerpt). -->

# Registered obligations

You are the responsible architect for these. Report one with `reports: [{ id, judgment: "done", basedOnRevision, where? }]` when, in your judgment, it is correctly implemented and passing; `basedOnRevision` is the revision shown. An engineer's accepted binding makes an obligation `bound` and names the fakes it relies on; a gate or audit result is execution evidence beside the status. Neither is your report, and neither changes one; your report is accepted whatever the fakes list says. Revise an earlier `done` with judgment "bound". Name the obligations an iteration binds in `assignment.obligations`. `where` is an optional short navigation hint; the harness stores it and never reads it.

- sc-001 (scenario): done, revision 1; bound by inv-0009 with no fakes; last report done by inv-0008

# Accepted source since your reports

The accepted source is now revision-02. These reports were made against earlier accepted source; `inspect_git` with `diff` from that revision to the current one shows what changed. The reports stand as you made them: whether one needs revising is your judgment.

- sc-001: last reported done against accepted source revision-01
