import { useEffect, useRef, useState } from 'react';

import type { ChatMessage } from '@shared/task';

import { Icon } from '../../shared/ui/Icon';
import { useUiStore } from '../../shared/uiStore';
import { useChatHistory, useSendChat, useUndoChat } from './api';

/** 캘린더 아래 가운데에 늘 떠 있는 입력창. 글로 시키면 AI가 바로 반영한다. */
export function ChatDock() {
  const { data: history = [] } = useChatHistory();
  const send = useSendChat();
  const undo = useUndoChat();
  const focusChatInput = useUiStore((s) => s.focusChatInput);
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  // 새로 고침했을 때 지난 대화가 캘린더를 가리지 않도록, 이번에 연 뒤 나눈 대화만 펼쳐 둔다.
  const [openedAt] = useState(() => new Date().toISOString());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusChatInput > 0) inputRef.current?.focus();
  }, [focusChatInput]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [history.length, expanded, send.isPending]);

  const submit = () => {
    const next = text.trim();
    if (!next || send.isPending) return;
    setText('');
    setDismissedId(null);
    send.mutate(next);
  };

  const last = history.at(-1);
  const pendingText = send.isPending ? send.variables : null;
  const showLast = last && last.role === 'assistant' && last.id !== dismissedId && last.createdAt > openedAt;
  const visible: ChatMessage[] = expanded ? history : showLast ? history.slice(-2) : [];

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-[640px] flex-col gap-2">
        {!expanded && !showLast && !pendingText && history.length > 0 ? (
          <button type="button" className="self-center rounded-full bg-surface/90 px-3 py-1 text-xs text-ink-muted shadow-sm hover:text-ink" onClick={() => setExpanded(true)}>
            이전 대화 보기
          </button>
        ) : null}

        {visible.length > 0 || pendingText ? (
          <div className="rounded-2xl border border-line bg-surface/95 shadow-[0_8px_30px_rgba(0,0,0,0.10)] backdrop-blur">
            <div className="flex items-center justify-between px-4 pt-2.5">
              <button type="button" className="text-xs text-ink-muted hover:text-ink" onClick={() => setExpanded((v) => !v)}>
                {expanded ? '최근 대화만 보기' : '이전 대화 보기'}
              </button>
              {!expanded && last ? (
                <button type="button" aria-label="대화 닫기" className="text-xs text-ink-muted hover:text-ink" onClick={() => setDismissedId(last.id)}>
                  닫기
                </button>
              ) : null}
            </div>
            <div ref={logRef} className={`flex flex-col gap-2 overflow-y-auto px-4 pt-2 pb-3 ${expanded ? 'max-h-[50vh]' : 'max-h-56'}`}>
              {visible.map((m) => (
                <Message key={m.id} message={m} onUndo={(batchId) => undo.mutate(batchId)} undoing={undo.isPending} />
              ))}
              {pendingText ? (
                <>
                  <Bubble role="user">{pendingText}</Bubble>
                  <p className="flex items-center gap-1 text-sm text-ink-muted">
                    반영하는 중
                    <span className="inline-flex gap-0.5">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="size-1 animate-bounce rounded-full bg-ink-muted" style={{ animationDelay: `${i * 120}ms` }} />
                      ))}
                    </span>
                  </p>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 pl-4 shadow-[0_8px_30px_rgba(0,0,0,0.10)]"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') inputRef.current?.blur();
            }}
            placeholder="글로 시켜 보세요. 예: 내일 오후 2시 치과, 오늘 오후 다시 짜 줘 (/)"
            aria-label="Plop에게 시키기"
            className="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-sm leading-6 outline-none placeholder:text-ink-muted [field-sizing:content]"
          />
          <button
            type="submit"
            aria-label="보내기"
            disabled={!text.trim() || send.isPending}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-white transition-opacity disabled:opacity-30"
          >
            <Icon name="send" />
          </button>
        </form>
      </div>
    </div>
  );
}

function Message({ message, onUndo, undoing }: { message: ChatMessage; onUndo: (batchId: string) => void; undoing: boolean }) {
  if (message.role === 'user') return <Bubble role="user">{message.text}</Bubble>;
  return (
    <div className="flex flex-col items-start gap-1">
      <Bubble role="assistant" error={message.isError}>
        {message.text}
      </Bubble>
      {message.batchId ? (
        message.undone ? (
          <span className="px-1 text-xs text-ink-muted">되돌렸어요</span>
        ) : (
          <button
            type="button"
            disabled={undoing}
            onClick={() => onUndo(message.batchId!)}
            className="flex items-center gap-1 rounded px-1 text-xs text-ink-muted hover:text-ink disabled:opacity-50"
          >
            <Icon name="undo" className="size-3" />
            되돌리기
          </button>
        )
      ) : null}
    </div>
  );
}

function Bubble({ role, error = false, children }: { role: 'user' | 'assistant'; error?: boolean; children: React.ReactNode }) {
  return (
    <p
      className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm leading-relaxed whitespace-pre-wrap ${
        role === 'user' ? 'self-end bg-ink text-white' : error ? 'bg-accent/10 text-accent' : 'bg-surface-muted'
      }`}
    >
      {children}
    </p>
  );
}
