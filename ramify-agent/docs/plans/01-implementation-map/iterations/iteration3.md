# Iteration 3: The architect on pi

**Goal:** the mapping job on real evidence, with a real architect session on
pi producing a validated map.

## Scope

- **`harness/agent/pi`**, declared with its README: the only importer of pi,
  implementing the port as iteration 0 found it can. The spike directory is
  deleted.
- The mapping job's real steps 1 to 8 of
  [the mapping job](../main-plan.md#the-mapping-job): the full input manifest
  (plan hash, commit and dirtiness, prompt, procedure and skill versions,
  Ramify version), `ramify materialize --view architect` through the CLI with
  the view revision, coverage and input identity from
  `.ramify-architect/_meta.json`; `materialize_api_view`; read and search
  tools only; `submit_implementation_map`; activity events; the inputs-changed
  failure at every materialization and before publication.
- Validation against the views, exactly the mechanical checks listed under
  [the implementation map](../main-plan.md#the-implementation-map), and the
  bounded correction: errors returned to the same session at most twice.
- The architect prompt and the feature-mapping procedure, versioned files
  owned by the harness beside each other. The module-architect skill is used
  unchanged.

## Exit evidence

- Fake-driven tests: an invalid submission corrected once; rejection after
  the bound; an availability contradicted by the requester's API view
  rejected; one stated for a requester never materialized rejected; a source
  change during a job fails it as inputs changed and saves nothing.
- The pi adapter's tests without a network (event translation, submission
  tool, stop), against pi's API in a way that does not call a model.
- A real session on the fixture saving a valid map, if pi can be logged in
  here. If it cannot, record exactly what the person must do and leave this
  item open; do not substitute the fake.
- Type check, tests and `npm run check:self` pass.
