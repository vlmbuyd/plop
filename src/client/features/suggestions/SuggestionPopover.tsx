import type { SuggestionView } from '@shared/task';

import { formatRange } from '../../shared/time';
import { Popover } from '../../shared/ui/Popover';
import { useUiStore } from '../../shared/uiStore';
import { PopoverButton } from '../calendar/EventPopover';
import { useSuggestionActions } from './api';

export function SuggestionPopover({ suggestion, anchor, onClose }: { suggestion: SuggestionView; anchor: HTMLElement; onClose: () => void }) {
  const { accept, dismiss } = useSuggestionActions();
  const showNotice = useUiStore((s) => s.showNotice);
  const onError = (error: Error) => showNotice(error.message);

  return (
    <Popover anchor={anchor} onClose={onClose}>
      <div className="plop-popover flex flex-col gap-2">
        <p className="text-xs font-medium text-suggestion">AI 제안</p>
        <p className="text-[15px] font-semibold">{suggestion.title}</p>
        <p className="text-sm text-ink-muted">{formatRange(new Date(suggestion.startsAt), new Date(suggestion.endsAt), false)}</p>
        <p className="text-sm">{suggestion.reason}</p>
        <div className="flex gap-1.5 border-t border-line pt-3">
          <PopoverButton tone="primary" onClick={() => (accept.mutate(suggestion.id, { onError }), onClose())}>
            확정
          </PopoverButton>
          <PopoverButton onClick={() => (dismiss.mutate(suggestion.id, { onError }), onClose())}>지우기</PopoverButton>
        </div>
      </div>
    </Popover>
  );
}
