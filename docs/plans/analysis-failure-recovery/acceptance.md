# Acceptance matrix

[Plan](main-plan.md). All cases are required. Case IDs are stable; split named
variants into independent assertions with variant names in execution evidence.
Fixture names below describe isolated copies created by the implementing
iteration, not fixtures already delivered. Tests belong in their owner's
`src/tests/`; shared helpers follow existing testing exposures.

## Fixtures

| Fixture | Contents and mutations |
| --- | --- |
| `recovery-small` | Root, provider and consumer modules; two exposed exports in one provider source; one allowed consumer import. A valid control has a completed passing check. Removing both exports without editing declarations creates invalid linking. |
| `recovery-boundaries` | A child module, owned-unwired tree, owned nested project, external tree, output, scratch/generated/dependency paths, nonexistent paths and supported symlink arrangements. Reuse existing project boundary fixtures and expectations. |
| `recovery-acquisition` | Independent variants: malformed root declaration, malformed child declaration, conflicting nested trees, unreadable/invalid configuration, root discovery failure and input mutation during sealing. |
| `recovery-history` | A valid state A; B removes an export; C changes another path while still invalid; D restores valid analysis. Variants make A or D completed with ordinary import violations, and inject changes after capture but before publication. |
| `recovery-runtime` | Controlled acquisition/session/clock/watcher adapters for deadline, crash, cancellation, unsupported setup, bounded retry exhaustion, watcher loss and eviction. Keep producer diagnostics with primary and related locations for equality assertions. |
| `recovery-wire` | Frozen old check/CLI/IPC examples plus new answered, invalid, incomplete, unavailable, service-error and not-checked documents. Include malformed payloads and a maximum-size refusal. |

## Cases

