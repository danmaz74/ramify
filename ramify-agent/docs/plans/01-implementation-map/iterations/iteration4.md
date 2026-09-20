# Iteration 4: Map view, approval and the live trial

**Goal:** a person reads and approves a map in the browser, and a live trial
shows whether the maps are useful.

## Scope

- **`web`**: the Map page as [the web client](../main-plan.md#the-web-client)
  describes it, including the modules touched drawn on the project's module
  tree with their weights, and earlier revisions selectable. Approve and
  Regenerate.
- **`harness`**: the revision and module-tree queries; Approve as
  [approval](../main-plan.md#approval) describes it, refused as stale when the
  plan hash or input identity differs, writing the approval record once;
  Regenerate as a new job.
- **Live trial** on a real plan for the toolkit or the reference example,
  with a real pi session. The review questions are the main plan's: are the
  heavy modules right, were the reuse findings real, are the seams plausible.
  The review is a person's; the agent prepares the map and a review sheet, and
  records its own observations separately from the person's verdict.
- **Completion report** `completion-report.md` beside the main plan,
  against the [completion gate](../main-plan.md#completion-gate), handing the
  next plan the map schema, a produced map, the agent port, the job lifecycle
  and the protocol, and recording which harness directories were found to be
  module candidates.

## Exit evidence

- Tests for approval, stale refusal after a plan change and after a source
  change, and the once-only approval record.
- The Map page in a real browser on a saved map, approved.
- The trial's map and review sheet. If pi cannot be logged in here, the trial
  is left open with the steps the person must take.
- Type check, tests and `npm run check:self` pass; the fixture's source,
  `module.ramify` files and `plan.md` are unchanged by mapping.
