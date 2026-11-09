import { Dialog } from '../../shared/ui/Dialog';
import { PopoverButton } from './EventPopover';

interface RecurrenceScopeDialogProps {
  open: boolean;

  actionLabel: string;

  onChoose: (scope: 'this' | 'following') => void;

  onCancel: () => void;
}

/** 반복 일정의 한 회차를 바꿀 때 이 일정만인지 이후 모두인지 묻는다. */
export function RecurrenceScopeDialog({ open, actionLabel, onChoose, onCancel }: RecurrenceScopeDialogProps) {
  return (
    <Dialog open={open} title={`반복 일정 ${actionLabel}`} onClose={onCancel}>
      <p className="mb-4 text-sm text-ink-muted">어느 일정에 적용할까요?</p>
      <div className="flex justify-end gap-2">
        <PopoverButton onClick={onCancel}>취소</PopoverButton>
        <PopoverButton onClick={() => onChoose('following')}>이후 모든 일정</PopoverButton>
        <PopoverButton tone="primary" onClick={() => onChoose('this')}>
          이 일정만
        </PopoverButton>
      </div>
    </Dialog>
  );
}
