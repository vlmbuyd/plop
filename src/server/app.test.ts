import { describe, expect, it } from 'vitest';

import type { CalendarView, ChatMessage, InboxView } from '../shared/task';
import { offerReschedules } from './services/planning';
import { setup } from './testing';

const local = (d: number, h = 0, m = 0) => new Date(2026, 10, d, h, m);
const iso = (d: number, h = 0, m = 0) => local(d, h, m).toISOString();
const week = `?from=${iso(9)}&to=${iso(16)}`;

async function calendar(call: ReturnType<typeof setup>['call']) {
  return (await call<CalendarView>('GET', `/calendar${week}`)).body;
}

describe('할 일 만들고 옮기기', () => {
  it('시간 일정을 만들면 캘린더에, 날짜가 없으면 오른쪽 목록에 들어간다', async () => {
    const { call } = setup();
    await call('POST', '/tasks', { title: '치과', startsAt: iso(10, 14), endsAt: iso(10, 15) });
    await call('POST', '/tasks', { title: '이력서 고치기' });

    const cal = await calendar(call);
    expect(cal.items.map((i) => i.title)).toEqual(['치과']);

    const inbox = (await call<InboxView>('GET', '/inbox')).body;
    expect(inbox.ungrouped.map((t) => t.title)).toEqual(['이력서 고치기']);
  });

  it('끝 시각 없이 만들면 30분 일정이 된다', async () => {
    const { call } = setup();
    await call('POST', '/tasks', { title: '전화', startsAt: iso(10, 9) });
    expect((await calendar(call)).items[0]).toMatchObject({ startsAt: iso(10, 9), endsAt: iso(10, 9, 30) });
  });

  it('옮기면 길이를 유지하고, 더 늦은 날로 옮기면 미룬 횟수가 쌓인다', async () => {
    const { call, db } = setup();
    const { body } = await call<{ id: string }>('POST', '/tasks', { title: '테코톡 편집', startsAt: iso(10, 14), endsAt: iso(10, 15) });

    await call('PATCH', `/tasks/${body.id}`, { startsAt: iso(11, 16) });
    await call('PATCH', `/tasks/${body.id}`, { startsAt: iso(12, 10) });

    expect((await calendar(call)).items[0]).toMatchObject({ startsAt: iso(12, 10), endsAt: iso(12, 11) });
    const row = db.query.tasks.findFirst();
    expect((await row)?.postponeCount).toBe(2);
  });

  it('캘린더에서 빼면 오른쪽 목록으로 돌아가고 길이를 예상 시간으로 남긴다', async () => {
    const { call } = setup();
    const { body } = await call<{ id: string }>('POST', '/tasks', { title: '리뷰', startsAt: iso(10, 14), endsAt: iso(10, 15, 30) });

    await call('PATCH', `/tasks/${body.id}`, { startsAt: null });

    expect((await calendar(call)).items).toEqual([]);
    expect((await call<InboxView>('GET', '/inbox')).body.ungrouped[0]).toMatchObject({ title: '리뷰', durationMinutes: 90 });
  });

  it('완료하면 흐리게 남기고, 완료한 날짜 없는 할 일은 목록에서 뺀다', async () => {
    const { call } = setup();
    const a = await call<{ id: string }>('POST', '/tasks', { title: '스터디', startsAt: iso(10, 13) });
    const b = await call<{ id: string }>('POST', '/tasks', { title: '메일 보내기' });

    await call('POST', `/tasks/${a.body.id}/complete`, { done: true });
    await call('POST', `/tasks/${b.body.id}/complete`, { done: true });

    expect((await calendar(call)).items[0]?.done).toBe(true);
    expect((await call<InboxView>('GET', '/inbox')).body.ungrouped).toEqual([]);
  });

  it('없는 할 일을 고치면 404를 돌려준다', async () => {
    const { call } = setup();
    expect((await call('PATCH', '/tasks/nope', { title: 'x' })).status).toBe(404);
  });
});

