import { Hono } from 'hono';
import type { RigConfig } from '../config.js';

/** Route boundary shared before the independent section-2 workers start. */
export function createDigestApi(_config: RigConfig) {
  return new Hono();
}
