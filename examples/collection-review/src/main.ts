import { createServer } from 'node:http';

/**
 * The application's one API listener. The protocol mounts are assembled and
 * attached here; until they exist every request is answered as not found.
 */
const port = Number.parseInt(process.env.PORT ?? '8787', 10);

const server = createServer((request, response) => {
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not found', path: request.url ?? '/' }));
});

server.listen(port, () => {
  console.log(`collection-review api listening on http://localhost:${port}`);
});
