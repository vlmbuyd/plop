import { Draggable } from '@fullcalendar/react/interaction';
import { useEffect, useRef, useState } from 'react';

import type { InboxTask } from '@shared/task';

import { formatTime } from '../../shared/time';
import { Icon } from '../../shared/ui/Icon';
import { IconButton } from '../../shared/ui/IconButton';
import { useUiStore } from '../../shared/uiStore';
import { useTaskActions } from '../calendar/api';
import { useInbox } from './api';

const UNGROUPED = '__ungrouped__';

function suggestedLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return formatTime(date);
  if (date.toDateString() === tomorrow.toDateString()) return `내일 ${formatTime(date)}`;
  return `${date.getMonth() + 1}/${date.getDate()} ${formatTime(date)}`;
}

export function InboxPanel() {
  const { inboxOpen, setInboxOpen, focusInboxInput } = useUiStore();
  const showNotice = useUiStore((s) => s.showNotice);
  const { data } = useInbox();
  const actions = useTaskActions();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const onError = (error: Error) => showNotice(error.message);

  useEffect(() => {
    if (focusInboxInput > 0) inputRef.current?.focus();
  }, [focusInboxInput]);

  // 목록의 할 일을 캘린더로 끌어 놓을 수 있게 한다. 놓은 뒤 처리는 캘린더의 drop에서 한다.
  useEffect(() => {
    if (!inboxOpen || !listRef.current) return;
    const draggable = new Draggable(listRef.current, {
      itemSelector: '[data-task-id]',
      eventData: (el) => ({
        title: (el as HTMLElement).dataset.title ?? '',
        duration: { minutes: Number((el as HTMLElement).dataset.duration) || 30 },
        create: false,
      }),
    });
    return () => draggable.destroy();
  }, [inboxOpen]);

  /** 할 일을 끌다가 다른 묶음 위에서 놓으면 그 묶음으로 옮긴다. AI는 이 선택을 다음 묶음에 참고한다. */
  const startGroupDrag = (task: InboxTask, fromGroup: string) => {
    const findGroup = (e: PointerEvent) => (document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-group-drop]') as HTMLElement | null)?.dataset.groupDrop ?? null;
    const onMove = (e: PointerEvent) => {
      const target = findGroup(e);
      setDropTarget(target && target !== fromGroup ? target : null);
    };
    const onUp = (e: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDropTarget(null);
      const target = findGroup(e);
      if (!target || target === fromGroup || target === UNGROUPED) return;
      actions.update.mutate({ id: task.id, groupId: target }, { onError });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (!inboxOpen) return null;

  const total = (data?.groups.reduce((n, g) => n + g.tasks.length, 0) ?? 0) + (data?.ungrouped.length ?? 0);
  const sections = [
    ...(data?.ungrouped.length ? [{ id: UNGROUPED, name: data.groupingPending ? '새로 적은 할 일 (AI가 묶는 중)' : '새로 적은 할 일', tasks: data.ungrouped }] : []),
    ...(data?.groups ?? []),
  ];

  const toggleSection = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside id="inbox-panel" className="flex w-80 shrink-0 flex-col border-l border-line bg-surface">
      <header className="flex h-14 shrink-0 items-center gap-2 pr-3 pl-4">
        <h2 className="mr-auto text-[15px] font-semibold">
          할 일 목록 <span className="ml-1 font-normal text-ink-muted">{total}</span>
        </h2>
        <IconButton icon="close" label="목록 닫기 (I)" onClick={() => setInboxOpen(false)} />
      </header>

      <form
        className="px-3 pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          const next = title.trim();
          if (!next) return;
          actions.create.mutate({ title: next }, { onError });
          setTitle('');
        }}
      >
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="떠오른 할 일을 적고 Enter (N)"
          aria-label="할 일 추가"
          className="w-full rounded-lg bg-surface-muted px-3 py-2 text-sm outline-none placeholder:text-ink-muted focus:ring-1 focus:ring-line"
        />
      </form>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-24">
        {sections.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm leading-relaxed text-ink-muted">
            날짜 없이 적어 둔 할 일이 여기에 모여요.
            <br />
            AI가 비슷한 것끼리 묶어 줘요.
          </p>
        ) : null}

        {sections.map((section) => (
          <section
            key={section.id}
            data-group-drop={section.id}
            className={`mb-2 rounded-lg transition-colors ${dropTarget === section.id ? 'bg-event/60' : ''}`}
          >
            <button
              type="button"
              onClick={() => toggleSection(section.id)}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-ink-muted hover:bg-surface-muted"
              aria-expanded={!collapsed.has(section.id)}
            >
              <svg viewBox="0 0 16 16" className={`size-3 transition-transform ${collapsed.has(section.id) ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="m4 6 4 4 4-4" />
              </svg>
              <span className={section.id === UNGROUPED && data?.groupingPending ? 'animate-pulse' : ''}>{section.name}</span>
              <span className="ml-auto font-normal">{section.tasks.length}</span>
            </button>

            {!collapsed.has(section.id) ? (
              <ul className="flex flex-col gap-0.5">
                {section.tasks.map((task) => (
                  <li
                    key={task.id}
                    data-task-id={task.id}
                    data-title={task.title}
                    data-duration={task.durationMinutes ?? 30}
                    onPointerDown={(e) => {
                      if (!(e.target as Element).closest('button')) startGroupDrag(task, section.id);
                    }}
                    className="group flex cursor-grab items-center gap-2 rounded-md bg-event/50 px-2 py-1.5 text-sm hover:bg-event active:cursor-grabbing"
                  >
                    <button
                      type="button"
                      aria-label={`${task.title} 완료`}
                      onClick={() => actions.complete.mutate({ id: task.id, done: true }, { onError })}
                      className="size-3.5 shrink-0 rounded-[3px] border-[1.5px] border-ink/40 hover:border-ink"
                    />
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    {task.suggestedStartsAt ? (
                      <span className="flex shrink-0 items-center gap-0.5 text-xs text-suggestion" title="AI가 이 시각을 제안했어요">
                        <Icon name="sparkle" className="size-3" />
                        {suggestedLabel(task.suggestedStartsAt)}
                      </span>
                    ) : task.durationMinutes ? (
                      <span className="shrink-0 text-xs text-ink-muted">{task.durationMinutes}분</span>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`${task.title} 삭제`}
                      onClick={() => actions.remove.mutate(task.id, { onError })}
                      className="hidden size-5 shrink-0 place-items-center rounded text-ink-muted group-hover:grid hover:bg-surface hover:text-accent"
                    >
                      <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </aside>
  );
}
