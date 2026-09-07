# Catalog

Catalog is the record-lookup feature. Its own source is the adapter layer: the
tRPC router and the MCP tools that carry its core's lookup and inspection onto
the two protocol surfaces. The adapters own argument parsing and result
adaptation, so the core they call stays transport-independent.

Catalog receives only a record id, a revision scope, and an observation
callback from a caller. Session and run identity belong to the review feature,
never to a catalog tool argument.
