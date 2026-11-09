import { beforeEach, describe, expect, it } from 'vitest';

import type { Task } from '../../shared/task';
import { createApp } from '../app';
import { createDb, type Db } from '../db/client';
import { tasks, type NewTaskRow } from '../db/schema';

let db: Db;

function insert(row: Partial<NewTaskRow> & Pick<NewTaskRow, 'id'>) {
  const now = new Date('2026-11-01T00:00:00Z');
  db.insert(tasks)
    .values({ title: row.id, createdAt: now, updatedAt: now, ...row })
    .run();
}

async function getRange(from: string, to: string) {
  const app = createApp(db);
  const res = await app.request(`/api/tasks?from=${from}&to=${to}`);
  return { status: res.status, body: (await res.json()) as Task[] };
}

beforeEach(() => {
  db = createDb(':memory:');
});

describe('GET /api/tasks', () => {
  it('기간과 겹치는 할 일만 시작 시각 순으로 돌려준다', async () => {
    insert({ id: 'inside', startsAt: new Date('2026-11-10T04:00:00Z'), endsAt: new Date('2026-11-10T05:00:00Z') });
    insert({ id: 'crossing-start', startsAt: new Date('2026-11-09T23:00:00Z'), endsAt: new Date('2026-11-10T01:00:00Z') });
    insert({ id: 'ends-at-from', startsAt: new Date('2026-11-09T22:00:00Z'), endsAt: new Date('2026-11-10T00:00:00Z') });
    insert({ id: 'after', startsAt: new Date('2026-11-11T00:00:00Z'), endsAt: new Date('2026-11-11T01:00:00Z') });
    insert({ id: 'no-date' });

    const { status, body } = await getRange('2026-11-10T00:00:00Z', '2026-11-11T00:00:00Z');

    expect(status).toBe(200);
    expect(body.map((t) => t.id)).toEqual(['crossing-start', 'inside']);
  });

  it('끝 시각이 없는 할 일은 시작 시각으로 판단한다', async () => {
    insert({ id: 'point', startsAt: new Date('2026-11-10T00:00:00Z') });

    const { body } = await getRange('2026-11-10T00:00:00Z', '2026-11-11T00:00:00Z');

    expect(body.map((t) => t.id)).toEqual(['point']);
  });

  it('날짜를 ISO 문자열로, 완료 여부를 함께 돌려준다', async () => {
    insert({
      id: 'done',
      startsAt: new Date('2026-11-10T04:00:00Z'),
      endsAt: new Date('2026-11-10T05:00:00Z'),
      completedAt: new Date('2026-11-10T05:10:00Z'),
    });

    const { body } = await getRange('2026-11-10T00:00:00Z', '2026-11-11T00:00:00Z');

    expect(body[0]).toMatchObject({
      startsAt: '2026-11-10T04:00:00.000Z',
      endsAt: '2026-11-10T05:00:00.000Z',
      allDay: false,
      completedAt: '2026-11-10T05:10:00.000Z',
    });
  });

  it('기간이 잘못되면 400을 돌려준다', async () => {
    const app = createApp(db);

    expect((await app.request('/api/tasks?from=2026-11-11T00:00:00Z&to=2026-11-10T00:00:00Z')).status).toBe(400);
    expect((await app.request('/api/tasks?from=yesterday&to=today')).status).toBe(400);
  });
});
