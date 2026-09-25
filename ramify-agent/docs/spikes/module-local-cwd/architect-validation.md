# Local architect module cwd spike: implementation validation

This note covers the local architect reader spike only. The isolated branch is
`spike/architect-module-cwd`, based on `a015ce0dba22e246e903f4d9f3637b0a79618cad` and implemented at
`3101ac30886734a8b2f8ff4f7264cc9af81f4ffe`. No change was merged into
the main checkout.

## Behavior

For an existing assigned module with `src/`, the harness starts pi with that
directory as the session working directory. It renders the same cwd into the
local architect prompt and resolves relative read activity against it. The
briefing gives absolute onboarding, API view and architect view paths, while
module identities and structured submission paths remain project-relative.
The local prompt starts with module evidence and uses the global architect
view for a specific remaining architecture question.

If the assigned module or its `src/` does not exist, the architect starts at
the project root. That cwd is pinned for every continued turn of the same
session, even after an engineer creates the module. The briefing names this
fallback and gives the proposed module's declaration, source and onboarding
paths where a proposal supplies its directory. The reader has only `read`,
`grep` and `ls`, with no shell or write authority. Engineer cwd behavior was
left as it was.

## Reproduction and verification

The new nested-module test was copied into a detached checkout at the base
commit and run there. Its baseline failure is retained in
[architect-baseline-regression.log](architect-baseline-regression.log): both
local architect turns received the project root; the assertion expected the
assigned `subs/workspace/subs/reviews/subs/notes/src`. The command exited 1.
This is a regression reproduction, not a passing baseline check.

| Checkout | Command (from `ramify-agent/`) | Result |
| --- | --- | --- |
| detached `a015ce0d` | `npx vitest run subs/harness/src/tests/work-item-api-views.test.ts` | 1 failed; cwd was project root in both turns |
| spike `3101ac30` | `npx vitest run subs/harness/src/tests/work-item-api-views.test.ts subs/harness/src/tests/work-items.test.ts subs/harness/src/tests/module-creation-integration.test.ts subs/harness/src/tests/scenario-briefings.test.ts` | 4 files, 23 tests passed |
| spike `3101ac30` | `npx vitest run subs/harness/src/tests/read-excursions.test.ts subs/harness/src/tests/single-session.test.ts` | 2 files, 16 tests passed |
| spike `3101ac30` | `npm run type-check` | passed |
| spike `3101ac30` | `npm run check:self` | passed; 0 errors, 0 warnings, 285 analysis limits |

After tightening the fallback briefing, the nested and proposed module suites
were rerun (2 files, 2 tests passed) and `npm run type-check` passed again.
The nested test reads a relative source path, verifies the project-relative
activity record, and checks both continued architect turns use the module
cwd. The root-module test checks the root module's own `src/`. The proposed
module test checks the fallback remains pinned after module creation and that
the briefing points to the proposed module, rather than the root README.

`check:self` reported partial coverage, including inferred signature limits;
its zero findings are not a claim of complete source analysis. These scripted
and integration tests establish cwd, briefing and event-recording behavior.
They do not establish live agent task quality, navigation efficiency or a
comparison with the global architect role.

## Local dependency setup

`npm ci` ran under this worktree's `ramify-agent/`; its `ramify.ts` package
link resolves to this worktree. The toolkit was built here with `npm run
build`. The worktree root's `node_modules` symlink reuses `/ramify/node_modules`
as dependencies without changing that install. A local
`ramify-agent/node_modules/.bin/ramify` symlink points to this worktree's
`dist/src/ramify` for the real CLI integration test. These dependency links
are ignored local setup, not committed source.
