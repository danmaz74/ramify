<!-- ramify-agent feature-mapping procedure, version 1. Owned by the harness beside the architect prompt; the module-architect skill is used unchanged. -->
Map the plan one question at a time. Each step names the skill workflow that
answers it. Keep the plan's scope: map what it asks for, not what it could
grow into.

1. **Read the plan and orient.** Read the plan below, then
   `.ramify-architect/_meta.json` and `.ramify-architect/README.md`, the map of
   every module with its purpose and headline symbols. Note the coverage limits
   `_meta.json` reports; they bound what absence can prove.
2. **List the capabilities.** Restate the plan as the capabilities it needs,
   each in a sentence, in your own words. A capability is your interpretation;
   what Ramify records is behavior, and you keep the two apart.
3. **Find what exists.** For each capability, run the skill's discovery
   workflow. Stop at a confirmed candidate or after three narrowing searches.
4. **Decide availability for each reuse.** For each existing behavior a
   module will use, name the requesting module and its source area: `src` for
   ordinary source, `src/tests` for its tests. Call `materialize_api_view` for
   that module, then follow the skill's access workflow against the API view of
   that area:
   - **available**: the view lists the symbol. Cite the generated file that
     lists it, as a project-relative path such as
     `<module>/src/.ramify/external/<defining-file>.md`, and the import the
     requester would write.
   - **unavailable**: the view is complete (its `_meta.json` reports no
     `coverage`) and does not list the symbol. Give the exact exposure
     declarations each module on the path must add, as `module.ramify` lines.
   - **unknown**: anything else, such as a view with coverage limits that
     does not list the symbol, or a requester that is proposed or has no such
     source area. Give the reason.
5. **Place what is new.** For each capability discovery did not find, run the
   skill's placement workflow, which reads cognitive decomposition. Prefer an
   existing module; a new module is rare, and a proposed one names its parent,
   purpose and tags.
6. **Weigh the modules touched.** Every module the change touches, with a
   weight: `heavy` where most of the work falls, `light` for small changes,
   `exposure-only` for a module that only adds or relays exposure
   declarations. One sentence on why. The heavy modules are the map's most
   important finding.
7. **Name the seams.** A seam is a new or changed capability whose consumer
   is in a different branch from its owner: neither module is the other or
   beneath it. A capability used only by its owner's ancestors or descendants
   is not a seam.
8. **Fix the entry point.** The highest consumer of the feature, which must be
   among the modules touched, and the feature-level behavior that decides
   completion.
9. **Propose work items.** Group the capabilities that fall within one subtree
   into one vertical work item, and name its subtree root. Work in different
   branches is separate work items joined at a seam.
10. **Record assumptions and limits.** What you assumed, what you looked for
    and did not find (not found is not proof of absence), and the coverage
    limits of the architect view and of every API view you used.
11. **Cite evidence.** Every factual claim cites where it can be checked: a
    `view-record` (a line of `.ramify-architect/` or an API view file), a
    `declaration` (a `module.ramify`) or a `source` file, with a line number
    when you have one. Keep your judgment out of the evidence.
12. **Submit.** Call `submit_implementation_map`. If it is rejected, fix
    exactly the errors it lists, check the rest again, and submit once more.

Name every module by its declared-name path exactly as the architect view's
`module` field spells it, including the root module's name, such as
`shop/orders/pricing`. The harness checks mechanically that each named module
exists or is marked proposed, that each reused symbol exists under the owner
you name, and that each availability agrees with the requester's API view.
Whether the map is good architecture is judged by the person who approves it.
