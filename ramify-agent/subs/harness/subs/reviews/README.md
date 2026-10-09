# Reviews

Prepares mechanical review evidence against a fixed audited candidate and validates reviewer submissions against the evidence delivered in that attempt. This module owns snapshot path restrictions and tools, bounded patch delivery, captured design guidance and review briefings. It receives Git facts through the evidence contract and makes no semantic judgment about the candidate.

Harness owns reviewer sessions, scheduling, deadlines, durable records and CheckFinding coordination. `prepareReview` returns the briefing, candidate patch section, read tools and a validator whose inspection evidence remains private to this preparation. Complete delivered patches can establish inspection coverage; a concern's ground still requires an actual `snapshot_read` in the current attempt. The inline patch budget remains 200 KiB.
