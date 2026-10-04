// Test-only observation at the real filesystem/socket boundary. The production
// CLI and daemon import no probe and have no knowledge of these controls.
import fs from 'node:fs';
import promises from 'node:fs/promises';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';
import { threadId } from 'node:worker_threads';

const trace = process.env.RAMIFY_CLI_TRACE;
const root = process.env.RAMIFY_HOOK_PROJECT;
const record = (event, fields) => fs.appendFileSync(trace,
  JSON.stringify({ pid: process.pid, threadId, event, ...fields }) + '\n');
const relevant = path => typeof path === 'string' && root &&
  (resolve(path) === root || resolve(path).startsWith(root + '/'));
for (const [owner, methods] of [[promises, ['readFile', 'open']], [fs, ['readFileSync', 'readFile', 'openSync']]]) {
  for (const name of methods) {
    const original = owner[name];
    owner[name] = function (...args) {
      if (relevant(args[0])) record('hook-read', { path: resolve(args[0]), method: name });
      return Reflect.apply(original, this, args);
    };
  }
}
let rewritten = false;
const write = net.Socket.prototype.write;
net.Socket.prototype.write = function (chunk, ...rest) {
  if (chunk instanceof Uint8Array && chunk.length > 4) {
    const bytes = Buffer.from(chunk);
    if (bytes.readUInt32BE(0) === bytes.length - 4) {
      let message;
      try { message = JSON.parse(bytes.subarray(4).toString('utf8')); } catch { /* Not a JSON frame. */ }
      if (message?.type === 'request' && message.op === 'check') {
        record('hook-check', { params: message.params });
        const target = process.env.RAMIFY_HOOK_REWRITE;
        // The first delta request carrying the CLI's content hash; the classification request before it carries none.
        if (!rewritten && target && message.params.scope === 'delta' && message.params.freshness?.expect?.length > 0) {
          rewritten = true;
          fs.appendFileSync(target, '\n// written after the CLI content hash\n');
          record('hook-rewrite', { path: target });
        }
      }
    }
  }
  return Reflect.apply(write, this, [chunk, ...rest]);
};
syncBuiltinESMExports();
