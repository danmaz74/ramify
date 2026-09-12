// Supply actual host stdin to the example, preserving its stdout/stderr/exits.
import { spawn } from 'node:child_process';
const child = spawn(process.execPath, [process.argv[2]], { stdio: ['pipe', 'inherit', 'inherit'] });
child.stdin.on('error', error => { if (error.code !== 'EPIPE') throw error; });
child.stdin.end(process.argv[3]);
child.on('error', error => { process.stderr.write(String(error)); process.exitCode = 2; });
child.on('close', (code, signal) => { process.exitCode = signal ? 2 : code; });
