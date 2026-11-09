import { autoUpdate, flip, offset, shift, useDismiss, useFloating, useInteractions, type Placement } from '@floating-ui/react';
import { useEffect, type ReactNode } from 'react';

interface PopoverProps {
  /** 기준이 되는 화면 위치. 캘린더 칸처럼 DOM 기준이 없을 때 사각형을 넘긴다. */
  anchor: DOMRect | HTMLElement;

  onClose: () => void;

  children: ReactNode;

  placement?: Placement;
}

export function Popover({ anchor, onClose, children, placement = 'right-start' }: PopoverProps) {
  const { refs, floatingStyles, context } = useFloating({
    open: true,
    onOpenChange: (open) => !open && onClose(),
    placement,
    middleware: [offset(8), flip({ fallbackAxisSideDirection: 'start' }), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  });
  const dismiss = useDismiss(context, { outsidePressEvent: 'mousedown' });
  const { getFloatingProps } = useInteractions([dismiss]);

  useEffect(() => {
    if (anchor instanceof HTMLElement) refs.setReference(anchor);
    else refs.setPositionReference({ getBoundingClientRect: () => anchor });
  }, [anchor, refs]);

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className="z-50 w-72 rounded-xl border border-line bg-surface p-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
      {...getFloatingProps()}
    >
      {children}
    </div>
  );
}
