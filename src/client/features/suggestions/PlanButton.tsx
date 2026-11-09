import { Icon } from '../../shared/ui/Icon';
import { useUiStore } from '../../shared/uiStore';
import { useSuggestionActions } from './api';

/** 오른쪽 목록의 할 일을 오늘 빈 시간에 배치해 보라고 AI에게 요청한다. */
export function PlanButton() {
  const { plan } = useSuggestionActions();
  const showNotice = useUiStore((s) => s.showNotice);

  return (
    <button
      type="button"
      data-plan-button
      disabled={plan.isPending}
      onClick={() =>
        plan.mutate(
          {},
          {
            onSuccess: (result) => showNotice(result.created > 0 ? `제안 ${result.created}개를 흐리게 놓았어요. 눌러서 확정해 주세요.` : (result.message ?? '제안할 게 없어요.')),
            onError: (error) => showNotice(error.message),
          },
        )
      }
      className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-surface-muted disabled:opacity-60"
      title="계획 짜기 (P)"
    >
      <Icon name="sparkle" className={`size-4 ${plan.isPending ? 'animate-pulse' : ''}`} />
      {plan.isPending ? '계획 짜는 중…' : '계획 짜기'}
    </button>
  );
}
