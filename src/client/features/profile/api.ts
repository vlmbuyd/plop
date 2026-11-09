import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Fact, Insight } from '@shared/task';

import { api, unwrap } from '../../shared/api';
import { queryKeys } from '../../shared/queryKeys';

export function useProfile(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.profile, queryFn: (): Promise<{ facts: Fact[]; insights: Insight[] }> => unwrap(api.profile.$get()), enabled });
}

export function useProfileActions() {
  const client = useQueryClient();
  const onSettled = () => client.invalidateQueries({ queryKey: queryKeys.profile });

  return {
    add: useMutation({ mutationFn: (text: string) => unwrap(api.profile.facts.$post({ json: { text } })), onSettled }),
    edit: useMutation({
      mutationFn: ({ id, text }: { id: string; text: string }) => unwrap(api.profile.facts[':id'].$patch({ param: { id }, json: { text } })),
      onSettled,
    }),
    remove: useMutation({ mutationFn: (id: string) => unwrap(api.profile.facts[':id'].$delete({ param: { id } })), onSettled }),
    dismissInsight: useMutation({
      mutationFn: (key: string) => unwrap(api.profile.insights[':key'].$delete({ param: { key } })),
      onSettled,
    }),
  };
}
