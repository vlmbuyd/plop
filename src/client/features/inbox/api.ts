import { useQuery } from '@tanstack/react-query';

import type { InboxView } from '@shared/task';

import { api, unwrap } from '../../shared/api';
import { queryKeys } from '../../shared/queryKeys';

export function useInbox() {
  return useQuery({
    queryKey: queryKeys.inbox,
    queryFn: (): Promise<InboxView> => unwrap(api.inbox.$get()),
    // AI가 묶는 동안에는 자주 다시 읽어 묶음이 바로 보이게 한다.
    refetchInterval: (query) => (query.state.data?.groupingPending ? 1500 : false),
  });
}
