# Engineering practices

Use these practices when implementing the
[architecture contracts](../architecture/README.md). They add to those
contracts; where a contract already decides something, the contract wins.

## Give behavior a clear owner

Expose a small interface that meets consumers' needs. Keep shared vocabulary
with its owner and private mechanisms local. Access is reviewed through the
declared Ramify tree, exposures and tags; a TypeScript export alone opens
nothing.

Compose services at the designated owner and inject the contracts each adapter
needs. Behavior shared by clients belongs in the service, and tests exercise
those same implementations through their supported interfaces.

## Validate inputs and represent outcomes clearly

Validate external input at its owning boundary: configuration, description
files, wire messages and paths, applying the operation's scope,
canonicalization and symlink policy. Errors identify the operation and the
input while preserving the cause. Keep valid empty results, unavailable
analysis, invalid input and internal failures distinct, as the result
contracts require.

## Give asynchronous work a lifetime

Every request, watcher, subscription, queue and retained result has an owner
and a release path on success, failure and cancellation, as the
[process](../architecture/processes-and-clients.md) and
[memory lifecycle](../architecture/memory-lifecycle.md) contracts specify.
Keep compiler objects within the analysis lifetime and return detached data
through public contracts. Justify any added cache, retry or infrastructure
with a concrete need and a reproducible measurement.

## Refactor source and declarations together

TypeScript rename tools do not update `module.ramify`, README references,
resource paths or the intended owner automatically.

1. Identify the affected owners, public contracts and consumers. Check the
   scope of any automated transformation and review its proposed edits.
2. Update source, declarations and related references together. Check exposure
   channels, interface wildcard expansion and forwarding aliases against the
   [format specification](../model/module-description.principles.md).
3. Type-check and test affected consumers, then run available Ramify checks.
   Until self-check exists, review ownership and exposures manually.

An export with no references in the loaded TypeScript program may still serve
external consumers or a declared public contract. Check those uses before
removal.
