import { expect, test, type Page } from '@playwright/test';

const pad = (n: number) => String(n).padStart(2, '0');
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** 오늘 칸에서 그 시각 줄의 화면 좌표. */
async function slotPoint(page: Page, hour: number, minuteOffset = 0) {
  const column = await page.locator(`[role="columnheader"][data-date="${todayKey()}"]`).boundingBox();
  const row = await page.locator(`[data-time="${pad(hour)}:00:00"]`).first().boundingBox();
  if (!column || !row) throw new Error('캘린더 칸을 찾지 못했습니다');
  return { x: column.x + column.width / 2, y: row.y + 6 + (row.height * 2 * minuteOffset) / 60 };
}

async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 5, from.y + 5, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

const calendarEvent = (page: Page, title: string) => page.locator('.plop-calendar .plop-event', { hasText: title });
const inboxItem = (page: Page, title: string) => page.locator('#inbox-panel li', { hasText: title });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /\d{4}년 \d+월/ })).toBeVisible();
});

test('목록에 적은 할 일은 AI가 묶음에 넣는다', async ({ page }) => {
  await page.getByLabel('할 일 추가').fill('목록 테스트 할 일');
  await page.getByLabel('할 일 추가').press('Enter');

  await expect(inboxItem(page, '목록 테스트 할 일')).toBeVisible();
  await expect(page.locator('#inbox-panel section', { hasText: '테스트 묶음' }).getByText('목록 테스트 할 일')).toBeVisible({ timeout: 10_000 });
});

test('목록의 할 일을 캘린더로 끌어 놓으면 일정이 되고 목록에서 빠진다', async ({ page }) => {
  await page.getByLabel('할 일 추가').fill('끌어 놓을 할 일');
  await page.getByLabel('할 일 추가').press('Enter');
  const item = inboxItem(page, '끌어 놓을 할 일');
  const box = (await item.boundingBox())!;

  await dragTo(page, { x: box.x + 40, y: box.y + box.height / 2 }, await slotPoint(page, 11));

  await expect(calendarEvent(page, '끌어 놓을 할 일')).toBeVisible();
  await expect(item).toHaveCount(0);
});

test('빈 칸을 끌어서 만들고, 체크하면 완료로 흐려진다', async ({ page }) => {
  await dragTo(page, await slotPoint(page, 9), await slotPoint(page, 9, 45));
  await page.getByLabel('할 일 이름').fill('끌어서 만든 할 일');
  await page.getByLabel('할 일 이름').press('Enter');

  const event = calendarEvent(page, '끌어서 만든 할 일');
  await expect(event).toBeVisible();

  await event.locator('[data-action="toggle"]').click();
  await expect(event.locator('[data-action="toggle"]')).toHaveAttribute('aria-checked', 'true');
});

test('채팅으로 시키면 바로 반영되고 되돌릴 수 있다', async ({ page }) => {
  await page.getByLabel('Plop에게 시키기').fill('채팅으로 추가한 할 일');
  await page.getByLabel('Plop에게 시키기').press('Enter');

  await expect(page.getByText('‘채팅으로 추가한 할 일’을 목록에 추가했어요.')).toBeVisible();
  await expect(inboxItem(page, '채팅으로 추가한 할 일')).toBeVisible();

  await page.getByRole('button', { name: '되돌리기' }).click();
  await expect(inboxItem(page, '채팅으로 추가한 할 일')).toHaveCount(0);
  await expect(page.getByText('되돌렸어요')).toBeVisible();
});

test('계획 짜기를 누르면 흐린 제안이 생기고, 확정하면 일정이 된다', async ({ page }) => {
  await page.getByLabel('할 일 추가').fill('배치 받을 할 일');
  await page.getByLabel('할 일 추가').press('Enter');
  await expect(inboxItem(page, '배치 받을 할 일')).toBeVisible();

  await page.getByRole('button', { name: '계획 짜기' }).click();
  const ghost = page.locator('.plop-calendar .is-suggestion', { hasText: '배치 받을 할 일' });
  await expect(ghost).toBeVisible();

  await ghost.click();
  await page.getByRole('button', { name: '확정', exact: true }).click();
  await expect(ghost).toHaveCount(0);
  await expect(calendarEvent(page, '배치 받을 할 일')).toBeVisible();
});

test('반복 일정의 한 회차를 옮기면 이 일정만인지 묻는다', async ({ page, request }) => {
  const start = new Date();
  start.setHours(14, 0, 0, 0);
  await request.post('/api/tasks', {
    data: {
      title: '매일 반복 테스트',
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
      recurrence: { freq: 'daily' },
    },
  });
  await page.reload();

  const todays = page.locator(`.plop-calendar .plop-event`, { hasText: '매일 반복 테스트' }).first();
  const box = (await todays.boundingBox())!;
  await dragTo(page, { x: box.x + box.width / 2, y: box.y + 8 }, { ...(await slotPoint(page, 16)), y: (await slotPoint(page, 16)).y + 2 });

  await expect(page.getByRole('dialog', { name: '반복 일정 옮기기' })).toBeVisible();
  await page.getByRole('button', { name: '이 일정만' }).click();

  await expect(page.locator('.plop-calendar .plop-event', { hasText: '매일 반복 테스트' })).toHaveCount(5);
});

test('단축키 ?로 단축키 목록을 연다', async ({ page }) => {
  await page.keyboard.press('Shift+Slash');
  await expect(page.getByRole('dialog', { name: '단축키' })).toBeVisible();
});
