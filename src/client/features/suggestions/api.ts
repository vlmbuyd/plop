import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { PlanInput } from '@shared/task';

import { api, unwrap } from '../../shared/api';
import { queryKeys } from '../../shared/queryKeys';

export function useSuggestionActions() {
  const client = useQueryClient();
  const onSettled = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.calendar }),
      client.invalidateQueries({ queryKey: queryKeys.inbox }),
    ]);

  return {
    accept: useMutation({ mutationFn: (id: string) => unwrap(api.suggestions[':id'].accept.$post({ param: { id } })), onSettled }),
    dismiss: useMutation({ mutationFn: (id: string) => unwrap(api.suggestions[':id'].$delete({ param: { id } })), onSettled }),
    acceptAll: useMutation({ mutationFn: () => unwrap(api.suggestions['accept-all'].$post()), onSettled }),
    plan: useMutation({ mutationFn: (json: PlanInput = {}) => unwrap(api.suggestions.plan.$post({ json })), onSettled }),
    morning: useMutation({ mutationFn: () => unwrap(api.suggestions.morning.$post()), onSettled }),
  };
}
