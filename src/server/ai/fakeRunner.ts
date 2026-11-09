import type { AiRequest, AiRunner } from './runner';

/**
 * E2E 테스트용 AI. Claude Code 없이 정해진 규칙으로 답한다. PLOP_AI_FAKE=1일 때만 쓴다.
 * - 채팅: 요청 문장을 제목으로 날짜 없는 할 일을 만든다.
 * - 묶음: 모두 '테스트 묶음'에 넣는다.
 * - 배치: 첫 할 일을 첫 빈 시간에 30분 놓는다.
 */
export function createFakeRunner(): AiRunner {
  return {
    async run<T>({ prompt, schema }: AiRequest<T>) {
      const ids = [...prompt.matchAll(/\[([0-9a-f-]{36})\]/g)].map((m) => m[1]!);

      if (prompt.includes('사용자 요청:')) {
        const text = prompt.split('사용자 요청:').at(-1)!.trim();
        return schema.parse({ reply: `‘${text}’을 목록에 추가했어요.`, actions: [{ type: 'create', title: text }] });
      }
      if (prompt.includes('묶을 할 일:')) {
        const section = prompt.split('묶을 할 일:').at(-1)!;
        const taskIds = [...section.matchAll(/\[([0-9a-f-]{36})\]/g)].map((m) => m[1]!);
        return schema.parse({ assignments: taskIds.map((taskId) => ({ taskId, group: '테스트 묶음' })) });
      }
      const slot = /빈 시간:\n- (\d{2}:\d{2})~/.exec(prompt);
      const candidates = prompt.split('날짜 없는 할 일:').at(-1)!;
      const first = /\[([0-9a-f-]{36})\]/.exec(candidates)?.[1] ?? ids[0];
      return schema.parse({
        placements: slot && first ? [{ taskId: first, startTime: slot[1], durationMinutes: 30, reason: '테스트용 제안이에요.' }] : [],
      });
    },
  };
}