describe('반복 일정', () => {
  async function createDaily(call: ReturnType<typeof setup>['call']) {
    const { body } = await call<{ id: string }>('POST', '/tasks', {
      title: '알고리즘 스터디',
      startsAt: iso(9, 13),
      endsAt: iso(9, 13, 30),
      recurrence: { freq: 'weekdays' },
    });
    return body.id;
  }

  it('평일 반복은 한 주에 다섯 번 보인다', async () => {
    const { call } = setup();
    await createDaily(call);
    expect((await calendar(call)).items).toHaveLength(5);
  });

  it('회차별로 완료한다', async () => {
    const { call } = setup();
    const id = await createDaily(call);
    await call('POST', `/tasks/${id}/complete`, { done: true, occurrenceStartsAt: iso(10, 13) });

    const done = (await calendar(call)).items.filter((i) => i.done).map((i) => i.startsAt);
    expect(done).toEqual([iso(10, 13)]);
  });

  it('이 일정만 옮기면 그 회차만 바뀌고 나머지는 그대로다', async () => {
    const { call } = setup();
    const id = await createDaily(call);
    await call('POST', `/tasks/${id}/occurrence`, {
      occurrenceStartsAt: iso(11, 13),
      scope: 'this',
      change: { type: 'move', startsAt: iso(11, 16), endsAt: iso(11, 16, 30), allDay: false },
    });

    const starts = (await calendar(call)).items.map((i) => i.startsAt);
    expect(starts).toEqual([iso(9, 13), iso(10, 13), iso(11, 16), iso(12, 13), iso(13, 13)]);
  });

  it('이후 모두 옮기면 그 회차부터 새 시각으로 이어진다', async () => {
    const { call } = setup();
    const id = await createDaily(call);
    await call('POST', `/tasks/${id}/occurrence`, {
      occurrenceStartsAt: iso(11, 13),
      scope: 'following',
      change: { type: 'move', startsAt: iso(11, 9), endsAt: iso(11, 9, 30), allDay: false },
    });

    const starts = (await calendar(call)).items.map((i) => i.startsAt);
    expect(starts).toEqual([iso(9, 13), iso(10, 13), iso(11, 9), iso(12, 9), iso(13, 9)]);
  });

  it('이 일정만 지우면 그 회차만 빠진다', async () => {
    const { call } = setup();
    const id = await createDaily(call);
    await call('POST', `/tasks/${id}/occurrence`, { occurrenceStartsAt: iso(10, 13), scope: 'this', change: { type: 'delete' } });
    expect((await calendar(call)).items).toHaveLength(4);
  });
});

