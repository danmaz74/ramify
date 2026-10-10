1. **must-fix — The intervention history contradicts the paging contract.**

   **Location:** [Iteration 1, Deliverables](/home/app/ramify-plan35-debugger-ui/ramify-agent/docs/plans/35-breakpoint-debugger-ui/iterations/01-protocol-and-client.md:17) and [main plan, Ownership and existing seams](/home/app/ramify-plan35-debugger-ui/ramify-agent/docs/plans/35-breakpoint-debugger-ui/main-plan.md:73).

   The plan promises every intervention, limits the response to 500 entries, and explicitly ignores paging. It does not define which entries survive that limit or how older entries remain readable.

   **Evidence:** The existing [/debug handler](/home/app/ramify-plan35-debugger-ui/ramify-agent/subs/harness/src/http/app.ts:139) obtains its cursor from [eventPage](/home/app/ramify-plan35-debugger-ui/ramify-agent/subs/harness/src/projections/events.ts:410), which pages **all run events**, 500 at a time. Following that window can omit interventions even when there are fewer than 500 interventions. Independently returning the whole history instead conflicts with the proposed maximum.

   **Correction:** Define intervention paging explicitly. Reuse the existing cursor and drain pages, preserving command identity and refreshing previously admitted messages when their results change. Extend U02 with a page-boundary case and a settlement occurring after its admission page.

2. **must-fix — “Null until settled” discards the stopped/interrupted exchange states the UI must display.**

   **Location:** [Iteration 1, Deliverables](/home/app/ramify-plan35-debugger-ui/ramify-agent/docs/plans/35-breakpoint-debugger-ui/iterations/01-protocol-and-client.md:19), acceptance U02, and main plan “Converse.”

   The proposed projection says to use `debugResult` but return `null` until settlement. Those are different contracts. An exchange interrupted before settlement would remain indistinguishable from an engineer still answering.

   **Evidence:** [RunService.debugResult](/home/app/ramify-plan35-debugger-ui/ramify-agent/subs/harness/src/run/service.ts:3102) returns a non-null result immediately after admission. Without a settlement event, it derives `admitted`, `stopped`, or `interrupted`, including available terminal evidence. The plan’s conversation explicitly requires those terminal statuses.

   **Correction:** Project `debugResult` directly for message entries and render its `status`; reserve null for resume entries or genuinely unavailable results. Update U02 and add stop/server-loss cases with admission but no `debug-exchange-settled` event. This also avoids inventing a second exchange-state interpretation.

3. **must-fix — Version-triggered refresh can strand the debugger at a quiet pause.**

   **Location:** [Iteration 2, Deliverables](/home/app/ramify-plan35-debugger-ui/ramify-agent/docs/plans/35-breakpoint-debugger-ui/iterations/02-debugger-area.md:17), main plan “Polling,” and acceptance U11.

   The chosen hook does not provide the promised recovery after failed reads or commands that leave the run version unchanged. For example, if reading the newly reached pause fails once, the run can remain paused indefinitely without another version change to trigger recovery.

   **Evidence:** [useRunQuery](/home/app/ramify-plan35-debugger-ui/ramify-agent/subs/web/src/run-progress.ts:63) records the version before the read succeeds, reloads only when that version changes, and returns no reload function. `useRunProgress.refresh()` reloads events, but an unchanged version does not reload the debug query.

   **Correction:** Specify an explicit debug-query refresh path independent of version changes, plus retry after a failed read while the run remains paused. Test an unchanged-version refusal, an uncertain command followed by temporary query failure, and recovery from a failed pause-state read.

4. **should-fix — Inspection freshness must include pause identity, not just revision.**

   **Location:** [Main plan, Read the prepared input](/home/app/ramify-plan35-debugger-ui/ramify-agent/docs/plans/35-breakpoint-debugger-ui/main-plan.md:102) and acceptance U07.

   The stated invalidation rule only notices revision changes. An inspection from one assignment can therefore appear current at a later assignment with the same revision, or remain apparently current after resume.

   **Evidence:** [Breakpoint creation](/home/app/ramify-plan35-debugger-ui/ramify-agent/subs/harness/src/run/service.ts:4103) assigns each occurrence a new `pauseId` and resets its revision to `1`. [debugInspect](/home/app/ramify-plan35-debugger-ui/ramify-agent/subs/harness/src/run/service.ts:3091) checks both occurrence identity and revision.

   **Correction:** Bind the preview to `(planId, runId, pauseId, revision)`. Mark it historical or clear it when the occurrence disappears or changes. Extend U07 with two successive pauses at revision 1 and a resume without another inspection.

5. **should-fix — Iteration 1 omits the existing CLI consumer from the schema migration.**

   **Location:** [Iteration 1, Prerequisites and boundary / Verification and exit](/home/app/ramify-plan35-debugger-ui/ramify-agent/docs/plans/35-breakpoint-debugger-ui/iterations/01-protocol-and-client.md:5) and its manifest write boundary.

   Adding required `interventions` affects the CLI as well as the web client, but the iteration names only harness and web checks and changes. Existing CLI fixtures will fail the revised response schema.

   **Evidence:** [The CLI state reader](/home/app/ramify-plan35-debugger-ui/ramify-agent/src/debug-client.ts:60) validates responses using `debugStateResponseSchema`. Its [test fixture builder](/home/app/ramify-plan35-debugger-ui/ramify-agent/src/tests/debug-client.test.ts:33) omits `interventions`. The response schema is strict; the proposed snapshot default does not supply this separate field.

   **Correction:** Include the root CLI fixtures and focused debugger-client tests in iteration 1’s boundary and verification. Explicitly choose whether omitted `interventions` is accepted for compatibility or requires fixture migration, and retain the CLI’s existing cursor-draining behavior.

6. **should-fix — The browser witness’s registration instruction does not match configured discovery.**

   **Location:** [Iteration 3, Deliverables](/home/app/ramify-plan35-debugger-ui/ramify-agent/docs/plans/35-breakpoint-debugger-ui/iterations/03-qualification.md:32).

   “Register the witness” leaves an implementation trap: neither the named `scripts/browser-acceptance/breakpoint-debugger.ts` runner nor its browser fixture page is eligible for the native boundary registry.

   **Evidence:** [vitest.config.ts](/home/app/ramify-plan35-debugger-ui/ramify-agent/vitest.config.ts:17) discovers Node tests only under `src/tests/**/*.test.ts` and `subs/**/src/**/*.test.ts`, excludes web files from Node discovery, and [rejects registrations outside that discovery](/home/app/ramify-plan35-debugger-ui/ramify-agent/vitest.config.ts:46). Existing browser runners execute separately through package scripts.

   **Correction:** Choose the simpler existing pattern: keep this browser witness as an explicitly executed package script and report its receipt separately from the configured audit. If audit discovery is intended instead, name an eligible Node test wrapper and its exact registration as deliverables.