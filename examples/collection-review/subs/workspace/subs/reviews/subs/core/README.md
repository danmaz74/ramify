# Review Core

Review Core owns the review runtime. It declares the inspection port the review
depends on, schedules one task, and drives that task with the controller child
until it has a result. Whoever assembles the application supplies a port that
fits; the runtime never names the implementation behind it.

The port travels upward as part of the runtime's contract and downward to the
controller and task children that work against it. Nothing here imports a
protocol client, and nothing here is visible to the validator that the task
calls.
