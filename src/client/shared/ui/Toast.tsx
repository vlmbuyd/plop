import { useEffect } from 'react';

import { useUiStore } from '../uiStore';

export function Toast() {
  const notice = useUiStore((s) => s.notice);
  const clear = useUiStore((s) => s.clearNotice);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(clear, 4000);
    return () => clearTimeout(timer);
  }, [notice, clear]);

  if (!notice) return null;
  return (
    <div role="status" className="fixed top-4 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-ink px-4 py-2 text-sm text-white shadow-lg">
      {notice.text}
    </div>
  );
}
