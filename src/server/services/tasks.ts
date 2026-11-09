import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { expandOccurrences, shiftRecurrenceDays } from '../../shared/recurrence';
import type {
  CalendarItem,
  CalendarView,
  CreateTaskInput,
  InboxTask,
  InboxView,
  OccurrenceChangeInput,
  UpdateTaskInput,
} from '../../shared/task';
import type { Db } from '../db/client';
import { groups, occurrenceCompletions, suggestions, tasks, type TaskRow } from '../db/schema';
import { DAY, localDateKey, MINUTE } from '../domain/time';
import { captureTask, type Recorder } from './recorder';

export class NotFoundError extends Error {}

export class InvalidRequestError extends Error {}

const DEFAULT_TIMED_MINUTES = 30;

/** 끝 시각이 없으면 하루 종일은 하루, 시간 일정은 30분으로 본다. */
export function taskDurationMs(row: Pick<TaskRow, 'startsAt' | 'endsAt' | 'allDay'>) {
  if (row.startsAt && row.endsAt && row.endsAt > row.startsAt) return row.endsAt.getTime() - row.startsAt.getTime();
  return row.allDay ? DAY : DEFAULT_TIMED_MINUTES * MINUTE;
}

function defaultEnd(start: Date, allDay: boolean) {
  return new Date(start.getTime() + (allDay ? DAY : DEFAULT_TIMED_MINUTES * MINUTE));
}

export function getTaskOrThrow(db: Db, id: string) {
  const row = db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!row) throw new NotFoundError(`task ${id} not found`);
  return row;
}

export function getCalendar(db: Db, from: Date, to: Date): CalendarView {
  // 반복이 아닌 일정: 시작이 to 전이고, 시작이 from 이후이거나 끝이 from을 넘는다.
  const singles = db
    .select()
    .from(tasks)
    .where(
      and(
        isNull(tasks.recurrence),
        isNotNull(tasks.startsAt),
        lt(tasks.startsAt, to),
        or(gte(tasks.startsAt, from), gt(sql`coalesce(${tasks.endsAt}, ${tasks.startsAt})`, from.getTime())),
      ),
    )
    .orderBy(asc(tasks.startsAt))
    .all();

  const series = db
    .select()
    .from(tasks)
    .where(and(isNotNull(tasks.recurrence), isNotNull(tasks.startsAt), lt(tasks.startsAt, to)))
    .all();

  const completions = series.length
    ? db
        .select()
        .from(occurrenceCompletions)
        .where(
          and(
            inArray(
              occurrenceCompletions.taskId,
              series.map((s) => s.id),
            ),
            gte(occurrenceCompletions.occurrenceStartsAt, new Date(from.getTime() - 2 * DAY)),
            lt(occurrenceCompletions.occurrenceStartsAt, to),
          ),
        )
        .all()
    : [];
  const completed = new Set(completions.map((c) => `${c.taskId}@${c.occurrenceStartsAt.getTime()}`));

  const items: CalendarItem[] = singles.map((row) => ({
    id: row.id,
    taskId: row.id,
    title: row.title,
    startsAt: row.startsAt!.toISOString(),
    endsAt: (row.endsAt ?? defaultEnd(row.startsAt!, row.allDay)).toISOString(),
    allDay: row.allDay,
    done: row.completedAt !== null,
    recurrence: null,
    occurrenceStartsAt: null,
  }));

  for (const row of series) {
    const duration = taskDurationMs(row);
    for (const start of expandOccurrences(row.startsAt!, duration, row.recurrence!, from, to, row.excludedStarts)) {
      const id = `${row.id}@${start.getTime()}`;
      items.push({
        id,
        taskId: row.id,
        title: row.title,
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + duration).toISOString(),
        allDay: row.allDay,
        done: completed.has(id),
        recurrence: row.recurrence,
        occurrenceStartsAt: start.toISOString(),
      });
    }
  }

  const suggestionRows = db
    .select({ s: suggestions, title: tasks.title })
    .from(suggestions)
    .innerJoin(tasks, eq(tasks.id, suggestions.taskId))
    .where(and(lt(suggestions.startsAt, to), gt(suggestions.endsAt, from)))
    .orderBy(asc(suggestions.startsAt))
    .all();

  return {
    items: items.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    suggestions: suggestionRows.map(({ s, title }) => ({
      id: s.id,
      taskId: s.taskId,
      kind: s.kind,
      title,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      reason: s.reason,
    })),
  };
}

