import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDigestApi } from '../src/digest/api.js';
import type { RigConfig } from '../src/config.js';

describe('digest API', () => {
  let root: string;
  let runsDir: string;
  let app: ReturnType<typeof createDigestApi>;
  const config = (): RigConfig => ({
    adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir,
  });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rig-digest-api-'));
    runsDir = join(root, 'runs');
    mkdirSync(runsDir);
    app = createDigestApi(config());
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('returns the complete digest including sorted rows and counts', async () => {
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
      JSON.stringify({ at: '2026-10-28T08:00:00+01:00', job: 'zeta', status: 'ok', owner: null }),
      JSON.stringify({ at: '2026-10-28T08:01:00+01:00', job: 'alpha', status: 'retry', owner: 'Ada', error: 'timeout' }),
    ].join('\n'));

    const response = await app.request('/2026-10-28');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      night: '2026-10-28',
      rows: [
        {
          job: 'alpha', owner: 'Ada', runs: 1, retries: 1, lastStatus: 'retry', lastError: 'timeout',
          firstTime: '2026-10-28T08:01:00+01:00', lastTime: '2026-10-28T08:01:00+01:00',
        },
        {
          job: 'zeta', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
          firstTime: '2026-10-28T08:00:00+01:00', lastTime: '2026-10-28T08:00:00+01:00',
        },
      ],
      badLines: 0,
      counts: { ok: 1, retry: 1, fail: 0 },
    });
  });

  it.each(['2026-10-29', 'not-a-date', '2026-02-30'])('returns 404 for missing or invalid night %s', async (night) => {
    const response = await app.request(`/${night}`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'night not found' });
  });

  it('returns an empty digest for an existing empty file', async () => {
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '');

    const response = await app.request('/2026-10-28');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      night: '2026-10-28', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('returns 200 and includes malformed lines in badLines', async () => {
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), 'not json\n');

    const response = await app.request('/2026-10-28');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      night: '2026-10-28', rows: [], badLines: 1, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });
});
