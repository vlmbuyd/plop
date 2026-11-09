import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { Recurrence } from '../../shared/recurrence';

/** AI가 오른쪽 목록을 나눈 묶음. */
export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    notes: text('notes'),

    /** null이면 날짜 없는 할 일로 오른쪽 목록에 놓인다. 반복 일정이면 첫 회차 시작이다. */
    startsAt: integer('starts_at', { mode: 'timestamp_ms' }),
    endsAt: integer('ends_at', { mode: 'timestamp_ms' }),
    allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),

    /** 날짜 없는 할 일을 캘린더에 놓을 때 쓰는 예상 길이. */
    durationMinutes: integer('duration_minutes'),

    groupId: text('group_id').references(() => groups.id, { onDelete: 'set null' }),

    /** 사용자가 직접 묶음을 옮겼으면 'user'. AI가 다시 묶을 때 건드리지 않고 예시로 쓴다. */
    groupSetBy: text('group_set_by', { enum: ['ai', 'user'] }),

    recurrence: text('recurrence', { mode: 'json' }).$type<Recurrence>(),

    /** 반복 일정에서 빠진 회차의 시작 시각(ms). 이 회차만 바꾸거나 지울 때 쌓인다. */
    excludedStarts: text('excluded_starts', { mode: 'json' }).$type<number[]>().notNull().default([]),

    /** 반복 일정의 한 회차만 바꾼 할 일이면 원래 반복 일정과 원래 회차 시작. */
    seriesId: text('series_id'),
    originalStartsAt: integer('original_starts_at', { mode: 'timestamp_ms' }),

    /** 더 늦은 날로 옮긴 횟수. "Plop이 아는 나"의 자주 미루는 일에 쓴다. */
    postponeCount: integer('postpone_count').notNull().default(0),

    /** 끝날 시간이 지났는데 완료하지 않아 옮기자고 제안한 시각. 한 번만 묻는다. */
    rescheduleOfferedAt: integer('reschedule_offered_at', { mode: 'timestamp_ms' }),

    /** 가져온 원본 ID. 같은 파일을 두 번 가져와도 겹치지 않게 한다. */
    externalId: text('external_id'),

    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('tasks_starts_at_idx').on(table.startsAt),
    index('tasks_series_id_idx').on(table.seriesId),
    uniqueIndex('tasks_external_id_idx').on(table.externalId),
  ],
);

/** 반복 일정의 회차별 완료. */
export const occurrenceCompletions = sqliteTable(
  'occurrence_completions',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    occurrenceStartsAt: integer('occurrence_starts_at', { mode: 'timestamp_ms' }).notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.occurrenceStartsAt] })],
);

/** AI가 제안한 배치. 확정하면 할 일의 시간이 바뀌고 제안은 지워진다. */
export const suggestions = sqliteTable('suggestions', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),

  /** place: 날짜 없는 할 일을 놓기, move: 이미 있는 일정을 옮기기 */
  kind: text('kind', { enum: ['place', 'move'] }).notNull(),
  startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
  endsAt: integer('ends_at', { mode: 'timestamp_ms' }).notNull(),
  reason: text('reason').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/** "Plop이 아는 나"에서 내가 말했거나 직접 적은 것. */
export const facts = sqliteTable('facts', {
  id: text('id').primaryKey(),
  text: text('text').notNull(),
  source: text('source', { enum: ['chat', 'user'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/** 캘린더 기록에서 뽑은 내용 중 내가 숨긴 것. */
export const dismissedInsights = sqliteTable('dismissed_insights', {
  key: text('key').primaryKey(),
  dismissedAt: integer('dismissed_at', { mode: 'timestamp_ms' }).notNull(),
});

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  text: text('text').notNull(),

  /** 이 답변으로 바뀐 내용. 되돌리기에 쓴다. */
  batchId: text('batch_id'),
  isError: integer('is_error', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/** 채팅 한 번으로 바뀐 것들의 이전 상태. */
export const changeBatches = sqliteTable('change_batches', {
  id: text('id').primaryKey(),
  before: text('before', { mode: 'json' }).$type<ChangeSnapshot>().notNull(),
  undoneAt: integer('undone_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/** 하루에 한 번 아침 제안을 했는지 같은 작은 상태. */
export const kv = sqliteTable('kv', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type GroupRow = typeof groups.$inferSelect;
export type SuggestionRow = typeof suggestions.$inferSelect;
export type FactRow = typeof facts.$inferSelect;

/** 바뀌기 전 행. JSON 칼럼에 저장하므로 날짜는 ms 숫자로 둔다. */
export type SerializedRow = Record<string, unknown>;

export interface ChangeSnapshot {
  tasks: { id: string; before: SerializedRow | null }[];

  facts: { id: string; before: SerializedRow | null }[];

  createdSuggestionIds: string[];
}
