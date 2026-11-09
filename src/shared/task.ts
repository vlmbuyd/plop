import { z } from 'zod';

import { recurrenceSchema, type Recurrence } from './recurrence';

/** 캘린더에 그리는 한 칸. 반복 일정은 회차마다 하나씩 만든다. */
export interface CalendarItem {
  /** 반복 일정의 회차면 `${taskId}@${회차 시작 ms}`, 아니면 taskId. */
  id: string;

  taskId: string;

  title: string;

  startsAt: string;

  endsAt: string;

  allDay: boolean;

  done: boolean;

  /** 반복 일정의 회차면 그 규칙. 한 회차만 바꾼 할 일은 null이다. */
  recurrence: Recurrence | null;

  occurrenceStartsAt: string | null;
}

export interface SuggestionView {
  id: string;

  taskId: string;

  kind: 'place' | 'move';

  title: string;

  startsAt: string;

  endsAt: string;

  reason: string;
}

export interface CalendarView {
  items: CalendarItem[];

  suggestions: SuggestionView[];
}

export interface InboxTask {
  id: string;

  title: string;

  durationMinutes: number | null;

  /** AI가 배치를 제안했으면 그 시작 시각. */
  suggestedStartsAt: string | null;

  createdAt: string;
}

export interface InboxGroup {
  id: string;

  name: string;

  tasks: InboxTask[];
}

export interface InboxView {
  groups: InboxGroup[];

  /** AI가 아직 묶지 않은 할 일. */
  ungrouped: InboxTask[];

  groupingPending: boolean;
}

export interface Fact {
  id: string;

  text: string;

  source: 'chat' | 'user';

  createdAt: string;
}

export interface Insight {
  key: string;

  kind: 'postponed' | 'peak-hours' | 'overrun';

  text: string;
}

export interface ChatMessage {
  id: string;

  role: 'user' | 'assistant';

  text: string;

  /** 이 답변으로 바뀐 것이 있으면 되돌리기에 쓴다. */
  batchId: string | null;

  undone: boolean;

  isError: boolean;

  createdAt: string;
}

export const rangeQuerySchema = z
  .object({ from: z.iso.datetime(), to: z.iso.datetime() })
  .refine(({ from, to }) => from < to, { message: 'from must be before to' });

const titleSchema = z.string().trim().min(1).max(200);

export const createTaskSchema = z.object({
  title: titleSchema,
  startsAt: z.iso.datetime().nullable().optional(),
  endsAt: z.iso.datetime().nullable().optional(),
  allDay: z.boolean().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  durationMinutes: z.number().int().min(5).max(24 * 60).nullable().optional(),
});

export const updateTaskSchema = z.object({
  title: titleSchema.optional(),
  /** null이면 캘린더에서 빼서 오른쪽 목록으로 되돌린다. */
  startsAt: z.iso.datetime().nullable().optional(),
  endsAt: z.iso.datetime().nullable().optional(),
  allDay: z.boolean().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  groupId: z.string().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export const completeTaskSchema = z.object({
  done: z.boolean(),
  /** 반복 일정이면 어느 회차인지. */
  occurrenceStartsAt: z.iso.datetime().optional(),
});

export const occurrenceChangeSchema = z.object({
  occurrenceStartsAt: z.iso.datetime(),
  scope: z.enum(['this', 'following']),
  change: z.discriminatedUnion('type', [
    z.object({ type: z.literal('move'), startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), allDay: z.boolean() }),
    z.object({ type: z.literal('rename'), title: titleSchema }),
    z.object({ type: z.literal('delete') }),
  ]),
});

export const chatInputSchema = z.object({ text: z.string().trim().min(1).max(2000) });

export const factInputSchema = z.object({ text: z.string().trim().min(1).max(300) });

export const planInputSchema = z.object({
  /** YYYY-MM-DD. 없으면 오늘(밤 9시가 넘었으면 내일). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** HH:mm. 이 시간대 안에서만 배치한다. */
  from: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  to: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type OccurrenceChangeInput = z.infer<typeof occurrenceChangeSchema>;
export type PlanInput = z.infer<typeof planInputSchema>;
