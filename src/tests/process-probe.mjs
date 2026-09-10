// Preloaded only by process tests, including into the finite Node compiler helpers.
import childProcesses from 'node:child_process';
import dgram from 'node:dgram';
import fs from 'node:fs';
import promises from 'node:fs/promises';
import Module, { registerHooks, syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import { resolve } from 'node:path';

const trace = process.env.RAMIFY_CLI_TRACE;
if (!trace) throw new Error('The process probe requires its owned trace path');
const record = (event, data = {}) => fs.appendFileSync(trace, JSON.stringify({ pid: process.pid, event, ...data }) + '\n');
const parent = !process.argv[1]?.includes('-helper.');
const mode = parent ? process.env.RAMIFY_CLI_PROBE : '';
record('start', { argv: process.argv });
registerHooks({ load(url, context, nextLoad) {
  const loaded = nextLoad(url, context);
  record('load', { url }); return loaded;
} });
net.Server.prototype.listen = function () { record('listen'); throw new Error('CLI attempted to listen'); };
dgram.Socket.prototype.bind = function () { record('bind'); throw new Error('CLI attempted to bind'); };

const originalSpawn = childProcesses.spawn;
childProcesses.spawn = function (...args) {
  const child = Reflect.apply(originalSpawn, this, args);
  record('spawn', { child: child.pid, command: args[0], args: args[1] });
  child.once('close', (code, signal) => record('child-close', { child: child.pid, code, signal }));
  if (String(args[1]).includes('compiler-helper.') && child.stdin) {
    const write = child.stdin.write;
    child.stdin.write = function (...values) {
      if (String(values[0]).includes('"command":"catalog"')) {
        if (mode === 'fail-catalog') { record('resolver-fault'); throw new Error('Injected compiler catalog failure'); }
        if (mode === 'interrupt-catalog') {
          record('barrier', { stage: 'catalog' });
          setImmediate(() => process.kill(process.pid, 'SIGINT'));
        }
      }
      return Reflect.apply(write, this, values);
    };
  }
  return child;
};
// Guard alternate launch mechanisms too; the reviewed compiler integration uses spawn.
for (const method of ['exec', 'execFile', 'fork', 'spawnSync', 'execSync', 'execFileSync']) {
  const original = childProcesses[method];
  childProcesses[method] = function (...args) { record('other-launch', { method }); return Reflect.apply(original, this, args); };
}
let handles = 0, opened = 0, closed = 0, held = false;
const originalOpen = promises.open;
promises.open = async function (...args) {
  const handle = await Reflect.apply(originalOpen, this, args);
  handles++; opened++;
  const close = handle.close.bind(handle);
  let live = true;
  handle.close = async () => { try { await close(); } finally { if (live) { live = false; handles--; closed++; } } };
  if (mode === 'interrupt-acquisition' && !held && typeof args[0] === 'string'
    && resolve(args[0]) === process.env.RAMIFY_CLI_READ_TARGET) {
    held = true;
    const read = handle.read.bind(handle);
    handle.read = async (...values) => {
      record('barrier', { stage: 'acquisition' });
      process.kill(process.pid, 'SIGINT');
      await new Promise(done => setImmediate(done));
      return Reflect.apply(read, handle, values);
    };
  }
  return handle;
};
syncBuiltinESMExports();
process.on('exit', code => record('exit', { code, handles, opened, closed,
  commonjs: Object.keys(Module._cache), signalListeners: process.listenerCount('SIGINT') }));
