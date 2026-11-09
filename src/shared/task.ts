import { z } from 'zod';

/** 화면과 서버가 주고받는 할 일. 날짜가 없으면(startsAt이 null) 오른쪽 목록에 놓인다. */
export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),

  /** ISO 8601 UTC. 하루 종일 할 일은 그날 로컬 자정이다. */
  startsAt: z.iso.datetime().nullable(),

  endsAt: z.iso.datetime().nullable(),

  allDay: z.boolean(),

  completedAt: z.iso.datetime().nullable(),

  createdAt: z.iso.datetime(),

  updatedAt: z.iso.datetime(),
});

export type Task = z.infer<typeof taskSchema>;

/** 캘린더에 보이는 기간. from 이상, to 미만. */
export const taskRangeQuerySchema = z
  .object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  })
  .refine(({ from, to }) => from < to, { message: 'from must be before to' });
