import { useEffect, useId, useRef, type ReactNode } from 'react';

import { IconButton } from './IconButton';

interface DialogProps {
  open: boolean;

  title: string;

  onClose: () => void;

  children: ReactNode;

  /** sheet면 오른쪽에서 열리는 패널로 보여 준다. */
  variant?: 'center' | 'sheet';
}

/** 브라우저 기본 dialog를 써서 포커스 가두기와 Esc 닫기를 그대로 쓴다. */
export function Dialog({ open, title, onClose, children, variant = 'center' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const layout =
    variant === 'sheet'
      ? 'ml-auto mr-0 h-dvh max-h-dvh w-[420px] max-w-full rounded-none'
      : 'm-auto w-[480px] max-w-[calc(100%-32px)] rounded-2xl';

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={`${layout} border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/20`}
    >
      {open ? (
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            <IconButton icon="close" label="닫기" onClick={onClose} />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}
