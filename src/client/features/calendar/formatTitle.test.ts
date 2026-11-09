import { describe, expect, it } from 'vitest';

import { formatCalendarTitle } from './formatTitle';

describe('formatCalendarTitle', () => {
  it('한 달 안의 기간은 그 달만 보여 준다', () => {
    expect(formatCalendarTitle(new Date(2026, 10, 9), new Date(2026, 10, 14))).toBe('2026년 11월');
  });

  it('끝 날짜는 포함하지 않으므로 다음 달 1일에 끝나면 한 달로 본다', () => {
    expect(formatCalendarTitle(new Date(2026, 10, 27), new Date(2026, 11, 1))).toBe('2026년 11월');
  });

  it('두 달에 걸치면 두 달을 보여 준다', () => {
    expect(formatCalendarTitle(new Date(2026, 10, 30), new Date(2026, 11, 5))).toBe('2026년 11월 ~ 12월');
  });

  it('해가 바뀌면 연도도 보여 준다', () => {
    expect(formatCalendarTitle(new Date(2026, 11, 29), new Date(2027, 0, 3))).toBe('2026년 12월 ~ 2027년 1월');
  });
});
