# Ramify agent instructions

Read [CLAUDE.md](CLAUDE.md) for the shared project instructions. They apply to
both Claude and Codex work in this directory, including when Ramify is nested
inside another repository.

The [development guides](docs/development/README.md) describe implementation,
testing, engineering practices and use of cucumber-viz. Use the relevant local
skills listed there; `.agents/skills/` links to the canonical `.claude/skills/`
files. Model authority and runtime decisions remain in their owning documents.

## Foreign API discovery

Search generated foreign API documentation before inventing a cross-module API.

Ordinary source:
  rg -n -i -C 6 '<terms>' src/.ramify/{external,children}

Testing source:
  rg -n -i -C 6 '<terms>' src/tests/.ramify/{external,children}

Each view is complete for its source area; do not combine them.
The catalogs are generated and gitignored. Never edit or import from them.
Refresh a missing or stale view with `ramify materialize --from <path>`.
If materialization reports coverage limits, absence is not proof that no API exists.

An explicit `.ramify` path makes `rg` traverse the hidden, ignored directory; a
plain recursive `rg` from the module never shows it, so name the path above.
See the [materialized API discovery specification](docs/architecture/materialized-api-view.spec.md)
for the full model.
