# Reviews

Reviews is the review feature. Its own source is the adapter layer — the tRPC
router, the MCP tools, and the review-session table that records what each
session is bound to — over a runtime it assembles from its children.

The session wrapper resolves the current binding separately for every list and
every call, then takes one immutable snapshot for that invocation. The outcome
type the adapters name stops here: the views downstream receive values and
callbacks instead of the runtime's own type.
