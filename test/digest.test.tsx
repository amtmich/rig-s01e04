import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const night = '2026-10-28';
const dirs: string[] = [];
function runsDir(contents?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'digest-routes-'));
  dirs.push(dir);
  if (contents !== undefined) writeFileSync(join(dir, `${night}.jsonl`), contents);
  return dir;
}
function config(dir: string) {
  return { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir };
}
function record(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('digest routes', () => {
  it('serves the same sorted jobs and digest rows as HTML and JSON', async () => {
    const contents = [
      { at: '2026-10-28T23:00:00+01:00', job: 'z-last', status: 'fail', owner: null, error: 'failed' },
      { at: '2026-10-28T22:00:00-04:00', job: 'a-first', status: 'retry', owner: 'rook', error: '<script>bad()</script>' },
      { at: '2026-10-28T23:01:00+01:00', job: 'a-first', status: 'retry', owner: 'rook' },
      { at: '2026-10-28T23:02:00+01:00', job: 'a-first', status: 'retry', owner: 'rook' },
      '{malformed',
    ].map(value => typeof value === 'string' ? value : record(value)).join('\n');
    const app = createApp(config(runsDir(contents)));

    const [page, api] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    const html = await page.text();
    const digest = await api.json();
    expect(digest).toMatchObject({ night, badLines: 1 });
    expect(digest.rows.map((row: { job: string }) => row.job)).toEqual(['a-first', 'z-last']);
    expect([...html.matchAll(/<tr[^>]*data-job="([^"]+)"/g)].map(match => match[1])).toEqual(
      digest.rows.map((row: { job: string }) => row.job),
    );
    expect(digest.rows[0]).toMatchObject({ retries: 3, lastError: '<script>bad()</script>' });
    expect(digest.rows[1]).toMatchObject({ owner: null, lastStatus: 'fail' });
    expect(html).toContain('—');
    expect(html).not.toContain('<script>bad()</script>');
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
    // Compare actual instants across offsets while preserving the source strings.
    expect(digest.rows[0].firstTime).toBe('2026-10-28T23:01:00+01:00');
    expect(digest.rows[0].lastTime).toBe('2026-10-28T22:00:00-04:00');
  });

  it('returns 404 for a night file that does not exist', async () => {
    const app = createApp(config(runsDir()));
    const [page, api] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    expect(page.status).toBe(404);
    expect(api.status).toBe(404);
  });

  it('renders an empty existing night in both formats', async () => {
    const app = createApp(config(runsDir('')));
    const [page, api] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    expect(api.status).toBe(200);
    expect(await api.json()).toMatchObject({ night, rows: [], badLines: 0 });
  });

  it('renders a night with bad lines and safely escapes malicious job and error values', async () => {
    const maliciousJob = '<img src=x onerror=alert(1)>';
    const maliciousError = '<script>alert("x")</script>';
    const contents = [
      '{not json',
      record({ at: '2026-10-28T23:00:00+01:00', job: maliciousJob, status: 'ok', owner: null, error: maliciousError }),
    ].join('\n');
    const app = createApp(config(runsDir(contents)));
    const [page, api] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    const html = await page.text();
    expect(await api.json()).toMatchObject({ badLines: 1, rows: [{ job: maliciousJob, lastError: maliciousError, owner: null }] });
    expect(html).toContain('data-job="&lt;img src=x onerror=alert(1)&gt;"');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>alert("x")</script>');
  });
});
