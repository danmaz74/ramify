# Explorer

Provides the resident explorer server's browser pages: a home page, the project explorer view and the module tree, all served through the token-free browser service.

The project explorer requests the behavioral dependency view of the displayed published revision once that
revision's project view is ready. It polls a pending result at most once per second while the page is visible,
stops on a ready, superseded or unavailable answer and shows a result only for the displayed revision and input
ID. A newer publication marks the displayed diagram stale; refresh loads the newest project view first and then
requests its dependencies. The dependency display settings are local to the mounted page.
