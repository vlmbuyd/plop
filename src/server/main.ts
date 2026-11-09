import { serve } from '@hono/node-server';

import { SERVER_PORT } from '../shared/config';
import { createClaudeRunner } from './ai/runner';
import { createApp } from './app';
import { openDataDb, resolveDataDir } from './db/client';
import { GroupingService } from './services/grouping';
import { offerReschedules } from './services/planning';

const db = openDataDb();
const ai = createClaudeRunner();
const grouping = new GroupingService(db, ai);
const app = createApp({ db, ai, grouping });

// 끝날 시간이 지났는데 완료하지 않은 일정을 1분마다 확인한다.
const RESCHEDULE_CHECK_MS = 60 * 1000;
setInterval(() => {
  try {
    offerReschedules(db, new Date());
  } catch (error) {
    console.error('[reschedule] failed:', error);
  }
}, RESCHEDULE_CHECK_MS);

// 서버가 꺼져 있던 동안 추가된 할 일도 묶는다.
grouping.schedule();

// 127.0.0.1에만 열어 같은 네트워크의 다른 기기가 접근하지 못하게 한다.
serve({ fetch: app.fetch, port: SERVER_PORT, hostname: '127.0.0.1' }, (info) => {
  console.log(`Plop server: http://127.0.0.1:${info.port}`);
  console.log(`Data: ${resolveDataDir()}`);
});
