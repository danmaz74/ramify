---
name: iteration-work
description: Implement an assigned Ramify iteration or an approved plan using its ownership, prerequisite and verification contracts. Use for roadmap execution, not for creating a new plan or orchestrating nested Studio workflows.
---

# Iteration work

Read the active plan, assigned iteration, relevant predecessor handoffs and
[implementation workflow](../../../docs/development/implementation-workflow.md).
Apply the project's [agent instructions](../../../CLAUDE.md) and the relevant
[engineering practices](../../../docs/development/engineering-practices.md).

Identify whether this is a Studio-managed iteration or direct work. In Studio,
complete the assigned scope and return evidence through the supplied controls;
the server owns subsequent scheduling and managed commits. In direct work,
complete the scope the user authorized. Neither mode requires a nested agent
or permits changing a settled contract.

Verify prerequisites, implement through the declared owner contracts, and retire
the substitutes named by the iteration when their real path works. Record
necessary scope changes or provider gaps; continue independent authorized work
when a required decision is pending.

Run the iteration's required checks using the
[testing guide](../../../docs/development/testing.md). Review the resulting diff
and report implemented behavior, executed checks, deviations, remaining limits
and successor inputs. Expected intermediate failures are not a passing final
acceptance gate. Preserve the user's existing edits and do not start a separate
plan/status/commit loop.
