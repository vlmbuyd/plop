import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ChatMessage } from '@shared/task';

import { api, unwrap } from '../../shared/api';
import { queryKeys } from '../../shared/queryKeys';

export function useChatHistory() {
  return useQuery({ queryKey: queryKeys.chat, queryFn: (): Promise<ChatMessage[]> => unwrap(api.chat.$get()) });
}

function useInvalidateAll() {
  const client = useQueryClient();
  return () => client.invalidateQueries();
}

export function useSendChat() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (text: string): Promise<ChatMessage[]> => unwrap(api.chat.$post({ json: { text } })), onSettled: invalidate });
}

export function useUndoChat() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (batchId: string) => unwrap(api.chat.undo[':batchId'].$post({ param: { batchId } })),
    onSettled: invalidate,
  });
}
