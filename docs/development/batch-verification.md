# Batch project verification

The installed `ramify` executable checks one whole project with a fresh analysis
session. It reads descriptions, compiler configuration and source; it does not
load application entry points. Each invocation releases its inputs and compiler
helpers before finishing. No daemon, MCP server or web listener is required.

From a clean toolkit checkout:

```sh
npm ci
npm run worktree:prepare
npm run build
npm run type-check
npm run check:reference
npm run check:self
```

The build bootstraps from source. `npm run production:files -- --root .` prints
its deterministic source selection. Production omits every testing-classified
area, including a testing module's ordinary `src/`; architectural checking and
test discovery still cover those files. Toolkit `allowJs` includes its owned
ESM process probe in source analysis. The example, scripts and site have separate
compiler configurations and contribute no source findings to toolkit self-check.

To install the built package into a consumer, run `npm install /path/to/ramify`.
Use `npx ramify check` inside a project or
`npx ramify check --root /path/to/project --format json`. An invocation from a
child directory still checks the whole discovered project. `--batch` is accepted.
`--help` and `--version` finish without loading the compiler or UI.

The CLI returns 0 for a completed check with no violations, 1 for invalid
descriptions/layout or definite source violations, and 2 for usage, unavailable
or incomplete execution. Interruption returns 130. Coverage limits and selected
files outside module source are visible but nonblocking. A compiler-blocked
construct is not an allowed access. The stricter reference gate requires the
reviewed capabilities and source witnesses even when the ordinary CLI can
complete with partial coverage. See the [invocation contract](../architecture/cli-invocation.spec.md).

## Public package entries

| Entry | Role |
| --- | --- |
| `ramify.ts`, `ramify.ts/analysis` | Disposable batch session and full analysis reports. |
| `ramify.ts/analysis/inventory` | Project/source inventory used by independent production tooling. |
| `ramify.ts/model` | Portable registry, identities and rule evaluation. |
| `ramify.ts/layout` | Portable geometry and neutral layout inputs. |
| `ramify.ts/presentation` | Teaching diagrams and React components. |
| `ramify.ts/cli` | Argument/output handling with an injected batch operation. |

Direct callers supply `AnalysisInputs`: an explicit project request, one resolved
registry, requested capabilities and finite limits. There is no registry or scope
configuration language to load. The reviewed limits and workload budgets are in
[scope.md](../plans/done/iteration-1-project-verifier/scope.md#workload-measurements-and-proposed-initial-limits).

```ts
import { createAnalysisSession } from 'ramify.ts/analysis';
import type { AnalysisInputs } from 'ramify.ts/analysis';

export async function check(inputs: AnalysisInputs, signal?: AbortSignal) {
  const session = createAnalysisSession(inputs);
  try {
    return await session.analyze({ signal });
  } finally {
    await session.dispose();
  }
}
```

One session admits one analyze call. Disposal is idempotent; reports are frozen,
plain data that remain usable after disposal. A batch UUID distinguishes runs;
the `input/1:` identity describes the captured root/configuration/scope/registry
and influencing bytes. It is not a daemon revision or a claim that the disk is
unchanged when the command exits.

## Acceptance evidence

`npm run reference:verify -- --plan 1` requires all 308 reviewed matrix instances.
It includes the unchanged fifteen-owner application, isolated negative and
positive fixtures, real CLI processes, toolkit self-check, and a package copied
outside the repository, installed from its own lockfiles, built and tested there.
The relocated package is packed and installed into a separate consumer without
development dependencies; its installed entries and executable must resolve
locally. Removing a record, handler, capability or assertion fails the gate.

`--iteration N` requires that iteration and all transitive prerequisites. It
cannot establish full plan completion. `npm run reference:report` also executes
the example's type-check, Vitest, Vite and Cucumber tiers and retains each
family's larger pending scope. `--dry-run` is inventory only. Portable reports
under `.reference-work/reports/` record actual assertions, identities and limits.
`npm run reference:cases` verifies the harness itself.

The [measurement recipes](../../scripts/measurements/README.md) retain setup,
cold-process peak and repeated-session results separately. These are additional
completion requirements; passing the source matrix alone does not establish a
memory budget. The [iteration 15 completion report](../plans/done/iteration-1-project-verifier/iterations/iteration15-results.md)
records what actually ran, unresolved findings and Plan 2's starting contracts.

Under Studio, follow the execution prompt's local-check policy. Automated
regression, scenario and sealed-file checks must be reported as pending until
their results arrive; a locally unrun suite is never a passing result.
