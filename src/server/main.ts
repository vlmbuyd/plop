import { serve } from '@hono/node-server';

import { SERVER_PORT } from '../shared/config';
import { createApp } from './app';

const app = createApp();

// 127.0.0.1에만 열어 같은 네트워크의 다른 기기가 접근하지 못하게 한다.
serve({ fetch: app.fetch, port: SERVER_PORT, hostname: '127.0.0.1' }, (info) => {
  console.log(`Plop server: http://127.0.0.1:${info.port}`);
});
