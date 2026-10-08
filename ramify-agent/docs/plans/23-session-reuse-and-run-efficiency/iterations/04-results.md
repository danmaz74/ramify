# Iteration 4 results: project-configured focused scenario commands

**Acceptance:** H05–H06 deterministic provider cases passed. Native F4/Q01
confirmation is explicitly pending iteration 14. Runtime briefing/tool wiring
belongs to iteration 10; no unmigrated runtime is described as qualified.

## Identity and boundary

- Worktree `/home/app/ramify-plan23-04-focused`, branch `feat/plan23-04-focused`.
- Base `544d205bc827a0ed801a23e5dd777c3765bef1ae`.
- Source head 1ffafd07a663b707a57be1f5b320c82bf84a5243.
- Delivery head is the commit containing this receipt; resolve exactly with
  `git log -1 --format=%H -- ramify-agent/docs/plans/23-session-reuse-and-run-efficiency/iterations/04-results.md`.
- Contract: frozen execution v1, C4 and independent F4 expectations.
- Six source/declaration/test paths and this receipt are within the exact
  iteration 4 reservation. No service, scenario-briefing/form, main checkout,
  central declaration, registry, manifest, audit selection or other worker changed.

## Implemented behavior

The evidence adapter resolves the target project's installed public
`@cucumber/cucumber/api` through `createRequire(<target cwd>/package.json)`.
It invokes `loadConfiguration` with the explicit source file, selected profiles,
provided options and exact supplied environment in an injected `CommandRunner`
process. Target authored configuration runs outside the harness process. The
returned effective `useConfiguration` is captured as serializable data; source
selection, target API path, config identity and actual command result remain in
the result. Missing/failed/truncated/malformed answers and unknown or
nonserializable/dynamic selection retain a limitation rather than guessed focus.
Scripted runner exceptions remain visible rather than swallowed as passing evidence.

The pure focused builder copies that effective flattened setup, replaces paths
with only assigned exact feature files, clears pending/name filters and source
sharding, and sets dryRun false. It preserves imports, require modules, loaders,
world parameters, absolute support paths and other project settings. The generated
JSON config contains one dedicated `ramify-focused` profile and no default profile.
The command explicitly names that config/profile with no CLI feature arguments;
Cucumber cannot merge the source default's broad paths or pending exclusion.
Relative assigned paths resolve against the declared source cwd, and support paths
retain the same cwd. No config write or scratch lifecycle occurs in this pure
provider; the consumer owns authorized scratch preparation and exact writes.

Shell classification separates help, version and dry-run from execution. A direct
`cucumber-js features/A.feature` invocation is unverified because default paths
may merge and pending may remain excluded. Only an exact generated config/profile
match against supplied prepared selection facts is focused. Extra filtering or a
missing matching fact is unverified. A mixed command retains an unverified earlier
Cucumber segment even when a later Vitest segment is focused. Existing whole-suite
refusal and focused Vitest behavior remain covered by the original shell tests.

## Provider API and iteration 10 handoff

Evidence exposes the function and all companions through its own declaration:

- `CucumberConfigurationSelection`: cwd, file (explicit path or false), profiles,
  provided options, environment, captured configurationIdentity and nodeExecutable.
- `loadCucumberConfiguration(selection, runner?)` returns
  `CucumberConfigurationResult`, available with selection/configuration/identity/
  apiPath/command or unavailable with reason and actual command (or null before
  dispatch). Config acquisition is external execution even when no scenarios run.
- `EffectiveCucumberConfiguration` is immutable captured effective data.

Harness `buildFocusedScenarioCommand({ effective, featurePaths, scratchDirectory,
cucumberExecutable })` returns unavailable or:

- exact cwd/environment and target argv plus safely quoted shellCommand;
- configPath/configText, config content identity and captured source identity;
- retained support metadata;
- `FocusedCucumberSelection` facts: cwd/config/profile/exact paths/config identity.

Integration must derive the explicit selected config/profiles/options/environment
from the target's actual declared command, retain their captured source identity,
and use the target's matching installed Cucumber executable. Unknown/dynamic
source command selection stays unavailable. Do not substitute the harness's
Cucumber config/support files or infer a working command from feature paths.

Write configText exactly at configPath in already permitted module scratch and
retain its lifetime through the focused invocation. Provide the returned selection
facts as `ShellTestFacts.focusedCucumber` to `classifyShellTestRun`; facts describe
prepared config content, not arbitrary filenames.
Read the installed scratch config immediately before classifying/invoking and
recompute its SHA256 against configurationIdentity. Missing or edited bytes
invalidate the prepared fact; never earn focused classification from a stale
path/profile fact alone. Regenerate/rebind with a new exact identity as needed.
The shell currently refuses only whole-suite classification. Iteration 10 must
apply existing refusal policy to unverified commands: never count them as focused
execution or let independently known merged broad defaults bypass suite refusal.
Unknown selection retains a limitation rather than invented execution evidence.
Current `shell.ts` obtains only
workingDirectory/testScripts internally and uses `childEnvironment()` without a
custom environment input. Iteration 10 must supply the prepared facts and ensure
the invocation uses the returned captured environment (or equivalent explicitly
recorded environment). Without that wiring, the provider's command is unverified
by the old shell owner. No shell policy/environment was widened here.

Brief engineers with the exact command, cwd, selected source configuration and
profiles, generated config identity, support/world/loader paths and available step
files. Retain unknown source/import provenance. Keep full audit checks broad and
unchanged. The classification category is not evidence that tests executed;
actual execution outcomes and architect completion remain separate facts.

