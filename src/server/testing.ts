import type { AiRequest, AiRunner } from './ai/runner';
import { createApp } from './app';
import { createDb } from './db/client';
import { GroupingService } from './services/grouping';

/** 요청 순서대로 미리 정한 답을 돌려주는 가짜 AI. 받은 프롬프트를 남긴다. */
export function fakeAi(...answers: unknown[]) {
  const requests: AiRequest<unknown>[] = [];
  const runner: AiRunner = {
    async run<T>(request: AiRequest<T>) {
      requests.push(request as AiRequest<unknown>);
      const answer = answers.shift();
      if (answer instanceof Error) throw answer;
      return request.schema.parse(answer);
    },
  };
  return { runner, requests };
}

export function setup(options: { now?: Date; answers?: unknown[] } = {}) {
  const db = createDb(':memory:');
  const ai = fakeAi(...(options.answers ?? []));
  // 테스트에서는 저절로 돌지 않게 하고, 필요할 때 grouping.run()을 직접 부른다.
  const grouping = new GroupingService(db, ai.runner, 1e9);
  let current = options.now ?? new Date(2026, 10, 9, 10, 0);
  const app = createApp({ db, ai: ai.runner, grouping, now: () => current });

  const call = async <T = unknown>(method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as T };
  };

  return { db, app, ai, grouping, call, setNow: (date: Date) => (current = date) };
}
