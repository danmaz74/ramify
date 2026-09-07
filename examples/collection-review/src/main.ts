import { startApiServer } from './server.js';

/**
 * The Node entry point.
 *
 * It chooses the port and starts the listener beside it. Everything else the
 * process does belongs to `server.ts`, which is what lets a test start the
 * same program on a port the operating system picks.
 */

const port = Number.parseInt(process.env.PORT ?? '8787', 10);
const server = await startApiServer({ port });

console.log(`collection-review api listening on http://localhost:${server.port}`);