| ID | Boundary / fixture | Independently expected result | Iteration |
| --- | --- | --- | --- |
| FR01 | Schemas / `recovery-wire` | Every specified ownership variant decodes with its exit code; failure variants reject scope/inputId/paths. Old schemas reject added recovery fields. | 1, 2 |
| FR02 | Contracts / `recovery-wire` | Check/4 and CLI/2 preserve existing fields and accept recovery/stages only under the reviewed contract; Analysis/3 and ownership reject recovery. Both IPC carrier locations are explicit. | 1, 5, 6 |
| FR03 | Acquisition + CLI / `recovery-small` | Valid input answers ownership with the identical table used by affected; no catalog, link, import decisions, dependency query or daemon connection executes. | 2 |
| FR04 | Acquisition + analysis / `recovery-small` | After removing two exports, ownership still answers; full analysis is invalid and retains both diagnostics with all producer locations/identities. Affected refuses selection. | 2, 3, 6 |
| FR05 | Acquisition / `recovery-acquisition` | Each declaration/layout/configuration failure yields structured diagnostics, invalid or unavailable as appropriate, and no certified partial table or input identity. Root is canonical if established, else null. | 2, 3 |
| FR06 | Classification / `recovery-boundaries` | Absent/new/deleted files, `.`, directories, both owned tree kinds, external/output/scratch/generated/dependency paths and symlink cases match existing classification and discovery rules. | 2 |
| FR07 | CLI / `recovery-boundaries` | Default path `.`, repeated paths in first-request order, explicit/discovered roots and configuration discovery work. Outside/excluded answers exit 0. Malformed paths/options use CLI/2 exit 2 before acquisition. | 2, 6 |
| FR08 | Acquisition / `recovery-runtime` | Coherence changes retry at most three attempts; exhausted attempts and resource limits produce incomplete/2, unsupported setup unavailable/2, and cancellation 130 without an ownership answer. | 2 |
| FR09 | Adapters / `recovery-acquisition` | Parsing, configuration, layout, linking and compiler failure evidence survives analysis → assembly → service → CLI. Diagnostic IDs, codes, primary/related locations and stages equal producer evidence. | 3, 5, 6 |
| FR10 | Adapters / `recovery-runtime` | A failure without a report retains its execution reason and available evidence; crash, timeout, unsupported setup, invalid input and cancellation stay distinct. Formatter failure preserves the original cause. | 3, 5, 6 |
| FR11 | Limits / `recovery-wire` | Producer diagnostic truncation remains explicitly incomplete. Response limits refuse or use the existing explicit bounded outcome; no silent first-message reduction, fabricated location or invented stage. | 3, 5, 6 |
| FR12 | Contexts / `recovery-history` | At C, baseline is A and observed paths include changes from B and C and unsuccessful update attempts. D completes without reset and becomes the next baseline. | 4, 6 |
| FR13 | Contexts / `recovery-history` | Ordinary import violations are completed analysis and establish a baseline while the check exits 1. Invalid reports never replace it. | 4, 6 |
| FR14 | Contexts / `recovery-history` | Creation/deletion, both observed rename names, repeated paths and edit-then-restore are retained once in deterministic order. | 4 |
| FR15 | Contexts / `recovery-history` | An event arriving after D's captured sequence remains after D's publication reset; concurrent readers receive an immutable coherent recovery snapshot. | 4 |
| FR16 | Contexts / `recovery-runtime` | Initial invalid input has null baseline/unavailable coverage. Restart or context eviction cannot reuse the old baseline; established new context exposes its missing history. | 4, 5 |
| FR17 | Contexts / `recovery-runtime` | Watcher loss, path overflow and byte pressure retain bounded useful observations with explicit gaps. A later sweep cannot assert a complete past diff. | 4, 7 |
| FR18 | IPC / `recovery-wire` | Reported invalidity and unavailable outcomes carry value.recovery; service failure carries error.recovery with typed diagnostics/stages, never scalar details encoding. | 5 |
| FR19 | IPC / `recovery-wire` | New peers strictly round-trip evidence; malformed payloads fail. Old/new protocol pairings receive explicit incompatibility without sending new fields to old decoders. | 5, 7 |
| FR20 | CLI / `recovery-history` | Check/4 and CLI/2 preserve recovery from both service carrier locations, including not-checked outcomes with context evidence. Invocation errors without context omit it. | 6 |
| FR21 | CLI / `recovery-small` | Fresh batch analysis retains current diagnostics and no recovery; ownership omits recovery. Completed resident analysis reports remain Analysis/3 without recovery. | 6 |
| FR22 | CLI human + JSON / all small fixtures | JSON validates; human output starts with failed operation and located diagnostics, then unavailable evidence. Recovery is labeled observed history, without causal ranking or rollback advice. | 6 |
| FR23 | Views + affected / `recovery-history` | Invalid current analysis does not answer affected with empty success and does not publish mixed or stale current views. Earlier generated files retain their earlier identities until valid publication. | 6, 7 |
| FR24 | Built process / `recovery-history` | A→B→C→D works through the installed command, including request cancellation and subsequent repair, with explicit exit codes and no project/daemon reset. Owned processes all terminate at cleanup. | 7 |
| FR25 | Measurements / fixed and overflowing histories | 1,000 invalid revisions over 32 paths do not accumulate revision/session copies; more than 10,000 paths exposes overflow. Per-context/global bytes stay within configured limits and disposal releases recovery state. | 7 |
| FR26 | Measurements / small, toolkit, reference, S100 | Ten measured ownership/affected pairs per valid workload have archived timing/memory/identity evidence. Ownership starts zero daemons and executes zero full-analysis stages. Invalid ownership/affected contrast is recorded separately. | 7 |
| FR27 | Package and regressions | Isolated package imports ownership type/schema through ramify.ts/cli; valid/invalid ownership smoke passes. Build, type checks, tests, self/reference checks and reference-harness validation pass with recorded evidence. | 7 |

## Evidence rules

Use test titles containing case IDs. Each result records fixture/variant, command,
expected outcome, observed outcome, source/build identity and evidence location.
Direct tests, socket tests and built-process tests remain separate claims.
Tests failing because a later carrier is intentionally not wired are expected
intermediate gaps, never passing acceptance. Every row must pass by iteration 7.
Record pre-existing failures and suspected flakes under the project's testing
policy; do not discard them or broaden the claimed evidence.
