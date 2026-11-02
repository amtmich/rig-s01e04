import type { DigestRow, NightDigest } from '../digest/types.js';

function DigestTable({ rows }: { rows: DigestRow[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>job</th><th>owner</th><th>runs</th><th>retries</th><th>last status</th>
          <th>last error</th><th>first time</th><th>last time</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const highRetries = row.retries >= 3;
          return (
            <tr data-job={row.job}>
              <td>{row.job}</td>
              <td>{row.owner ?? '—'}</td>
              <td>{row.runs}</td>
              <td>{highRetries ? <span class="warn">{row.retries}</span> : row.retries}</td>
              <td>{row.lastStatus === 'fail' ? <span class="warn">{row.lastStatus}</span> : row.lastStatus}</td>
              <td>{row.lastError ?? '—'}</td>
              <td>{row.firstTime}</td>
              <td>{row.lastTime}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function DigestView({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>night {digest.night}</h1>
      <p>bad lines: {digest.badLines}</p>
      {digest.rows.length === 0 ? <p class="mute">nothing ran</p> : <DigestTable rows={digest.rows} />}
    </>
  );
}
