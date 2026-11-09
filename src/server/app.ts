import { serveStatic } from '@hono/node-server/serve-static';
import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';

import {
  chatInputSchema,
  completeTaskSchema,
  createTaskSchema,
  factInputSchema,
  occurrenceChangeSchema,
  planInputSchema,
  rangeQuerySchema,
  updateTaskSchema,
  type Fact,
} from '../shared/task';
import { AiError, type AiRunner } from './ai/runner';
import type { Db } from './db/client';
import { dismissedInsights, facts } from './db/schema';
import { handleChat, listChat, undoChat } from './services/chat';
import type { GroupingService } from './services/grouping';
import { deriveInsights } from './services/insights';
import { acceptAllSuggestions, acceptSuggestion, dismissSuggestion, planDay, planMorning } from './services/planning';
import {
  changeOccurrence,
  createTask,
  deleteTask,
  getCalendar,
  getInbox,
  InvalidRequestError,
  NotFoundError,
  setCompleted,
  updateTask,
} from './services/tasks';
import { importTickTick } from './services/ticktick';

export interface AppDeps {
  db: Db;

  ai: AiRunner;

  grouping: GroupingService;

  now?: () => Date;
}

const toFact = (row: typeof facts.$inferSelect): Fact => ({
  id: row.id,
  text: row.text,
  source: row.source,
  createdAt: row.createdAt.toISOString(),
});

export function createApi({ db, ai, grouping, now = () => new Date() }: AppDeps) {
  return new Hono()
    .get('/health', (c) => c.json({ ok: true }))

    .get('/calendar', zValidator('query', rangeQuerySchema), (c) => {
      const { from, to } = c.req.valid('query');
      return c.json(getCalendar(db, new Date(from), new Date(to)));
    })

    .get('/inbox', (c) => c.json(getInbox(db, grouping.pending)))

    .post('/tasks', zValidator('json', createTaskSchema), (c) => {
      const row = createTask(db, c.req.valid('json'), now());
      if (!row.startsAt) grouping.schedule();
      return c.json({ id: row.id }, 201);
    })
    .patch('/tasks/:id', zValidator('json', updateTaskSchema), (c) => {
      const input = c.req.valid('json');
      updateTask(db, c.req.param('id'), input, now());
      if (input.startsAt === null) grouping.schedule();
      return c.json({ ok: true });
    })
    .delete('/tasks/:id', (c) => {
      deleteTask(db, c.req.param('id'));
      return c.json({ ok: true });
    })
    .post('/tasks/:id/complete', zValidator('json', completeTaskSchema), (c) => {
      setCompleted(db, c.req.param('id'), c.req.valid('json'), now());
      return c.json({ ok: true });
    })
    .post('/tasks/:id/occurrence', zValidator('json', occurrenceChangeSchema), (c) => {
      changeOccurrence(db, c.req.param('id'), c.req.valid('json'), now());
      return c.json({ ok: true });
    })

    .post('/suggestions/plan', zValidator('json', planInputSchema), async (c) => c.json(await planDay(db, ai, c.req.valid('json'), now())))
    .post('/suggestions/morning', async (c) => c.json(await planMorning(db, ai, now())))
    .post('/suggestions/accept-all', (c) => c.json({ accepted: acceptAllSuggestions(db, now()) }))
    .post('/suggestions/:id/accept', (c) => {
      if (!acceptSuggestion(db, c.req.param('id'), now())) throw new NotFoundError('suggestion not found');
      return c.json({ ok: true });
    })
    .delete('/suggestions/:id', (c) => {
      dismissSuggestion(db, c.req.param('id'));
      return c.json({ ok: true });
    })

    .get('/chat', (c) => c.json(listChat(db)))
    .post('/chat', zValidator('json', chatInputSchema), async (c) => c.json(await handleChat(db, ai, grouping, c.req.valid('json').text, now())))
    .post('/chat/undo/:batchId', (c) => c.json({ ok: undoChat(db, c.req.param('batchId'), now()) }))

    .get('/profile', (c) =>
      c.json({
        facts: db.select().from(facts).orderBy(desc(facts.createdAt)).all().map(toFact),
        insights: deriveInsights(db, now()),
      }),
    )
    .post('/profile/facts', zValidator('json', factInputSchema), (c) => {
      const at = now();
      const row = db
        .insert(facts)
        .values({ id: randomUUID(), text: c.req.valid('json').text, source: 'user', createdAt: at, updatedAt: at })
        .returning()
        .get();
      return c.json(toFact(row), 201);
    })
    .patch('/profile/facts/:id', zValidator('json', factInputSchema), (c) => {
      const row = db
        .update(facts)
        .set({ text: c.req.valid('json').text, updatedAt: now() })
        .where(eq(facts.id, c.req.param('id')))
        .returning()
        .get();
      if (!row) throw new NotFoundError('fact not found');
      return c.json(toFact(row));
    })
    .delete('/profile/facts/:id', (c) => {
      db.delete(facts).where(eq(facts.id, c.req.param('id'))).run();
      return c.json({ ok: true });
    })
    .delete('/profile/insights/:key', (c) => {
      db.insert(dismissedInsights).values({ key: c.req.param('key'), dismissedAt: now() }).onConflictDoNothing().run();
      return c.json({ ok: true });
    })

    .post('/import/ticktick', async (c) => {
      const summary = importTickTick(db, await c.req.text(), now());
      if (summary.inbox > 0) grouping.schedule();
      return c.json(summary);
    });
}

export function createApp(deps: AppDeps) {
  const app = new Hono().route('/api', createApi(deps));

  app.onError((error, c) => {
    if (error instanceof NotFoundError) return c.json({ error: error.message }, 404);
    if (error instanceof InvalidRequestError) return c.json({ error: error.message }, 400);
    if (error instanceof AiError) return c.json({ error: error.message }, 502);
    if (error instanceof Error && /TickTick 백업 CSV/.test(error.message)) return c.json({ error: error.message }, 400);
    console.error(error);
    return c.json({ error: '서버에서 문제가 생겼어요.' }, 500);
  });

  if (process.env.NODE_ENV === 'production') {
    app.use('/*', serveStatic({ root: './dist' }));
    app.get('*', serveStatic({ path: './dist/index.html' }));
  }

  return app;
}

export type Api = ReturnType<typeof createApi>;
