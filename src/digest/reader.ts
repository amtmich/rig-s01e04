import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

function validNight(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !validNight(match[1])) return false;
  const zone = match[5];
  return Number(match[2]) < 24 && Number(match[3]) < 60 && Number(match[4]) < 60
    && (zone === 'Z' || (Number(zone.slice(1, 3)) < 24 && Number(zone.slice(4)) < 60))
    && Number.isFinite(Date.parse(value));
}

type Entry = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

function entry(value: unknown): value is Entry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return timestamp(record.at) && typeof record.job === 'string' && record.job.trim().length > 0
    && (record.status === 'ok' || record.status === 'retry' || record.status === 'fail')
    && (record.owner === null || typeof record.owner === 'string')
    && (record.error === undefined || typeof record.error === 'string');
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!validNight(night)) return null;
  let source: string;
  try {
    source = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
  const counts = { ok: 0, retry: 0, fail: 0 };
  const jobs = new Map<string, { row: DigestRow; errorTime: number }>();
  let badLines = 0;
  const lines = source === '' ? [] : source.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    let value: unknown;
    try { value = JSON.parse(line); } catch { badLines++; continue; }
    if (!entry(value)) { badLines++; continue; }
    counts[value.status]++;
    const time = Date.parse(value.at);
    const existing = jobs.get(value.job);
    if (!existing) {
      jobs.set(value.job, {
        row: {
          job: value.job, owner: value.owner, runs: 1, retries: Number(value.status === 'retry'),
          lastStatus: value.status, lastError: value.error ?? null, firstTime: value.at, lastTime: value.at,
        },
        errorTime: value.error === undefined ? -Infinity : time,
      });
      continue;
    }
    const { row } = existing;
    row.runs++;
    if (value.status === 'retry') row.retries++;
    if (time < Date.parse(row.firstTime)) row.firstTime = value.at;
    // Equal timestamps use the later record in the file as the tie breaker.
    if (time >= Date.parse(row.lastTime)) {
      row.lastTime = value.at;
      row.lastStatus = value.status;
      row.owner = value.owner;
    }
    if (value.error !== undefined && time >= existing.errorTime) {
      row.lastError = value.error;
      existing.errorTime = time;
    }
  }
  const rows = [...jobs.values()].map(({ row }) => row)
    .sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return { night, rows, badLines, counts };
};
