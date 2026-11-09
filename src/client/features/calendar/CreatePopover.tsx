import { useState } from 'react';

import { formatRange } from '../../shared/time';
import { Popover } from '../../shared/ui/Popover';

interface CreatePopoverProps {
  anchor: DOMRect;

  start: Date;

  end: Date;

  allDay: boolean;

  onCreate: (title: string) => void;

  onClose: () => void;
}

export function CreatePopover({ anchor, start, end, allDay, onCreate, onClose }: CreatePopoverProps) {
  const [title, setTitle] = useState('');

  const submit = () => {
    const next = title.trim();
    if (next) onCreate(next);
    onClose();
  };

  return (
    <Popover anchor={anchor} onClose={onClose}>
      <form
        className="plop-popover flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="할 일 이름"
          aria-label="할 일 이름"
          className="w-full rounded-md bg-surface-muted px-2.5 py-2 text-sm outline-none"
        />
        <p className="px-1 text-xs text-ink-muted">{formatRange(start, end, allDay)}</p>
      </form>
    </Popover>
  );
}
