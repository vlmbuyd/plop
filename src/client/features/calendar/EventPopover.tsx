import { useState } from 'react';

import { describeRecurrence, type Recurrence } from '@shared/recurrence';
import type { CalendarItem } from '@shared/task';

import { formatRange } from '../../shared/time';
import { Icon } from '../../shared/ui/Icon';
import { Popover } from '../../shared/ui/Popover';

type RecurrenceChoice = 'none' | 'daily' | 'weekdays' | 'weekly';

function toChoice(rule: Recurrence | null): RecurrenceChoice {
  return rule?.freq ?? 'none';
}

interface EventPopoverProps {
  item: CalendarItem;

  anchor: HTMLElement;

  onClose: () => void;

  onRename: (title: string) => void;

  onToggleDone: () => void;

  onUnschedule: () => void;

  onDelete: () => void;

  onRecurrenceChange: (rule: Recurrence | null) => void;
}

export function EventPopover({ item, anchor, onClose, onRename, onToggleDone, onUnschedule, onDelete, onRecurrenceChange }: EventPopoverProps) {
  const [title, setTitle] = useState(item.title);
  const start = new Date(item.startsAt);
  const recurring = item.recurrence !== null;

  const commitTitle = () => {
    const next = title.trim();
    if (next && next !== item.title) onRename(next);
  };

  const changeRecurrence = (choice: RecurrenceChoice) => {
    if (choice === 'none') onRecurrenceChange(null);
    else if (choice === 'weekly') onRecurrenceChange({ freq: 'weekly', days: [start.getDay()] });
    else onRecurrenceChange({ freq: choice });
  };

  return (
    <Popover anchor={anchor} onClose={() => (commitTitle(), onClose())}>
      <div className="plop-popover flex flex-col gap-3">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              commitTitle();
              onClose();
            }
          }}
          aria-label="제목"
          className="w-full rounded-md px-1 py-0.5 text-[15px] font-semibold outline-none focus:bg-surface-muted"
        />

        <p className="px-1 text-sm text-ink-muted">{formatRange(start, new Date(item.endsAt), item.allDay)}</p>

        <label className="flex items-center gap-2 px-1 text-sm text-ink-muted">
          <Icon name="repeat" />
          <select
            value={toChoice(item.recurrence)}
            onChange={(e) => changeRecurrence(e.target.value as RecurrenceChoice)}
            className="rounded-md bg-transparent py-1 text-ink outline-none hover:bg-surface-muted"
          >
            <option value="none">반복 안 함</option>
            <option value="daily">매일</option>
            <option value="weekdays">평일마다</option>
            <option value="weekly">{item.recurrence?.freq === 'weekly' ? describeRecurrence(item.recurrence) : `매주 ${start.toLocaleDateString('ko-KR', { weekday: 'short' })}`}</option>
          </select>
        </label>

        <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
          <PopoverButton onClick={onToggleDone}>{item.done ? '완료 취소' : '완료'}</PopoverButton>
          {!recurring ? <PopoverButton onClick={onUnschedule}>목록으로 보내기</PopoverButton> : null}
          <PopoverButton onClick={onDelete} tone="danger">
            삭제
          </PopoverButton>
        </div>
      </div>
    </Popover>
  );
}

export function PopoverButton({ onClick, children, tone = 'default' }: { onClick: () => void; children: React.ReactNode; tone?: 'default' | 'primary' | 'danger' }) {
  const tones = {
    default: 'border border-line hover:bg-surface-muted',
    primary: 'bg-ink text-white hover:bg-ink/90',
    danger: 'border border-line text-accent hover:bg-accent/5',
  };
  return (
    <button type="button" onClick={onClick} className={`rounded-md px-2.5 py-1 text-sm ${tones[tone]}`}>
      {children}
    </button>
  );
}
