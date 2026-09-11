import { createConnection } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const { encodeMessage, decodeMessage } = await import(pathToFileURL(join(process.argv[2], 'dist/subs/daemon/src/client-entry.js')).href);
const socket = createConnection(process.argv[3]);
let bytes = Buffer.alloc(0), count = 0, message;
const timer = setTimeout(() => { socket.destroy(); process.exitCode = 1; }, 5000);
socket.once('connect', () => socket.write(encodeMessage({ type: 'hello', handshake: { protocol: 'ramify.ipc/0', client: { name: 'foreign-protocol', version: '0.0.0' }, buildKey: process.argv[4], engine: 'ramify.ts@0.0.0+typescript@7.0.2' } })));
socket.on('data', chunk => {
  bytes = Buffer.concat([bytes, chunk]);
  while (bytes.length >= 4 && bytes.length >= bytes.readUInt32BE(0) + 4) {
    const length = bytes.readUInt32BE(0) + 4; message = decodeMessage(bytes.subarray(0, length)); count++; bytes = bytes.subarray(length);
  }
});
socket.once('error', error => { clearTimeout(timer); console.error(error); process.exitCode = 1; });
socket.once('close', () => { clearTimeout(timer); console.log(JSON.stringify({ count, message })); });