## Iteration 14 native F4 recipe

Use reserved `subs/harness/src/tests/plan23-cucumber.boundary.test.ts` only after
its exact titles/claims are registered in the central boundary registry. Prepare
an isolated target fixture with pending A/B and unassigned U; declared default
`features/**/*.feature`, `not @ramify-pending`, world/step imports, loader marker
and worldParameters marker `declared-world`. Add a second source profile with
additional support, then acquire the real public effective config through this
adapter under the fixture's cwd/environment.

Write the returned generated profile in permitted scratch, invoke the target's
actual installed Cucumber using returned argv/cwd/environment, and record version,
package/API path, source/config identities, selected URIs, loader/world markers and
executed counters: A=1, B=1, U=0. Assert no pending/tag/name/shard exclusion or
source-default path merge, preserved absolute support and both declared profiles.
Separately load/run CLI `features/A.feature` with discovered default source setup:
its effective paths are broad/default plus A, pending is excluded, so it is not
verified focus and cannot substitute for the generated command. Help/version and
dry-run have zero executed scenario counters. Use native public loadSources or
runner messages for URI evidence. Do not resurrect retired harness scenario-to-
audit discovery or mapping. These native cases were not run in this iteration.

## Executed verification and limits

Dependency preparation `npm ci` passed with the committed manifest/lockfile intact.
Both ordinary and testing harness API views materialized, then were searched
separately before using exposed evidence CommandRunner/CommandRun contracts.
Ordinary metadata: coverage 1/truncated 1; testing: coverage 15/truncated 1.
Revision `rev/1:03ac7ac0-4c26-4f5b-9216-638b0916dbed:1`. These are partial views;
no missing-API inference or generated-file edit is claimed. Installed 13.2.1
public API/loadConfiguration, path-merge, defaults and profile conversion source
were inspected; the actual target resolves its own installed API at invocation.

From worktree ramify-agent:

```sh
npm run test:quick -- subs/harness/src/tests/shell-tests.test.ts subs/harness/src/tests/plan23-focused-scenarios.test.ts subs/harness/subs/evidence/src/tests/cucumber-configuration.test.ts --maxWorkers=2
npm run type-check
npm run check:self
```

Focused result: **3 files / 44 tests passed**, with explicit scripted external
answers and no native launches or refused launch attempts in final guard receipts.
The independent F4 fixture retains source broad paths and pending tags while
asserting literal A/B output, support/world/loader preservation, multi-profile
selection, missing/dynamic inputs, changed environment identity, cwd/absolute paths,
CLI-default negative control and nonexecution categories. A test.each typing issue
initially exposed spread array rows rather than the intended complete profile list;
corrected to named profile objects and reran the focused checks and type-check.
Final type-check passed all four compiler scopes. Structural check completed and
passed with 12 owners/650 source files, zero errors/warnings and **313 retained
analysis limits** (partial coverage). `git diff --check` and exact write-set
comparison passed.

Logs: `/tmp/ramify-plan23-iteration04/{focused,type-check,check-self}.log`;
final guard receipt selection: `/tmp/ramify-plan23-iteration04/process-receipts.json`.
No direct full suite, full audit, real Cucumber/provider invocation, trial,
performance comparison, push or merge ran. The known baseline native DataView
failure and final configured audit remain iteration 14 debt.

## Exact changed paths

- `ramify-agent/subs/harness/src/tests/plan23-focused-scenarios.test.ts`
- `ramify-agent/subs/harness/src/tools/shell-tests.ts`
- `ramify-agent/subs/harness/src/work/focused-scenarios.ts`
- `ramify-agent/subs/harness/subs/evidence/module.ramify`
- `ramify-agent/subs/harness/subs/evidence/src/cucumber-configuration.ts`
- `ramify-agent/subs/harness/subs/evidence/src/tests/cucumber-configuration.test.ts`
- `ramify-agent/docs/plans/23-session-reuse-and-run-efficiency/iterations/04-results.md`

## Accepted installed config-path correction

Native-witness preparation found that installed Cucumber 13.2.1 loads its
explicit configuration with `path.join(cwd, file)`. The earlier absolute
`--config` argument therefore prepended cwd again. Provider amendment
`ebe1fd88ac9712dc383e44f62a4906468f7cbdd1`, integrated at
`7b06f768d45f42546681903d60e5c04fe7b259fd`, supplies a normalized cwd-relative
command argument while retaining the absolute `configPath` and selection
identity for writes and validation. Source configuration, exact pending A/B
selection, cleared filters, support, world, loader and environment are unchanged.

The integrator ran the shell classifier, focused scenario builder and effective
configuration adapter files together: **3 files, 46 tests passed**, including
independently specified internal and external quoted scratch paths, the old
absolute-argument negative control and changed-authority refusal. All four
configured type checks passed. Structural validation passed with zero errors,
zero warnings and 317 analysis limits; it completed every configured stage with
partial analysis coverage. Logs are
`/tmp/ramify-plan23-integrated-cucumber-path-{focused,types,structure}.log`.

This is ordinary command/path validation, not native execution. Iteration 10
must deliver the returned command unchanged; iteration 14 must execute it with
the actual installed CLI at the declared cwd. Native preparation is recorded in
`/tmp/plan23-native-cucumber-inventory.md`, with fixed A=1, B=1, U=0 execution
counts and separate broad-default and nonexecution controls. Q01 remains open.