describe('채팅', () => {
  it('AI가 돌려준 변경을 바로 반영하고, 되돌리면 원래대로 돌아간다', async () => {
    const { call } = setup({
      answers: [
        {
          reply: '내일 오후 2시에 치과 일정을 넣었어요.',
          actions: [
            { type: 'create', title: '치과', startsAt: '2026-11-10T14:00', endsAt: '2026-11-10T15:00' },
            { type: 'remember', fact: '오전에 집중이 잘 된다' },
          ],
        },
      ],
    });

    const { body: messages } = await call<ChatMessage[]>('POST', '/chat', { text: '내일 2시 치과, 참고로 난 오전에 집중 잘 돼' });
    expect(messages[1]).toMatchObject({ role: 'assistant', text: '내일 오후 2시에 치과 일정을 넣었어요.' });
    expect((await calendar(call)).items.map((i) => i.title)).toEqual(['치과']);
    expect((await call<{ facts: unknown[] }>('GET', '/profile')).body.facts).toHaveLength(1);

    await call('POST', `/chat/undo/${messages[1]!.batchId}`);

    expect((await calendar(call)).items).toEqual([]);
    expect((await call<{ facts: unknown[] }>('GET', '/profile')).body.facts).toHaveLength(0);
    expect((await call<ChatMessage[]>('GET', '/chat')).body[1]?.undone).toBe(true);
  });

  it('이미 있는 할 일을 옮기고, 되돌리면 원래 시각으로 돌아간다', async () => {
    const { call, ai } = setup();
    const { body } = await call<{ id: string }>('POST', '/tasks', { title: '스터디', startsAt: iso(10, 13), endsAt: iso(10, 14) });
    ai.runner.run = async (request) =>
      request.schema.parse({ reply: '금요일로 옮겼어요.', actions: [{ type: 'update', taskId: body.id, startsAt: '2026-11-13T13:00' }] });

    const { body: messages } = await call<ChatMessage[]>('POST', '/chat', { text: '스터디 금요일로' });
    expect((await calendar(call)).items[0]?.startsAt).toBe(iso(13, 13));

    await call('POST', `/chat/undo/${messages[1]!.batchId}`);
    expect((await calendar(call)).items[0]?.startsAt).toBe(iso(10, 13));
  });

  it('지어낸 ID는 반영하지 않고 알려 준다', async () => {
    const { call } = setup({ answers: [{ reply: '지웠어요.', actions: [{ type: 'delete', taskId: 'made-up' }] }] });
    const { body } = await call<ChatMessage[]>('POST', '/chat', { text: '그거 지워' });
    expect(body[1]?.text).toContain('찾지 못해');
    expect(body[1]?.batchId).toBeNull();
  });

  it('AI가 실패하면 오류 메시지를 남긴다', async () => {
    const { call } = setup({ answers: [new Error('boom')] });
    const { body } = await call<ChatMessage[]>('POST', '/chat', { text: '안녕' });
    expect(body[1]).toMatchObject({ isError: true });
  });

  it('프롬프트에 지금 시각, 일정, 목록이 들어간다', async () => {
    const { call, ai } = setup({ answers: [{ reply: '네.', actions: [] }] });
    await call('POST', '/tasks', { title: '이력서 고치기' });
    await call('POST', '/chat', { text: '오늘 뭐 해?' });
    const prompt = ai.requests.at(-1)!.prompt;
    expect(prompt).toContain('지금: 2026-11-09T10:00 (월요일)');
    expect(prompt).toContain('이력서 고치기');
  });
});

describe('AI 배치 제안', () => {
  it('빈 시간에 맞는 제안만 남기고, 확정하면 일정이 된다', async () => {
    const { call, db } = setup({ now: local(9, 8) });
    await call('POST', '/tasks', { title: '회의', startsAt: iso(9, 10), endsAt: iso(9, 12) });
    const a = await call<{ id: string }>('POST', '/tasks', { title: '이력서 고치기' });
    const b = await call<{ id: string }>('POST', '/tasks', { title: '랜딩 개선' });
    const c = await call<{ id: string }>('POST', '/tasks', { title: 'PR 확인' });

    const ai = (await import('./testing')).fakeAi({
      placements: [
        { taskId: a.body.id, startTime: '09:00', durationMinutes: 60, reason: '오전에 집중이 잘 돼서요.' },
        { taskId: b.body.id, startTime: '11:00', durationMinutes: 60, reason: '회의와 겹침' },
        { taskId: c.body.id, startTime: '13:00', durationMinutes: 30, reason: '점심 뒤 가벼운 일' },
        { taskId: 'made-up', startTime: '15:00', durationMinutes: 30, reason: '?' },
      ],
    });
    const { planDay } = await import('./services/planning');
    const result = await planDay(db, ai.runner, {}, local(9, 8));
    expect(result.created).toBe(2);

    const cal = await calendar(call);
    expect(cal.suggestions.map((s) => [s.title, s.startsAt])).toEqual([
      ['이력서 고치기', iso(9, 9)],
      ['PR 확인', iso(9, 13)],
    ]);

    await call('POST', `/suggestions/${cal.suggestions[0]!.id}/accept`);
    const after = await calendar(call);
    expect(after.items.map((i) => i.title)).toEqual(['이력서 고치기', '회의']);
    expect(after.suggestions).toHaveLength(1);
  });

  it('아침 제안은 하루에 한 번만 한다', async () => {
    const { call } = setup({ answers: [{ placements: [] }] });
    await call('POST', '/tasks', { title: '이력서 고치기' });
    expect((await call<{ skipped: boolean }>('POST', '/suggestions/morning')).body.skipped).toBe(false);
    expect((await call<{ skipped: boolean }>('POST', '/suggestions/morning')).body.skipped).toBe(true);
  });

  it('끝날 시간이 지났는데 완료하지 않으면 남은 시간으로 옮기자고 한 번만 제안한다', async () => {
    const { call, db } = setup();
    await call('POST', '/tasks', { title: '이력서 고치기', startsAt: iso(9, 14), endsAt: iso(9, 15) });
    await call('POST', '/tasks', { title: '스터디', startsAt: iso(9, 16), endsAt: iso(9, 17) });

    expect(offerReschedules(db, local(9, 15, 5))).toBe(1);
    expect(offerReschedules(db, local(9, 15, 10))).toBe(0);

    // 15:15~16:00은 45분이라 1시간짜리가 들어가지 않고, 스터디가 끝난 17시가 첫 빈자리다.
    const [suggestion] = (await calendar(call)).suggestions;
    expect(suggestion).toMatchObject({ kind: 'move', title: '이력서 고치기', startsAt: iso(9, 17) });
    expect(suggestion?.reason).toContain('오후 5시로 옮겨 볼까요?');
  });
});

