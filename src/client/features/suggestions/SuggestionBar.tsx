import type { SuggestionView } from '@shared/task';

import { useUiStore } from '../../shared/uiStore';
import { PopoverButton } from '../calendar/EventPopover';
import { useSuggestionActions } from './api';

/** 지금 보이는 기간에 AI 제안이 있으면 헤더 아래에 한 줄로 알린다. */
export function SuggestionBar({ suggestions }: { suggestions: SuggestionView[] }) {
  const { accept, dismiss, acceptAll } = useSuggestionActions();
  const showNotice = useUiStore((s) => s.showNotice);
  if (suggestions.length === 0) return null;

  const moves = suggestions.filter((s) => s.kind === 'move');
  const places = suggestions.filter((s) => s.kind === 'place');
  const onError = (error: Error) => showNotice(error.message);

  return (
    <div className="mx-5 mb-2 flex flex-col gap-1.5 rounded-lg bg-suggestion-soft px-3 py-2 text-sm">
      {moves.map((s) => (
        <div key={s.id} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">
            <strong className="font-medium">‘{s.title}’</strong> {s.reason}
          </span>
          <PopoverButton tone="primary" onClick={() => accept.mutate(s.id, { onError })}>
            옮기기
          </PopoverButton>
          <PopoverButton onClick={() => dismiss.mutate(s.id, { onError })}>그대로 두기</PopoverButton>
        </div>
      ))}
      {places.length > 0 ? (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1">
            AI가 할 일 {places.length}개를 빈 시간에 흐리게 놓았어요. 하나씩 눌러 확정하거나 한 번에 확정할 수 있어요.
          </span>
          <PopoverButton tone="primary" onClick={() => acceptAll.mutate(undefined, { onError })}>
            모두 확정
          </PopoverButton>
          <PopoverButton onClick={() => places.forEach((s) => dismiss.mutate(s.id, { onError }))}>모두 지우기</PopoverButton>
        </div>
      ) : null}
    </div>
  );
}
