# Main-target reconciliation

The user changed the integration destination to `/ramify`, branch `ramify-agent`.
Main at `4401939572044d67445cc9e1c0f517b8a62af81c` already contained optimizations
1–8 and their delivered Plan 21 changes. The original target remains
`/home/app/ramify-plan21-project-boundary-adoption`, branch
`feat/plan21-project-boundary-adoption`, with delivered cuts 9–10 at
`a0343e09b3c3909b01673a63f6c2d12072c17bbc`. Earlier delivery/audit receipts remain
historical evidence for those captured inputs.

The coordinator created `/home/app/ramify-plan22-main-adoption`, branch
`perf/plan22-main-adoption`, from committed main and merged the original delivered
target. Reconciliation commit `51ebfcd7c728fe2a5a409af0c269eb7a08bc17b3` adopts
cuts 9–10 without source conflicts. This subagent changed only this worktree's
Plan 22 delivery documentation. Main's unfinished changes were not copied,
committed or edited.

All 213 paths changed specifically on main since the branches' merge base retain
byte-identical committed contents. This includes the main README/glossary prose
changes and EOF cleanup in seven historical evidence logs and
`subs/web/src/tests/session-page.test.tsx`. Harness source, test contracts,
package, lock, audit definition and Vitest configuration match the already
qualified delivered tree. All four readiness source hashes and all nine
hook/CLI source hashes match their original qualification receipts. Therefore
both original maps—20 readiness cases and 41 hook/CLI cases—and all retained
native callback bodies remain unchanged. The [compact receipt](main-target-reconciliation.json)
records hashes, prior audit refs and preservation provenance.

The original released full nested audits passed on their own captured sources:

| Cut | Audited source | Report commit |
| --- | --- | --- |
| 9 | `759fba7e6cfc759f926b7ac6e38293d832eb7f41` | `da413cbc684caf5985029425eac83e394775d338` |
| 10 | `0e6e2e475bc332f2a411e3fdb40fb270e09ef789` | `b3ffa41d9150c600fec01fa6c60307cc0ba4f8cc` |

Those passes do not qualify the new combined main candidate. Its released
**full nested audit is required and UNRUN at this handoff**; the coordinator
must complete it on the clean committed candidate before merging main. The
main merge and integrated main focused checks are also unrun by this subagent.

## Focused reconciliation qualification

From the new worktree's `ramify-agent/` directory:

```text
node_modules/.bin/vitest run subs/harness/src/tests/readiness.test.ts subs/harness/src/tests/readiness-boundaries.test.ts subs/harness/src/tests/readiness.boundary.test.ts subs/harness/src/tests/hook-checks.test.ts subs/harness/src/tests/hook-run-boundaries.test.ts subs/harness/subs/evidence/src/tests/ramify-cli.test.ts subs/harness/subs/evidence/src/tests/scripted-cli.test.ts subs/harness/src/tests/hook-checks.boundary.test.ts subs/harness/src/tests/composition.test.ts subs/web/src/tests/session-page.test.tsx --reporter=json --outputFile=/tmp/plan22-main-reconciliation-focused.json
node_modules/.bin/vitest list --filesOnly --json
```

All **111 cases passed**, with zero failures or skips: both optimization families,
all 11 composition cases and all 17 session-page cases. Original local guards
still verify zero launch attempts through ordinary setup, flow and cleanup;
that remains local guard evidence pending Plan 22 automatic root enforcement.
The actual readiness witnesses and timeout producer-retirement check also passed.

Authoritative configured discovery selects **267 files**: 250 Node and 17 web.
The prior separate case listing registered 2,039 cases in 266 nonempty files;
the existing conditional `fixture-trials.test.ts` remains selected but registers
no cases without its optional inputs. Source/configuration identity and EOF-only
code differences allow reuse of the original four compiler scopes and passing
self-check (0 errors, 0 warnings, 313 existing analysis limits). No contract,
configuration, production implementation or provider pin changed here.

The candidate uses the already qualified Plan 21 dependency installation at
exact committed pins. The coordinator separately refreshed main's stale local
installation with `npm ci`; it completed successfully and verified Ramify 0.4.1,
audit 0.7.2, Vitest 4.1.11 and TypeScript 7.0.2. Main's package, lock, index and
all seven pre-existing working-file hashes remained unchanged. The compact
receipt links that verification. Integrated main checks must still run after
its merge using the refreshed main installation.

Main remained at the captured base through this reconciliation. Complete
`git diff 4401939572044d67445cc9e1c0f517b8a62af81c HEAD --check` and last-commit
checks are required before handoff. This receipt records engineer observations;
it does not declare main integration, audit completion or Plan 22 completion.
