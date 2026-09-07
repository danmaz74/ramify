# Collection Review

Collection Review is a small, complete application used as a reference for
authoring Ramify modules. It shows two fixed catalog records — one with an
intact two-revision history, one whose chain names a predecessor that resolves
to no revision — and runs one deterministic review over them. This root module
owns the Node entry point, the configured tRPC and MCP runtimes, and the
assembly that composes the feature adapters its descendants expose upward.

The package is self-contained: it declares its own dependencies and lockfile
and its own TypeScript, Vite, and Vitest configuration, and it imports no
source from the repository around it. `npm run dev:api` starts the API
listener, `npm run dev:web` serves the browser shell, and `npm run type-check`,
`npm test`, and `npm run build` gate every change.