export function createTask(db: Db, input: CreateTaskInput, now: Date, recorder?: Recorder) {
  const id = randomUUID();
  captureTask(db, recorder, id);

  const allDay = input.allDay ?? false;
  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = startsAt ? (input.endsAt ? new Date(input.endsAt) : defaultEnd(startsAt, allDay)) : null;

  if (startsAt && endsAt && endsAt <= startsAt) throw new InvalidRequestError('endsAt must be after startsAt');
  if (input.recurrence && !startsAt) throw new InvalidRequestError('recurring task needs startsAt');

  return db
    .insert(tasks)
    .values({
      id,
      title: input.title,
      startsAt,
      endsAt,
      allDay: startsAt ? allDay : false,
      recurrence: input.recurrence ?? null,
      durationMinutes: input.durationMinutes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

export function updateTask(db: Db, id: string, input: UpdateTaskInput, now: Date, recorder?: Recorder) {
  const current = getTaskOrThrow(db, id);
  captureTask(db, recorder, id);

  const patch: Partial<TaskRow> = { updatedAt: now };

  if (input.title !== undefined) patch.title = input.title;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.recurrence !== undefined) patch.recurrence = input.recurrence;

  if (input.groupId !== undefined) {
    patch.groupId = input.groupId;
    patch.groupSetBy = 'user';
  }

  if (input.startsAt === null) {
    // 캘린더에서 빼서 오른쪽 목록으로 되돌린다. 원래 길이는 예상 길이로 남긴다.
    if (current.startsAt && !current.allDay) {
      patch.durationMinutes = Math.round(taskDurationMs(current) / MINUTE);
    }
    Object.assign(patch, { startsAt: null, endsAt: null, allDay: false, recurrence: null, excludedStarts: [] });
  } else if (input.startsAt !== undefined || input.endsAt !== undefined || input.allDay !== undefined) {
    const allDay = input.allDay ?? current.allDay;
    const startsAt = input.startsAt ? new Date(input.startsAt) : current.startsAt;
    if (!startsAt) throw new InvalidRequestError('startsAt is required to schedule');

    const endsAt = input.endsAt
      ? new Date(input.endsAt)
      : current.startsAt && current.allDay === allDay
        ? new Date(startsAt.getTime() + taskDurationMs(current))
        : defaultEnd(startsAt, allDay);
    if (endsAt <= startsAt) throw new InvalidRequestError('endsAt must be after startsAt');

    Object.assign(patch, { startsAt, endsAt, allDay, rescheduleOfferedAt: null });

    if (current.startsAt && localDateKey(startsAt) > localDateKey(current.startsAt)) {
      patch.postponeCount = current.postponeCount + 1;
    }
  }

  const timeChanged = 'startsAt' in patch;
  const row = db.update(tasks).set(patch).where(eq(tasks.id, id)).returning().get();

  // 직접 옮긴 할 일에 남은 제안은 더 이상 맞지 않는다.
  if (timeChanged) db.delete(suggestions).where(eq(suggestions.taskId, id)).run();

  return row;
}

export function deleteTask(db: Db, id: string, recorder?: Recorder) {
  getTaskOrThrow(db, id);
  captureTask(db, recorder, id);
  db.delete(tasks).where(eq(tasks.id, id)).run();
}

export function setCompleted(
  db: Db,
  id: string,
  input: { done: boolean; occurrenceStartsAt?: string | undefined },
  now: Date,
  recorder?: Recorder,
) {
  const current = getTaskOrThrow(db, id);

  if (current.recurrence && input.occurrenceStartsAt) {
    const occurrenceStartsAt = new Date(input.occurrenceStartsAt);
    if (input.done) {
      db.insert(occurrenceCompletions)
        .values({ taskId: id, occurrenceStartsAt, completedAt: now })
        .onConflictDoNothing()
        .run();
    } else {
      db.delete(occurrenceCompletions)
        .where(and(eq(occurrenceCompletions.taskId, id), eq(occurrenceCompletions.occurrenceStartsAt, occurrenceStartsAt)))
        .run();
    }
    return;
  }

  captureTask(db, recorder, id);
  db.update(tasks)
    .set({ completedAt: input.done ? now : null, updatedAt: now })
    .where(eq(tasks.id, id))
    .run();
}

/** 반복 일정의 한 회차를 옮기거나, 이름을 바꾸거나, 지운다. */
export function changeOccurrence(db: Db, id: string, input: OccurrenceChangeInput, now: Date) {
  const master = getTaskOrThrow(db, id);
  if (!master.recurrence || !master.startsAt) throw new InvalidRequestError('task is not recurring');

  const occurrence = new Date(input.occurrenceStartsAt);
  const duration = taskDurationMs(master);
  const { change } = input;

  if (input.scope === 'this') {
    db.update(tasks)
      .set({ excludedStarts: [...master.excludedStarts, occurrence.getTime()], updatedAt: now })
      .where(eq(tasks.id, id))
      .run();
    if (change.type === 'delete') return;

    const wasDone = db
      .select()
      .from(occurrenceCompletions)
      .where(and(eq(occurrenceCompletions.taskId, id), eq(occurrenceCompletions.occurrenceStartsAt, occurrence)))
      .get();

    db.insert(tasks)
      .values({
        id: randomUUID(),
        title: change.type === 'rename' ? change.title : master.title,
        startsAt: change.type === 'move' ? new Date(change.startsAt) : occurrence,
        endsAt: change.type === 'move' ? new Date(change.endsAt) : new Date(occurrence.getTime() + duration),
        allDay: change.type === 'move' ? change.allDay : master.allDay,
        completedAt: wasDone?.completedAt ?? null,
        seriesId: master.id,
        originalStartsAt: occurrence,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return;
  }

  // 이후 모두: 첫 회차면 반복 일정 자체를 바꾸고, 아니면 이 회차 직전에서 끊고 새 반복 일정을 만든다.
  const isFirst = occurrence.getTime() === master.startsAt.getTime();
  const moved = change.type === 'move' ? { start: new Date(change.startsAt), end: new Date(change.endsAt) } : null;
  const dayDelta = moved ? Math.round((startOfDayMs(moved.start) - startOfDayMs(occurrence)) / DAY) : 0;
  const nextRule = shiftRecurrenceDays(master.recurrence, dayDelta);

  if (isFirst) {
    if (change.type === 'delete') {
      db.delete(tasks).where(or(eq(tasks.id, id), eq(tasks.seriesId, id))).run();
      return;
    }
    db.update(tasks)
      .set({
        title: change.type === 'rename' ? change.title : master.title,
        ...(moved && change.type === 'move'
          ? { startsAt: moved.start, endsAt: moved.end, allDay: change.allDay, recurrence: nextRule, excludedStarts: [] }
          : {}),
        updatedAt: now,
      })
      .where(eq(tasks.id, id))
      .run();
    return;
  }

  db.update(tasks)
    .set({ recurrence: { ...master.recurrence, until: new Date(occurrence.getTime() - 1).toISOString() }, updatedAt: now })
    .where(eq(tasks.id, id))
    .run();
  if (change.type === 'delete') return;

  db.insert(tasks)
    .values({
      id: randomUUID(),
      title: change.type === 'rename' ? change.title : master.title,
      startsAt: moved?.start ?? occurrence,
      endsAt: moved?.end ?? new Date(occurrence.getTime() + duration),
      allDay: change.type === 'move' ? change.allDay : master.allDay,
      recurrence: nextRule,
      excludedStarts: master.excludedStarts.filter((t) => t > occurrence.getTime()),
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

function startOfDayMs(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function toInboxTask(row: TaskRow, suggested: Map<string, Date>): InboxTask {
  return {
    id: row.id,
    title: row.title,
    durationMinutes: row.durationMinutes,
    suggestedStartsAt: suggested.get(row.id)?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 오른쪽 목록. 완료하지 않은 날짜 없는 할 일을 최근 것부터 묶음별로. */
export function getInbox(db: Db, groupingPending: boolean): InboxView {
  const rows = db
    .select()
    .from(tasks)
    .where(and(isNull(tasks.startsAt), isNull(tasks.completedAt)))
    .orderBy(desc(tasks.createdAt))
    .all();
  const groupRows = db.select().from(groups).orderBy(asc(groups.createdAt)).all();
  const suggested = new Map(db.select().from(suggestions).all().map((s) => [s.taskId, s.startsAt]));
  const toItem = (row: TaskRow) => toInboxTask(row, suggested);

  return {
    groups: groupRows
      .map((g) => ({ id: g.id, name: g.name, tasks: rows.filter((r) => r.groupId === g.id).map(toItem) }))
      .filter((g) => g.tasks.length > 0),
    ungrouped: rows.filter((r) => r.groupId === null).map(toItem),
    groupingPending,
  };
}

export function listInboxRows(db: Db) {
  return db
    .select()
    .from(tasks)
    .where(and(isNull(tasks.startsAt), isNull(tasks.completedAt)))
    .orderBy(desc(tasks.createdAt))
    .all();
}
