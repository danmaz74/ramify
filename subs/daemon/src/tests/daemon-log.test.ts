import { appendFile, chmod, link, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { openDaemonLog } from '../daemon-log.js';
import { discoveryFixture } from './discovery-fixture.js';

const entry = { at: 123, level: 'info' as const, event: 'owner-test', message: 'é\n🙂',
  context: 'ctx', generation: 'gen', revision: 'rev', request: 'request' };
const maximumBytes = 8 * 1024 * 1024;

describe('private daemon JSON-line log', () => {
  it('appends complete entries to a private file and closes idempotently', async () => {
    const f = await discoveryFixture();
    try {
      const log = await openDaemonLog(f.endpoint);
      try {
        log.log(entry); log.log({ ...entry, message: 'second' });
        const text = await readFile(f.endpoint.log, 'utf8');
        expect(text.endsWith('\n')).toBe(true);
        expect(text.trimEnd().split('\n').map(line => JSON.parse(line))).toEqual([entry, { ...entry, message: 'second' }]);
        expect((await stat(f.endpoint.log)).mode & 0o777).toBe(0o600);
      } finally { log.close(); log.close(); }
      expect(() => log.log(entry)).toThrow('closed');
    } finally { await f.dispose(); }
  });

  it('accepts exactly eight MiB and rolls over on the next entry without replacing the inode', async () => {
    const f = await discoveryFixture();
    try {
      const log = await openDaemonLog(f.endpoint);
      try {
        const empty = { ...entry, message: '' };
        const size = Buffer.byteLength(JSON.stringify(empty) + '\n');
        log.log({ ...empty, message: 'x'.repeat(maximumBytes - size) });
        const full = await stat(f.endpoint.log);
        expect(full.size).toBe(maximumBytes);
        log.log(entry);
        const rolled = await stat(f.endpoint.log);
        expect(rolled.ino).toBe(full.ino);
        expect(rolled.size).toBe(Buffer.byteLength(JSON.stringify(entry) + '\n'));
        expect(JSON.parse(await readFile(f.endpoint.log, 'utf8'))).toEqual(entry);
      } finally { log.close(); }
    } finally { await f.dispose(); }
  });

  it('omits an oversized entry whole and bounds a preexisting oversized file on open', async () => {
    const f = await discoveryFixture();
    try {
      await writeFile(f.endpoint.log, 'x'.repeat(maximumBytes + 1), { mode: 0o600 });
      const log = await openDaemonLog(f.endpoint);
      try {
        expect((await stat(f.endpoint.log)).size).toBe(0);
        log.log(entry);
        log.log({ ...entry, message: 'x'.repeat(maximumBytes) });
        expect(JSON.parse(await readFile(f.endpoint.log, 'utf8'))).toEqual(entry);
      } finally { log.close(); }
    } finally { await f.dispose(); }
  });

  it('rechecks size after writes through another append descriptor', async () => {
    const f = await discoveryFixture();
    try {
      const log = await openDaemonLog(f.endpoint);
      try {
        log.log(entry);
        await appendFile(f.endpoint.log, 'x'.repeat(maximumBytes));
        log.log({ ...entry, message: 'current' });
        expect(JSON.parse(await readFile(f.endpoint.log, 'utf8'))).toEqual({ ...entry, message: 'current' });
      } finally { log.close(); }
    } finally { await f.dispose(); }
  });

  it.each(['symlink', 'hardlink', 'permissions'] as const)('rejects an unsafe %s log without changing its target', async kind => {
    const f = await discoveryFixture();
    const target = `${f.endpoint.log}.target`;
    try {
      await writeFile(target, 'preserved', { mode: 0o600 });
      if (kind === 'symlink') await symlink(target, f.endpoint.log);
      else if (kind === 'hardlink') await link(target, f.endpoint.log);
      else await writeFile(f.endpoint.log, 'preserved', { mode: 0o644 });
      await expect(openDaemonLog(f.endpoint)).rejects.toThrow();
      expect(await readFile(target, 'utf8')).toBe('preserved');
      expect(await readFile(f.endpoint.log, 'utf8')).toBe('preserved');
    } finally { await f.dispose(); }
  });

  it('rejects an unsafe endpoint and detects permission changes on the open file', async () => {
    const f = await discoveryFixture();
    try {
      await chmod(f.endpoint.directory, 0o755);
      await expect(openDaemonLog(f.endpoint)).rejects.toThrow('0700');
      await chmod(f.endpoint.directory, 0o700);
      const log = await openDaemonLog(f.endpoint);
      try {
        await chmod(f.endpoint.log, 0o644);
        expect(() => log.log(entry)).toThrow('Unsafe');
        expect((await stat(f.endpoint.log)).size).toBe(0);
      } finally { log.close(); }
    } finally { await f.dispose(); }
  });
});
