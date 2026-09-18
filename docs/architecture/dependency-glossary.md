# Dependency Glossary

**Status:** Draft

## Purpose

Define the vocabulary used to classify dependencies in Ramify analysis and
visualization. These classifications describe static source evidence. They do
not assert that a code path executes at runtime.

The preferred broad distinction is **behavioral dependency** versus
**non-behavioral dependency**. The split is a deliberately statistical estimate,
not a runtime call graph. The two headline counts include only referenced,
classified symbol dependencies. They exclude unused imported symbols,
symbol-free module loads, and dependencies whose classification is unknown.

A *capability*, the purpose an architect ascribes to symbols, is not a
dependency term; the [agents glossary](../agents/glossary.md) defines it
against the behavioral terms below.

**Call dependency** names the narrower case with direct invocation evidence.
The terms **functional dependency** and **non-functional dependency** are not
used because they have established, unrelated meanings in database design and
software quality requirements.

## Dependency

A **dependency** is a directed relationship in which source owned by one Ramify
module accesses source or a symbol owned by another Ramify module.

## Symbol dependency

A **symbol dependency** is a dependency identified by the ordered pair of a
consumer module and a provider-owned original symbol that the consumer
references.

## Original symbol identity

**Original symbol identity** is the defining symbol reached after resolving
aliases and forwarding exports.

## Dependency count

A **dependency count** is the number of distinct symbol dependencies: repeated
references, import sites, and aliases in one consumer module count once, while
two consumer modules referencing the same original symbol count once each.

## Dependency evidence

**Dependency evidence** is a statically observed import, export, reference,
call, construction, or module load supporting a dependency classification.

## Behavioral dependency

A **behavioral dependency** is a symbol dependency with at least one
behavioral reference; behavioral evidence takes precedence when the same
dependency also has non-behavioral evidence.

## Call dependency

A **call dependency** is a behavioral dependency with a statically resolved
call expression whose invoked signature belongs to the provider module.

## Construction dependency

A **construction dependency** is a behavioral dependency with a statically
resolved construction expression whose construct signature belongs to the
provider module.

## Callable-reference dependency

A **callable-reference dependency** is a behavioral dependency in which a
callable value from the provider is referenced in a value position without a
directly attributable call or construction. Passing a function as a callback
is a callable-reference dependency.

## Non-behavioral dependency

A **non-behavioral dependency** is a symbol dependency supported only by type,
data, or forwarding references and with no identified behavioral evidence.

## Data dependency

A **data dependency** is a non-behavioral dependency in which the consumer
references a runtime value that is not behavior-capable, such as a numeric,
string, boolean, enum, or data-only object value.

## Type dependency

A **type dependency** is a non-behavioral dependency in which the consumer
requests or references only compile-time type information supplied by the
provider.

## Forwarding dependency

A **forwarding dependency** is a non-behavioral dependency in which the
consumer re-exports a provider-owned original without identified behavioral
use.

## Initialization dependency

An **initialization dependency** is a module-load dependency without an
attributable original symbol, such as a side-effect import; it remains access
evidence but is outside the behavioral and non-behavioral symbol counts.

## Unused imported symbol

An **unused imported symbol** is a selected binding with no statically
identified reference outside its import declaration; it is excluded from the
behavioral and non-behavioral symbol counts.

## Mixed-evidence dependency

A **mixed-evidence dependency** is a symbol dependency with both behavioral and
non-behavioral evidence; it is classified as behavioral.

## Unknown dependency

An **unknown dependency** has cross-module symbol evidence but cannot be
classified because symbol resolution, reference discovery, or behavior
classification is incomplete; it is excluded from both counts and reported as
a coverage limit.

## Behavior-capable symbol

A **behavior-capable symbol** is a resolved runtime value whose TypeScript type
is callable or constructable, or a class, object, or namespace with at least
one declared first-level callable or constructable member.

## Callable symbol

A **callable symbol** is a resolved runtime value whose TypeScript type has at
least one call signature.

## Constructable symbol

A **constructable symbol** is a resolved runtime value whose TypeScript type has
at least one construct signature.

## Behavioral reference

A **behavioral reference** is a value-position reference to a
behavior-capable symbol: a call, a construction or a callable reference.

## Value-position reference

A **value-position reference** is a source reference that consumes a runtime
value rather than using a symbol only as type information.

## Type-position reference

A **type-position reference** is a source reference that consumes a symbol only
as compile-time type information.

## Direct evidence

**Direct evidence** is a statically resolved call, construction, or other
recognized invocation form tied to a provider-owned signature.

## Proxy evidence

**Proxy evidence** is a statically resolved value-position reference to a
behavior-capable provider-owned symbol without an attributable direct
invocation.

## Runtime execution

**Runtime execution** is an observed invocation in a running program. Static
dependency classification does not establish runtime execution.
