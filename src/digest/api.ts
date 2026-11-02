import { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from './reader.js';

/** JSON API for the shared nightly digest. */
export function createDigestApi(config: RigConfig) {
  return new Hono().get('/:night', (c) => {
    const digest = readNight(config.runsDir, c.req.param('night'));
    if (digest === null) return c.json({ error: 'night not found' }, 404);
    return c.json(digest);
  });
}
