# Capability map to first work brief: spike

**Status:** Complete at the requested stopping point. Six `gpt-5.6-sol`
planning sessions produced three reviewed first-work briefs. Implementation
launches: **zero**. Read the [results and findings](results.md).

The three example requests live here only; they are not execution plans under
the toolkit's `plans/` directory. Their original content is preserved, with
move hashes in [input-moves.json](evidence/input-moves.json).

| Case | Example request | First work brief |
| --- | --- | --- |
| Small | [Copy a module ID](examples/copy-module-id/request.md) | [Module-tree copy interaction](runs/copy-module-id/first-work-brief.md) |
| Medium | [Share an explorer view](examples/share-explorer-view/request.md) | [Explorer navigation and restoration](runs/share-explorer-view/first-work-brief.md) |
| Large | [Dependency baselines](examples/dependency-baselines/request.md) | [Terminal baseline comparison](runs/dependency-baselines/first-work-brief.md) |

Each case runs through capability mapping, coordinator artifact review,
simulated map approval, and a fresh briefing architect's execution decision
and first-iteration brief. The stopping point is immediately before that
brief would be given to an implementation agent. No tests, fakes, contracts
or production changes are authored.

- [Protocol](protocol.md) fixes the boundaries and output shapes.
- [Run record](run.json) identifies the actual planning agents and status.
- [Trace](trace.jsonl) records actual planning transitions, not fabricated
  feature execution.
- [Original example selection](example-selection.md) records why these inputs
  were chosen. It is excluded from the agents' inputs.

The coordinator prepares shared generated evidence and validates the artifacts.
Map approval is explicitly a simulation assumption. Neither the artifact
review nor brief readiness approves implementation or establishes executable
acceptance. The root and work-loop design documents remain unchanged by this
experiment. Original outputs and correction requests remain beside the final
artifacts so the report distinguishes first-pass behavior from reviewed results.
