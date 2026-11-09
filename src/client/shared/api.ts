import { DetailedError, hc, parseResponse } from 'hono/client';

import type { Api } from '../../server/app';

export const api = hc<Api>('/api');

type ResponsePromise = Parameters<typeof parseResponse>[0];

/** 성공 응답의 본문을 돌려주고, 실패면 서버가 준 문구로 에러를 던진다. */
export async function unwrap<T extends ResponsePromise>(response: T) {
  try {
    return await parseResponse(response);
  } catch (error) {
    if (error instanceof DetailedError) {
      const detail = error.detail as { data?: { error?: unknown } } | undefined;
      const message = typeof detail?.data?.error === 'string' ? detail.data.error : `요청이 실패했어요 (${error.statusCode ?? '연결 끊김'})`;
      throw new Error(message);
    }
    throw new Error('Plop 서버에 연결하지 못했어요. 터미널에서 서버가 켜져 있는지 확인해 주세요.');
  }
}
