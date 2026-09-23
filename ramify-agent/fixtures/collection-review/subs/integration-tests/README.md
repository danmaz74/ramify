# integration-tests

The integration tests of Collection Review: one Cucumber scenario that walks a
reviewer's work through both protocol surfaces of the assembled system, the
typed tRPC client and then an MCP session bound to part of a record's history.
It is a separately declared testing module, so its ordinary `src/` is classified
by its header, `[testing, dispatch]`, and it reaches the configured system only
through what the root exposes to its descendants.

The module exposes nothing. `cucumber.js` at the package root collects its
feature file and support code, and `npm run test:cucumber` runs it. Its World
and hooks are also the support code `ramify-agent.json` names for the
package's two execution modes: `TEST_MODE=quick` drives the system in process,
and `TEST_MODE=full` drives it over HTTP to the real listener, which the hooks
start on a loopback port before the first scenario and stop after the last.

The scenario is also reference case K05's fixture: its hook module is loaded
through two setup paths in one runtime, and the last step asserts that the
shared initialization ran exactly once.
