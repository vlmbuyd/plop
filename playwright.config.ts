import { defineConfig } from '@playwright/test';

const PORT = 4400;

/** 빌드한 화면을 서버가 직접 서빙하는 매일 쓰는 형태로 돌린다. 데이터는 매번 비운 .e2e-data, AI는 가짜를 쓴다. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    timezoneId: 'Asia/Seoul',
    locale: 'ko-KR',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `rm -rf .e2e-data && pnpm build && PLOP_PORT=${PORT} PLOP_DATA_DIR=.e2e-data PLOP_AI_FAKE=1 NODE_ENV=production tsx src/server/main.ts`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
