# Review Tasks

Review Tasks owns the inspection task: it calls the injected inspection port,
hands the report back to the validator it was given, and summarises the result.
The task is where one review's work happens, and it holds no transport, no
schedule, and no session state.

Its exported operations travel up to the review runtime and back down only
within that runtime's subtree. It never imports the controller that schedules
it, because the controller exposes upward only.
