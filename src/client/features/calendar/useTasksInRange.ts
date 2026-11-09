import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api } from '../../shared/api';

export interface DateRange {
  from: Date;

  to: Date;
}

export function useTasksInRange(range: DateRange | null) {
  return useQuery({
    queryKey: ['tasks', range?.from.toISOString(), range?.to.toISOString()],
    queryFn: async () => {
      const res = await api.tasks.$get({
        query: { from: range!.from.toISOString(), to: range!.to.toISOString() },
      });
      if (!res.ok) throw new Error(`할 일을 불러오지 못했습니다 (${res.status})`);
      return res.json();
    },
    enabled: range !== null,
    // 날짜를 넘길 때 이전 기간 일정을 잠깐 유지해 화면이 비었다 채워지지 않게 한다.
    placeholderData: keepPreviousData,
  });
}
