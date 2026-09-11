<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 8 results: outbound transport and bounded log; daemon host blocked

**Recorded:** 2026-09-11. **Status:** incomplete. The private outbound writer and log writer are implemented; the shared-service host, process entry and all 22 required iteration-8 matrix instances remain absent.

Work was performed in the authoritative checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-2-resident-verification`, branch `workflow/iteration-2-resident-verification`, starting at `9de6a97`.

## Prerequisites and scope

Read CLAUDE.md, the iteration-work and testing skills, the development guides, iteration 8, the contracts, scope and ownership activation rules, the process architecture, iteration 5 and 7 handoffs, and the existing framing, discovery, records, launcher and tracing implementations. Ran `npm run worktree:prepare` successfully.

Live workflow detail marks iterations 3–7 completed and published. Its convergence step also reports a chat-fork error. Git history confirms the iteration-6 and iteration-7 branches were integrated; missing implementations are explicitly recorded in their predecessor handoffs, not explained by that convergence error.

The current source still has no `analyzeIncrement`, `resolveProject`, `createContextManager`, complete `RamifyService`, `DaemonService`, `WireMessage`, `connectDaemon`, connection state machine, `assembleResidentService` or `createQuickEnvironment`. The harness runtime registers only `harness-gate`. The root service interface contains the independent operation, capability, error and result vocabulary; the codec provides private JSON framing, without the complete message schema.

These are required providers for `StartDaemonOptions.service`, host dispatch, real leases, cancellation, notification validation, root assembly and the required quick-service IPC tests. Completing those earlier owners is outside the assigned iteration-8 scope. No substitute service, foreign context types, batch-backed daemon, partial public host contract or fake production entry was added. Existing launch primitives remain unchanged. No declaration names an unimplemented export.

## Implemented work

### Private outbound socket writer

New `subs/daemon/src/outbound.ts` implements `createOutboundWriter`, private to the daemon owner.

- Accepts an encoder and protocol event labels from its future host. It does not claim to validate WireMessage or dispatch requests.
- Encodes admitted frames once, copies their bytes to detach caller memory, and retains only bytes and replacement metadata.
- Assigns increasing event sequence numbers. Replaces only unsent revision/status events with the same context, subscription and type; accumulates the incoming count plus the replaced count plus one; places the replacement at the newest queue position. Eviction and control frames are not coalesced.
- Accounts for frame bytes, including headers, until Node's write callback releases them. Stops submitting writes after backpressure and resumes on drain. Coalescing never changes a frame already handed to the socket.
- Returns an oversized individual frame to the caller without replacing pending data or closing the connection. The future host must turn that result into the reviewed resource-unavailable response.
- Enforces inclusive byte/frame queue limits before retaining a new frame. Overflow clears pending state, notifies its owner once, attempts the slow-consumer goodbye, and destroys the socket within one second.
- Disposal, socket closure and write failure release queued frames and encoder/classifier/notification callbacks. Socket listeners and the closure deadline are cleaned up when the socket closes.

The close notification is an integration hook, not an implemented service lease release or daemon counter update. The future host must supply those through the real service. Limits passed to this private writer count complete framed bytes; the host must account for the four-byte header when applying the payload response limit.

### Private bounded log writer

New `subs/daemon/src/daemon-log.ts` implements `openDaemonLog`.

It validates the endpoint, opens an owned private regular file without following symlinks or accepting hard links, and appends UTF-8 JSON lines synchronously. Its file is capped at 8 MiB: a next entry exceeding the cap truncates the file before writing, keeping the same inode used by inherited append descriptors. An individually oversized entry is omitted whole. Opening an already oversized file truncates it. File size and private permissions are rechecked on writes, and close is idempotent.

This implements a bounded log primitive, not process-wide logging. Unmanaged stdout/stderr writes through the launcher's inherited descriptors remain outside this helper's bound. Production entry integration must establish that remaining process-wide requirement.

The daemon README documents both implementations and their limits. N3, public host types, package entries and harness capability registrations remain unchanged.

## Tests and direct evidence

Added 19 owner cases:

- `subs/daemon/src/tests/outbound.test.ts`: 11 cases, including both parameterized queue-limit cases. They cover newest-position coalescing, independent context/subscription/type keys, pre-coalesced count accumulation, retained-byte replacement accounting, oversized-frame recovery, exact byte/frame limits, real socket backpressure, the non-reading-peer deadline, disposal/listener cleanup, detached bytes, encoding failure and invalid limits.
- `subs/daemon/src/tests/daemon-log.test.ts`: eight cases, including three unsafe-file variants. They cover complete JSON lines, Unicode/newline preservation, permissions, exact 8 MiB size, same-inode rollover, oversized entries and existing files, externally appended bytes, symlinks, hard links, permission changes and idempotent close.
- `subs/daemon/src/tests/socket-fixture.ts`: testing-owned real Unix socket pairs with isolated temporary directories and awaited socket/listener teardown.

These tests are authored and type-checked. Vitest execution is reserved to workflow automation by the supplied check policy; no passing runner verdict is claimed.

Direct smoke `npx tsx .reference-work/iteration8-smoke.ts` passed six assertion groups on Linux, Node v22.23.2: real socket ordering/coalescing and control retention; oversized candidate preservation; socket-owned byte accounting and drain; non-reading-peer closure within two seconds and one release notification; frame-bound goodbye; and 8 MiB log rollover, JSON preservation, unsafe permission rejection and close. All fixtures were disposed. The final run completed in approximately 1.11 seconds.

The socket tests and smoke use the private transport writer, not startDaemon over the quick service. They receive no I2 ipc or process matrix credit. No compiled daemon entry exists, no daemon was launched, and no resident readiness, engine equality, lifecycle or entry footprint is claimed.

## Verification

| Command | Result |
| --- | --- |
| `npm run worktree:prepare` | Passed; example and site dependencies provisioned. |
| `npm run type-check` | Passed all four configurations after final source changes. |
| `npm run build` | Passed after final production changes. |
| `npx tsx .reference-work/iteration8-smoke.ts` | Passed all six direct assertion groups after final production changes. |
| `npm run check:self` | Passed: completed execution and complete coverage; 11 owners, 174 source files, 11 resources, 2,028 accesses; zero errors, warnings, denials or analysis limits. |
| `npm run reference:verify -- --plan 2 --iteration 8` | Failed, exit 1: 86 required, four passed, zero failed assertions, 82 required not executed. Overall 176 instances, 172 not executed; 90 are outside this filtered gate. |
| `git diff --check` | Passed. |

Initial type-check found two test socket data arguments requiring narrowing from string-or-buffer; both were corrected before the passing run. The scratch smoke initially had a missing closing brace; corrected before both successful executions. No production smoke assertion failure was observed. The final smoke/build/self-check followed the callback-release cleanup; the unchanged acceptance gate was not rerun because no capability or handler changed.

Ignored evidence: `.reference-work/iteration8-smoke.ts`, `iteration8-smoke.json`, `iteration8-self-check.log`, `iteration8-plan2-gate.log`, and portable gate report `.reference-work/reports/plan2-iteration8-b71983bc-4ce2-4a2a-80cd-fcef1b82dfb0.json`.

No Vitest/Cucumber regression, scenario-coverage or sealed-file check was run locally, following the automation-only policy. The daemon-entry smoke and client-entry import cannot run because their required providers and entries do not exist.

## Remaining exit criteria

All eight I2-14, four I2-15, five I2-16 and five I2-17 instances remain unexecuted. The other 60 required missing-capability instances belong to prerequisite increments, contexts and shared service.

Still required: the complete message codec/client/service providers; host handshake and validation, connection/request limits and queues; real leases and cancellation; atomic lifecycle orchestration and duplicate-peer refusal; idle/explicit/fatal shutdown and stopped promise; root resident process entry and argv; connector retry/recovery integration; process-wide bounded logging; N3/N4 activation; real quick-service IPC handlers; compiled-entry startup, duplicate, loss and eight-contender process evidence.

Checklist values remain honest: functionalRequirementsSatisfied false; newCodeCoveredByTests true; allNewTestsPass false pending the automated Vitest verdict. Submission of this checkpoint does not satisfy the iteration's completion gate.

## Recommendations for Next Iteration

Restore the missing providers in their owning tasks before proceeding to CLI work: increment/project resolution, contexts, shared service and root assembly/quick environment, then the complete codec/client connection. Resolve the predecessor handoffs' contract-review disposition through the owning workflow if still pending; publication status alone is not evidence that those contracts or implementations exist.

Resume iteration 8 against those actual public contracts. Integrate the private writer with the real schema encoder, service lease release and counters; integrate the bounded log into the production entry; implement startDaemon and the process entry; then execute every assigned ipc/process instance with isolated endpoints and verified child cleanup. macOS execution is still required by the plan.
