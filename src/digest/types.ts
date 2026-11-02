/** The shared contract for the morning digest (plan.md § 1). */
export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  /** Most recent reported error, retained even if a later run succeeds. */
  lastError: string | null;
  /** Original timestamp strings, including their offsets. */
  firstTime: string;
  lastTime: string;
};

export type StatusCounts = Record<RunStatus, number>;

export type NightDigest = {
  night: string;
  /** One row per job, sorted by job using code-point order. */
  rows: DigestRow[];
  badLines: number;
  /** Counts of valid log entries by status, rather than final job statuses. */
  counts: StatusCounts;
};

/**
 * Implemented as readNight in ./reader.ts. A missing/invalid night returns null;
 * an empty existing file returns an empty digest. Invalid records count as badLines.
 * Each job's first/last times and last status use timestamp order; offsets stay intact.
 * Null owners remain null and views render them as an em dash.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
