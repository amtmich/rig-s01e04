import { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { lane } from '../lane.js';
import { Layout } from '../views/layout.js';
import { DigestView } from '../views/digest.js';
import { readNight } from './reader.js';

export function createDigestPage(config: RigConfig) {
  const app = new Hono();
  app.get('/:night', (c) => {
    const digest = readNight(config.runsDir, c.req.param('night'));
    if (!digest) {
      return c.html(
        <Layout title="night not found" lane={lane()}>
          <h1>night not found</h1>
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`night ${digest.night}`} lane={lane()}>
        <DigestView digest={digest} />
      </Layout>,
    );
  });
  return app;
}
