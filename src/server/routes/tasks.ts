import { zValidator } from '@hono/zod-validator';
import { and, asc, gt, gte, isNotNull, lt, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { taskRangeQuerySchema, type Task } from '../../shared/task';
import type { Db } from '../db/client';
import { tasks, type TaskRow } from '../db/schema';

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    allDay: row.allDay,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createTaskRoutes(db: Db) {
  return new Hono().get('/', zValidator('query', taskRangeQuerySchema), (c) => {
    const { from, to } = c.req.valid('query');
    const fromDate = new Date(from);
    const toDate = new Date(to);

    // 기간과 겹치는 할 일: 시작이 to 전이고, 시작이 from 이후이거나 끝이 from을 넘는다.
    // 끝이 정확히 from인 할 일은 앞 기간에 속하므로 뺀다.
    const rows = db
      .select()
      .from(tasks)
      .where(
        and(
          isNotNull(tasks.startsAt),
          lt(tasks.startsAt, toDate),
          or(gte(tasks.startsAt, fromDate), gt(sql`coalesce(${tasks.endsAt}, ${tasks.startsAt})`, fromDate.getTime())),
        ),
      )
      .orderBy(asc(tasks.startsAt))
      .all();

    return c.json(rows.map(toTask));
  });
}
