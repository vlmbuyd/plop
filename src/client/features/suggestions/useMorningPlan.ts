import { useEffect, useRef } from 'react';

import { useUiStore } from '../../shared/uiStore';
import { useSuggestionActions } from './api';

/** 하루 처음 열 때 한 번, 오른쪽 목록의 할 일을 오늘 빈 시간에 놓아 본다. 서버가 하루 한 번만 실행한다. */
export function useMorningPlan() {
  const { morning } = useSuggestionActions();
  const showNotice = useUiStore((s) => s.showNotice);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    morning.mutate(undefined, {
      onSuccess: (result) => {
        if (!result.skipped && result.result.created > 0) {
          showNotice(`좋은 아침이에요. 오늘 빈 시간에 할 일 ${result.result.created}개를 놓아 봤어요.`);
        }
      },
    });
  }, [morning, showNotice]);
}
