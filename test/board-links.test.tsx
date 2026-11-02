import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const dirs: string[] = [];

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-board-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('status board digest links', () => {
  it('links each night newest first with valid entry counts', async () => {
    const runsDir = fixture();
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
      JSON.stringify({ at: '2026-10-28T01:00:00Z', job: 'a', status: 'ok', owner: null }),
      JSON.stringify({ at: '2026-10-28T01:01:00Z', job: 'a', status: 'retry', owner: null }),
      JSON.stringify({ at: '2026-10-28T01:02:00Z', job: 'b', status: 'fail', owner: 'sam' }),
      '{bad json}',
    ].join('\n'));
    writeFileSync(join(runsDir, '2026-10-29.jsonl'), [
      JSON.stringify({ at: '2026-10-29T01:00:00Z', job: 'c', status: 'ok', owner: 'lee' }),
      JSON.stringify({ at: '2026-10-29T01:01:00Z', job: 'd', status: 'ok', owner: 'lee' }),
    ].join('\n'));
    mkdirSync(join(runsDir, 'not-a-night'), { recursive: true });

    const html = await (await createApp({ adapter: 'shim', installed: 'installed-at', beatEverySeconds: 60, runsDir }).request('/')).text();
    expect(html.indexOf('/digest/2026-10-29')).toBeLessThan(html.indexOf('/digest/2026-10-28'));
    expect(html).toContain('<a href="/digest/2026-10-29">2026-10-29</a> · ok 2 / retry 0 / fail 0');
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a> · ok 1 / retry 1 / fail 1');
    expect(html).toContain('<td>shim</td>');
    expect(html).toContain('<td>installed-at</td>');
    expect(html).toContain('last beat');
  });
});