describe('AI 자동 묶음', () => {
  it('기존 묶음 이름은 그대로 쓰고 사용자가 옮긴 할 일은 건드리지 않는다', async () => {
    const { call, grouping, ai } = setup();
    const a = await call<{ id: string }>('POST', '/tasks', { title: '이력서 고치기' });
    const b = await call<{ id: string }>('POST', '/tasks', { title: '알고리즘 공부' });

    ai.runner.run = async (request) =>
      request.schema.parse({ assignments: [{ taskId: a.body.id, group: '취업 준비' }, { taskId: b.body.id, group: '공부' }] });
    await grouping.run();

    let inbox = (await call<InboxView>('GET', '/inbox')).body;
    expect(inbox.groups.map((g) => [g.name, g.tasks.map((t) => t.title)])).toEqual([
      ['취업 준비', ['이력서 고치기']],
      ['공부', ['알고리즘 공부']],
    ]);

    const study = inbox.groups.find((g) => g.name === '공부')!;
    await call('PATCH', `/tasks/${a.body.id}`, { groupId: study.id });
    const c = await call<{ id: string }>('POST', '/tasks', { title: '자기소개서' });
    ai.runner.run = async (request) => {
      expect(request.prompt).toContain('이력서 고치기 → 공부');
      return request.schema.parse({ assignments: [{ taskId: c.body.id, group: ' 공부 ' }] });
    };
    await grouping.run();

    inbox = (await call<InboxView>('GET', '/inbox')).body;
    expect(inbox.groups.map((g) => g.name)).toEqual(['공부']);
    expect(inbox.groups[0]!.tasks).toHaveLength(3);
  });
});

describe('Plop이 아는 나', () => {
  it('직접 적고, 고치고, 지우고, 기록에서 뽑은 내용을 숨긴다', async () => {
    const { call } = setup();
    const { body } = await call<{ id: string }>('POST', '/profile/facts', { text: '점심 뒤엔 가벼운 일' });
    await call('PATCH', `/profile/facts/${body.id}`, { text: '점심 뒤엔 회의나 리뷰' });

    let profile = (await call<{ facts: { text: string }[]; insights: { key: string }[] }>('GET', '/profile')).body;
    expect(profile.facts.map((f) => f.text)).toEqual(['점심 뒤엔 회의나 리뷰']);

    const t = await call<{ id: string }>('POST', '/tasks', { title: '이력서', startsAt: iso(9, 10) });
    await call('PATCH', `/tasks/${t.body.id}`, { startsAt: iso(10, 10) });
    await call('PATCH', `/tasks/${t.body.id}`, { startsAt: iso(11, 10) });

    profile = (await call<{ facts: { text: string }[]; insights: { key: string }[] }>('GET', '/profile')).body;
    expect(profile.insights.map((i) => i.key)).toEqual([`postponed:${t.body.id}`]);

    await call('DELETE', `/profile/insights/${encodeURIComponent(`postponed:${t.body.id}`)}`);
    await call('DELETE', `/profile/facts/${body.id}`);
    profile = (await call<{ facts: { text: string }[]; insights: { key: string }[] }>('GET', '/profile')).body;
    expect(profile).toEqual({ facts: [], insights: [] });
  });
});
