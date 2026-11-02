import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const dirs: string[] = [];
function log(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'digest-reader-'));
  dirs.push(dir);
  writeFileSync(join(dir, `${night}.jsonl`), contents);
  return dir;
}
const event = { at: '2026-10-28T23:00:00+01:00', job: 'job', status: 'ok', owner: 'rook' };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('readNight', () => {
  it('reads the real fixture, including retries, recovery and null owners', () => {
    const digest = readNight('runs', night)!;
    expect(digest.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest.badLines).toBe(1);
    expect(digest.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest.rows[0].owner).toBeNull();
    expect(digest.rows[1]).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(digest.rows[2]).toMatchObject({ runs: 8, retries: 1, lastError: 'lock held' });
  });

  it('counts malformed JSON and invalid records without losing valid entries', () => {
    const invalid: unknown[] = [null, [], 3, 'text', {}, { ...event, owner: undefined },
      { ...event, owner: 3 }, { ...event, status: 'unknown' }, { ...event, error: null },
      { ...event, job: ' ' }, { ...event, at: 'yesterday' },
      { ...event, at: '2026-02-30T00:00:00Z' }, { ...event, at: '2026-10-28T24:00:00Z' }];
    const dir = log(['{broken', '', ...invalid.map(value => JSON.stringify(value)), JSON.stringify(event), ''].join('\n'));
    expect(readNight(dir, night)).toMatchObject({ badLines: invalid.length + 2, counts: { ok: 1, retry: 0, fail: 0 } });
  });

  it('uses chronological order across offsets and preserves the latest reported error after recovery', () => {
    const records = [
      { ...event, at: '2026-10-29T00:30:00+02:00', status: 'retry', error: 'latest error' },
      { ...event, at: '2026-10-28T23:00:00Z', owner: null },
      { ...event, at: '2026-10-29T00:00:00+03:00', status: 'fail', error: 'older error' },
    ];
    const digest = readNight(log(records.map(record => JSON.stringify(record)).join('\r\n')), night)!;
    expect(digest.rows).toEqual([{
      job: 'job', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: 'latest error',
      firstTime: '2026-10-29T00:00:00+03:00', lastTime: '2026-10-28T23:00:00Z',
    }]);
    expect(digest.counts).toEqual({ ok: 1, retry: 1, fail: 1 });
  });

  it('sorts jobs by code point and uses file order to break timestamp ties', () => {
    const records = [{ ...event, job: 'a' }, { ...event, job: 'Z' }, { ...event, job: 'a', owner: null, status: 'fail', error: 'failure' }];
    const digest = readNight(log(records.map(record => JSON.stringify(record)).join('\n')), night)!;
    expect(digest.rows.map(row => row.job)).toEqual(['Z', 'a']);
    expect(digest.rows[1]).toMatchObject({ owner: null, lastStatus: 'fail', lastError: 'failure' });
  });

  it('returns an empty digest for an empty file and null for missing or invalid nights', () => {
    const dir = log('');
    expect(readNight(dir, night)).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
    expect(readNight(dir, '2026-10-27')).toBeNull();
    for (const invalid of ['../2026-10-28', '2026-02-30', '2026-1-01', '2026-10-28/../2026-10-28', '']) {
      expect(readNight(dir, invalid)).toBeNull();
    }
  });
});
