import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CalendarView, CreateTaskInput, OccurrenceChangeInput, UpdateTaskInput } from '@shared/task';

import { api, unwrap } from '../../shared/api';
import { queryKeys } from '../../shared/queryKeys';

export interface DateRange {
  from: Date;

  to: Date;
}

export function useCalendar(range: DateRange | null) {
  const from = range?.from.toISOString() ?? '';
  const to = range?.to.toISOString() ?? '';
  return useQuery({
    queryKey: queryKeys.calendarRange(from, to),
    queryFn: (): Promise<CalendarView> => unwrap(api.calendar.$get({ query: { from, to } })),
    enabled: range !== null,
    // 날짜를 넘길 때 이전 기간을 잠깐 유지해 화면이 비었다 채워지지 않게 한다.
    placeholderData: keepPreviousData,
    // 끝날 시간이 지난 일정을 옮기자는 제안을 놓치지 않게 1분마다 다시 읽는다.
    refetchInterval: 60_000,
  });
}

/** 할 일이 바뀌면 캘린더와 오른쪽 목록을 함께 다시 읽는다. */
function useInvalidateTasks() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.calendar }),
      client.invalidateQueries({ queryKey: queryKeys.inbox }),
      client.invalidateQueries({ queryKey: queryKeys.profile }),
    ]);
}

export function useTaskActions() {
  const invalidate = useInvalidateTasks();
  const options = { onSettled: invalidate };

  return {
    create: useMutation({ mutationFn: (json: CreateTaskInput) => unwrap(api.tasks.$post({ json })), ...options }),
    update: useMutation({
      mutationFn: ({ id, ...json }: UpdateTaskInput & { id: string }) => unwrap(api.tasks[':id'].$patch({ param: { id }, json })),
      ...options,
    }),
    remove: useMutation({ mutationFn: (id: string) => unwrap(api.tasks[':id'].$delete({ param: { id } })), ...options }),
    complete: useMutation({
      mutationFn: ({ id, done, occurrenceStartsAt }: { id: string; done: boolean; occurrenceStartsAt?: string | undefined }) =>
        unwrap(
          api.tasks[':id'].complete.$post({
            param: { id },
            json: occurrenceStartsAt ? { done, occurrenceStartsAt } : { done },
          }),
        ),
      ...options,
    }),
    changeOccurrence: useMutation({
      mutationFn: ({ id, ...json }: OccurrenceChangeInput & { id: string }) =>
        unwrap(api.tasks[':id'].occurrence.$post({ param: { id }, json })),
      ...options,
    }),
  };
}
