import { useState } from 'react';

import type { Fact } from '@shared/task';

import { Dialog } from '../../shared/ui/Dialog';
import { useUiStore } from '../../shared/uiStore';
import { useProfile, useProfileActions } from './api';

/** AI가 배치를 제안할 때 참고하는 내용. 내가 말한 것과 기록에서 뽑은 것을 보여 주고 고칠 수 있게 한다. */
export function ProfileSheet() {
  const { profileOpen, setProfileOpen } = useUiStore();
  const { data } = useProfile(profileOpen);
  const actions = useProfileActions();
  const [draft, setDraft] = useState('');

  return (
    <Dialog open={profileOpen} title="Plop이 아는 나" variant="sheet" onClose={() => setProfileOpen(false)}>
      <p className="mb-5 text-sm leading-relaxed text-ink-muted">AI가 할 일을 배치할 때 이 내용을 참고해요. 틀린 건 고치거나 지워 주세요.</p>

      <section className="mb-6">
        <h3 className="mb-2 text-sm font-semibold">내가 알려 준 것</h3>
        <form
          className="mb-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            actions.add.mutate(draft.trim());
            setDraft('');
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="예: 오전에 집중이 잘 된다"
            aria-label="알려 줄 내용"
            className="w-full rounded-lg bg-surface-muted px-3 py-2 text-sm outline-none placeholder:text-ink-muted"
          />
        </form>
        {data?.facts.length === 0 ? <p className="py-2 text-sm text-ink-muted">채팅에서 습관이나 선호를 말하면 여기에 남아요.</p> : null}
        <ul className="flex flex-col gap-1">
          {data?.facts.map((fact) => (
            <FactRow key={fact.id} fact={fact} onSave={(text) => actions.edit.mutate({ id: fact.id, text })} onDelete={() => actions.remove.mutate(fact.id)} />
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">캘린더 기록에서 뽑은 것</h3>
        {data?.insights.length === 0 ? (
          <p className="py-2 text-sm text-ink-muted">아직 기록이 적어요. 할 일을 완료하거나 옮길수록 쌓여요.</p>
        ) : null}
        <ul className="flex flex-col gap-1">
          {data?.insights.map((insight) => (
            <li key={insight.key} className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-muted">
              <span className="flex-1">{insight.text}</span>
              <button type="button" className="hidden text-xs text-ink-muted group-hover:block hover:text-ink" onClick={() => actions.dismissInsight.mutate(insight.key)}>
                숨기기
              </button>
            </li>
          ))}
        </ul>
      </section>
    </Dialog>
  );
}

function FactRow({ fact, onSave, onDelete }: { fact: Fact; onSave: (text: string) => void; onDelete: () => void }) {
  const [text, setText] = useState(fact.text);
  const commit = () => {
    const next = text.trim();
    if (next && next !== fact.text) onSave(next);
    else setText(fact.text);
  };

  return (
    <li className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-muted">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && (e.target as HTMLInputElement).blur()}
        aria-label="알려 준 내용"
        className="min-w-0 flex-1 bg-transparent py-0.5 text-sm outline-none"
      />
      <span className="text-xs text-ink-muted group-hover:hidden">{fact.source === 'chat' ? '채팅' : '직접'}</span>
      <button type="button" className="hidden text-xs text-ink-muted group-hover:block hover:text-accent" onClick={onDelete}>
        지우기
      </button>
    </li>
  );
}
