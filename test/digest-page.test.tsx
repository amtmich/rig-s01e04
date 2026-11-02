import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDigestPage } from '../src/digest/page.js';
import type { RigConfig } from '../src/config.js';

const night = '2026-10-28';
const dirs: string[] = [];
function configWithLog(contents?: string): RigConfig {
  const runsDir = mkdtempSync(join(tmpdir(), 'digest-page-'));
  dirs.push(runsDir);
  if (contents !== undefined) writeFileSync(join(runsDir, `${night}.jsonl`), contents);
  return { adapter: 'shim', installed: '2026-10-28T00:00:00Z', beatEverySeconds: 60, runsDir };
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const record = (values: Record<string, unknown>) => JSON.stringify(values);

describe('digest page', () => {
  it('renders fixture rows in reader order with every field, warnings and the lane banner', async () => {
    const res = await createDigestPage({ adapter: 'shim', installed: '', beatEverySeconds: 60, runsDir: 'runs' })
      .request(`/${night}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('lane-07');
    expect(html).toContain(`night ${night}`);
    expect(html).toContain('bad lines: 1');
    expect(html.match(/<table>/g)).toHaveLength(1);
    expect([...html.matchAll(/data-job="([^"]+)"/g)].map(match => match[1])).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(html).toContain('upstream 503');
    expect(html).toContain('2026-10-29T01:37:00+01:00');
    expect(html).toContain('>—</td>');
    expect(html).toContain('<span class="warn">3</span>');
    expect(html).toContain('<span class="warn">fail</span>');
  });

  it('escapes log-controlled strings and marks the complete high-retry row', async () => {
    const config = configWithLog([
      record({ at: '2026-10-28T01:00:00+05:30', job: '<img src=x onerror=1>', status: 'retry', owner: 'A & B' }),
      record({ at: '2026-10-28T02:00:00+05:30', job: '<img src=x onerror=1>', status: 'retry', owner: 'A & B', error: '<script>alert("x")</script>' }),
      record({ at: '2026-10-28T03:00:00+05:30', job: '<img src=x onerror=1>', status: 'retry', owner: 'A & B' }),
    ].join('\n'));
    const res = await createDigestPage(config).request(`/${night}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('data-job="&lt;img src=x onerror=1&gt;"');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('2026-10-28T01:00:00+05:30');
    expect(html).toContain('2026-10-28T03:00:00+05:30');
    expect(html).toContain('<td><span class="warn">3</span></td>');
  });

  it('returns a layout-backed 404 for a missing night', async () => {
    const res = await createDigestPage(configWithLog()).request(`/${night}`);
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain('<header>');
    expect(html).toContain('lane-07');
    expect(html).toContain('night not found');
  });

  it('renders an existing empty file as 200 with nothing ran', async () => {
    const res = await createDigestPage(configWithLog('')).request(`/${night}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('bad lines: 0');
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table>');
  });
});
