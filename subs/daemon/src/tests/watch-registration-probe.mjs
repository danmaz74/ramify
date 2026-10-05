// Observation only: records each directory the process registers with fs.watch and each
// registration's close, one JSON line per event, in the file RAMIFY_WATCH_TRACE names.
// It never manufactures, holds or drops an event.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const trace = process.env.RAMIFY_WATCH_TRACE;
if (trace) {
  const record = (event, directory) => fs.appendFileSync(trace, JSON.stringify({ pid: process.pid, event, directory }) + '\n');
  const watch = fs.watch;
  fs.watch = function (...args) {
    const watcher = Reflect.apply(watch, this, args);
    const directory = String(args[0]);
    record('watch', directory);
    watcher.once('close', () => record('close', directory));
    return watcher;
  };
  syncBuiltinESMExports();
}
