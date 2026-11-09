import { and, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { PlanInput } from '../../shared/task';
import type { AiRunner } from '../ai/runner';
import type { Db } from '../db/client';
import { kv, suggestions, tasks } from '../db/schema';
import { findFreeSlots, fitsInSlots, firstFit, type Interval } from '../domain/slots';
import {
  addDays,
  atLocal,
  ceilToQuarter,
  formatHourMinute,
  formatLocalDateTime,
  localDateKey,
  MINUTE,
  startOfLocalDay,
  weekdayName,
} from '../domain/time';
import { describeNow, describeProfile } from './context';
import type { Recorder } from './recorder';
import { getCalendar, listInboxRows, taskDurationMs, updateTask } from './tasks';

const DAY_START = '09:00';
const DAY_END = '23:00';
const LATE_HOUR = 21;

const SYSTEM = `너는 사용자의 하루 계획을 돕는 비서다.
날짜 없는 할 일 중 일부를 주어진 빈 시간에 배치해 제안한다. 사용자가 확정하기 전까지는 제안일 뿐이다.

규칙:
- 반드시 주어진 빈 시간 안에만 놓는다. 서로 겹치지 않게 한다.
- 하루를 꽉 채우지 않는다. 쉬는 틈을 남기고, 현실적으로 해낼 만큼만 고른다. 보통 2~5개.
- 사용자에 대해 아는 것(집중이 잘 되는 시간, 에너지, 자주 미루는 일)을 근거로 순서와 시간을 정한다.
- 예상 시간이 없으면 할 일 이름을 보고 15분 단위로 정한다. 최대 180분.
- reason은 왜 그 시간인지 한국어 한 문장으로 짧게 쓴다. 아는 것을 근거로 들 수 있으면 든다.
- startTime은 'HH:mm'(24시간)이다.`;

const outputSchema = z.object({
  placements: z.array(
    z.object({
      taskId: z.string(),
      startTime: z.string(),
      durationMinutes: z.number(),
      reason: z.string(),
    }),
  ),
});

export interface PlanResult {
  dateKey: string;

  created: number;

  /** 제안하지 못한 이유. 있으면 화면에 보여 준다. */
  message: string | null;
}

function resolvePlanDate(input: PlanInput, now: Date) {
  if (input.date) return input.date;
  return localDateKey(now.getHours() >= LATE_HOUR ? addDays(now, 1) : now);
}

function busyIntervals(db: Db, from: Date, to: Date): Interval[] {
  const { items, suggestions: pending } = getCalendar(db, from, to);
  return [
    ...items.filter((i) => !i.allDay).map((i) => ({ start: Date.parse(i.startsAt), end: Date.parse(i.endsAt) })),
    ...pending.map((s) => ({ start: Date.parse(s.startsAt), end: Date.parse(s.endsAt) })),
  ];
}

/** 하루의 빈 시간을 계산하고, AI가 고른 배치 중 빈 시간에 맞는 것만 제안으로 남긴다. */
export async function planDay(db: Db, ai: AiRunner, input: PlanInput, now: Date, recorder?: Recorder): Promise<PlanResult> {
  const dateKey = resolvePlanDate(input, now);
  const dayStart = atLocal(dateKey);
  const dayEnd = addDays(dayStart, 1);

  // 같은 날 이전에 했던 배치 제안은 새 제안으로 바꾼다.
  db.delete(suggestions)
    .where(and(eq(suggestions.kind, 'place'), lt(suggestions.startsAt, dayEnd), gt(suggestions.endsAt, dayStart)))
    .run();

  let windowStart = atLocal(dateKey, input.from ?? DAY_START);
  const windowEnd = atLocal(dateKey, input.to ?? DAY_END);
  if (localDateKey(now) === dateKey) windowStart = new Date(Math.max(windowStart.getTime(), ceilToQuarter(now).getTime()));

  const slots = findFreeSlots({ start: windowStart.getTime(), end: windowEnd.getTime() }, busyIntervals(db, dayStart, dayEnd));

  const pendingTaskIds = new Set(db.select({ id: suggestions.taskId }).from(suggestions).all().map((s) => s.id));
  const candidates = listInboxRows(db).filter((t) => !pendingTaskIds.has(t.id));

  if (candidates.length === 0) return { dateKey, created: 0, message: '오른쪽 목록에 배치할 할 일이 없어요.' };
  if (slots.length === 0) return { dateKey, created: 0, message: '그날은 빈 시간이 없어요.' };

  const day = atLocal(dateKey);
  const prompt = [
    describeNow(now),
    `배치할 날: ${dateKey} (${weekdayName(day)}요일)`,
    `빈 시간:\n${slots.map((s) => `- ${formatLocalDateTime(new Date(s.start)).slice(11)}~${formatLocalDateTime(new Date(s.end)).slice(11)}`).join('\n')}`,
    `날짜 없는 할 일:\n${candidates
      .map((t) => `- [${t.id}] ${t.title}${t.durationMinutes ? ` (예상 ${t.durationMinutes}분)` : ''}${t.postponeCount ? ` (${t.postponeCount}번 미룸)` : ''}`)
      .join('\n')}`,
    describeProfile(db, now),
  ].join('\n\n');

  const { placements } = await ai.run({ system: SYSTEM, prompt, schema: outputSchema, tier: 'smart' });

  const allowed = new Map(candidates.map((t) => [t.id, t]));
  let remaining = slots;
  let created = 0;

  for (const p of placements) {
    if (!allowed.has(p.taskId) || !/^\d{2}:\d{2}$/.test(p.startTime)) continue;
    const minutes = Math.min(180, Math.max(15, Math.round(p.durationMinutes / 15) * 15));
    const start = atLocal(dateKey, p.startTime).getTime();
    const candidate = { start, end: start + minutes * MINUTE };
    if (!fitsInSlots(candidate, remaining)) continue;

    const id = randomUUID();
    db.insert(suggestions)
      .values({ id, taskId: p.taskId, kind: 'place', startsAt: new Date(candidate.start), endsAt: new Date(candidate.end), reason: p.reason.slice(0, 200), createdAt: now })
      .run();
    recorder?.createdSuggestionIds.push(id);
    allowed.delete(p.taskId);
    created++;
    remaining = findFreeSlots({ start: windowStart.getTime(), end: windowEnd.getTime() }, [
      ...busyIntervals(db, dayStart, dayEnd),
    ]);
  }

  return { dateKey, created, message: created === 0 ? '알맞은 자리를 찾지 못했어요.' : null };
}

const MORNING_KEY = 'morningPlanDate';

/** 하루 처음 열 때 한 번만 오늘 계획을 제안한다. */
export async function planMorning(db: Db, ai: AiRunner, now: Date) {
  const today = localDateKey(now);
  const last = db.select().from(kv).where(eq(kv.key, MORNING_KEY)).get();
  if (last?.value === today) return { skipped: true as const };

  db.insert(kv).values({ key: MORNING_KEY, value: today }).onConflictDoUpdate({ target: kv.key, set: { value: today } }).run();
  if (listInboxRows(db).length === 0) return { skipped: true as const };

  return { skipped: false as const, result: await planDay(db, ai, {}, now) };
}

/** 끝날 시간이 지났는데 완료하지 않은 오늘 일정을 남은 시간에 옮기자고 제안한다. AI 없이 첫 빈자리를 찾는다. */
export function offerReschedules(db: Db, now: Date) {
  const todayStart = startOfLocalDay(now);
  const overdue = db
    .select()
    .from(tasks)
    .where(
      and(
        isNull(tasks.recurrence),
        isNull(tasks.completedAt),
        isNull(tasks.rescheduleOfferedAt),
        eq(tasks.allDay, false),
        gt(tasks.endsAt, todayStart),
        lt(tasks.endsAt, now),
      ),
    )
    .all();
  if (overdue.length === 0) return 0;

  const withSuggestion = new Set(
    db
      .select({ id: suggestions.taskId })
      .from(suggestions)
      .where(inArray(suggestions.taskId, overdue.map((t) => t.id)))
      .all()
      .map((r) => r.id),
  );

  let offered = 0;
  for (const task of overdue) {
    if (withSuggestion.has(task.id)) continue;
    const duration = taskDurationMs(task);

    const tryDay = (dateKey: string, notBefore: Date) => {
      const start = Math.max(atLocal(dateKey, DAY_START).getTime(), ceilToQuarter(notBefore).getTime());
      const end = atLocal(dateKey, DAY_END).getTime();
      const dayStart = atLocal(dateKey);
      return firstFit(findFreeSlots({ start, end }, busyIntervals(db, dayStart, addDays(dayStart, 1))), duration);
    };

    const today = localDateKey(now);
    const slot = tryDay(today, now) ?? tryDay(localDateKey(addDays(now, 1)), now);
    db.update(tasks).set({ rescheduleOfferedAt: now }).where(eq(tasks.id, task.id)).run();
    if (!slot) continue;

    const startDate = new Date(slot.start);
    const when = localDateKey(startDate) === today ? formatHourMinute(startDate) : `내일 ${formatHourMinute(startDate)}`;
    db.insert(suggestions)
      .values({
        id: randomUUID(),
        taskId: task.id,
        kind: 'move',
        startsAt: startDate,
        endsAt: new Date(slot.end),
        reason: `끝날 시간이 지났는데 완료 체크가 없어요. ${when}로 옮겨 볼까요?`,
        createdAt: now,
      })
      .run();
    offered++;
  }
  return offered;
}

export function acceptSuggestion(db: Db, id: string, now: Date) {
  const s = db.select().from(suggestions).where(eq(suggestions.id, id)).get();
  if (!s) return false;
  updateTask(db, s.taskId, { startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), allDay: false }, now);
  return true;
}

export function acceptAllSuggestions(db: Db, now: Date) {
  const all = db.select().from(suggestions).all();
  db.transaction(() => {
    for (const s of all) acceptSuggestion(db, s.id, now);
  });
  return all.length;
}

export function dismissSuggestion(db: Db, id: string) {
  db.delete(suggestions).where(eq(suggestions.id, id)).run();
}
