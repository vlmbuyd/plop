import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';

import type { Db } from './db/client';
import { createTaskRoutes } from './routes/tasks';

export function createApp(db: Db) {
  const api = new Hono()
    .get('/health', (c) => c.json({ ok: true }))
    .route('/tasks', createTaskRoutes(db));

  const app = new Hono().route('/api', api);

  if (process.env.NODE_ENV === 'production') {
    app.use('/*', serveStatic({ root: './dist' }));
    app.get('*', serveStatic({ path: './dist/index.html' }));
  }

  return app;
}

export type Api = ReturnType<typeof createApp>;
