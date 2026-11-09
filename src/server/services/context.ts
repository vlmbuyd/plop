import { asc, desc, eq } from 'drizzle-orm';

import { describeRecurrence } from '../../shared/recurrence';
import type { Db } from '../db/client';
import { facts, groups } from '../db/schema';
import { addDays, formatLocalDateTime, startOfLocalDay, weekdayName } from '../domain/time';
import { deriveInsights } from './insights';
import { getCalendar, listInboxRows } from './tasks';

/** AI에게 넘기는 현재 상황. 날짜는 모두 시간대 없는 로컬 시각이다. */
export function describeNow(now: Date) {
  return `지금: ${formatLocalDateTime(now)} (${weekdayName(now)}요일)`;
}

export function describeSchedule(db: Db, now: Date, days = 7) {
  const from = startOfLocalDay(now);
  const { items } = getCalendar(db, from, addDays(from, days));
  if (items.length === 0) return `오늘부터 ${days}일 일정: 없음`;

  const lines = items.map((item) => {
    const start = new Date(item.startsAt);
    const end = new Date(item.endsAt);
    const when = item.allDay ? `${formatLocalDateTime(start).slice(0, 10)} 하루 종일` : `${formatLocalDateTime(start)}~${formatLocalDateTime(end).slice(11)}`;
    const extra = [
      item.done ? '완료' : null,
      item.recurrence ? `${describeRecurrence(item.recurrence)} 반복, 회차 ${formatLocalDateTime(start)}` : null,
    ].filter(Boolean);
    return `- [${item.taskId}] ${when} ${item.title}${extra.length ? ` (${extra.join(', ')})` : ''}`;
  });
  return `오늘부터 ${days}일 일정:\n${lines.join('\n')}`;
}

export function describeInbox(db: Db) {
  const rows = listInboxRows(db);
  if (rows.length === 0) return '오른쪽 목록(날짜 없는 할 일): 없음';
  const groupNames = new Map(db.select().from(groups).all().map((g) => [g.id, g.name]));
  const lines = rows.map((r) => {
    const extra = [
      r.groupId ? `묶음 ${groupNames.get(r.groupId)}` : null,
      r.durationMinutes ? `예상 ${r.durationMinutes}분` : null,
      r.postponeCount ? `${r.postponeCount}번 미룸` : null,
    ].filter(Boolean);
    return `- [${r.id}] ${r.title}${extra.length ? ` (${extra.join(', ')})` : ''}`;
  });
  return `오른쪽 목록(날짜 없는 할 일):\n${lines.join('\n')}`;
}

export function describeProfile(db: Db, now: Date) {
  const factRows = db.select().from(facts).orderBy(asc(facts.createdAt)).all();
  const insights = deriveInsights(db, now);
  const lines = [...factRows.map((f) => `- ${f.text}`), ...insights.map((i) => `- ${i.text} (기록에서 뽑음)`)];
  return `사용자에 대해 아는 것:\n${lines.length ? lines.join('\n') : '- 아직 없음'}`;
}

export function listFacts(db: Db) {
  return db.select().from(facts).orderBy(desc(facts.createdAt)).all();
}

export function getFact(db: Db, id: string) {
  return db.select().from(facts).where(eq(facts.id, id)).get();
}
