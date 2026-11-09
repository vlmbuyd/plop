import { describe, expect, it } from 'vitest';

import { describeRecurrence, expandOccurrences, shiftRecurrenceDays } from './recurrence';

const HOUR = 60 * 60 * 1000;
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('expandOccurrences', () => {
  // 2026-11-09는 월요일이다.
  const seriesStart = local(2026, 11, 2, 13);

  it('매일 반복은 기간 안의 날마다 같은 시각에 회차를 만든다', () => {
    const result = expandOccurrences(seriesStart, HOUR / 2, { freq: 'daily' }, local(2026, 11, 9), local(2026, 11, 12));
    expect(result).toEqual([local(2026, 11, 9, 13), local(2026, 11, 10, 13), local(2026, 11, 11, 13)]);
  });

  it('평일 반복은 토요일과 일요일을 건너뛴다', () => {
    const result = expandOccurrences(seriesStart, HOUR, { freq: 'weekdays' }, local(2026, 11, 13), local(2026, 11, 17));
    expect(result).toEqual([local(2026, 11, 13, 13), local(2026, 11, 16, 13)]);
  });

  it('매주 반복은 고른 요일에만 회차를 만든다', () => {
    const result = expandOccurrences(seriesStart, HOUR, { freq: 'weekly', days: [1, 3] }, local(2026, 11, 9), local(2026, 11, 16));
    expect(result).toEqual([local(2026, 11, 9, 13), local(2026, 11, 11, 13)]);
  });

  it('첫 회차 이전과 until 이후, 빠진 회차는 만들지 않는다', () => {
    const result = expandOccurrences(
      local(2026, 11, 10, 9),
      HOUR,
      { freq: 'daily', until: local(2026, 11, 12, 9).toISOString() },
      local(2026, 11, 9),
      local(2026, 11, 20),
      [local(2026, 11, 11, 9).getTime()],
    );
    expect(result).toEqual([local(2026, 11, 10, 9), local(2026, 11, 12, 9)]);
  });

  it('전날 시작해 기간까지 이어지는 회차도 포함한다', () => {
    const result = expandOccurrences(local(2026, 11, 1, 23), 2 * HOUR, { freq: 'daily' }, local(2026, 11, 10), local(2026, 11, 10, 12));
    expect(result).toEqual([local(2026, 11, 9, 23)]);
  });
});

describe('shiftRecurrenceDays', () => {
  it('매주 반복의 요일을 옮긴 만큼 옮긴다', () => {
    expect(shiftRecurrenceDays({ freq: 'weekly', days: [3, 6] }, 1)).toEqual({ freq: 'weekly', days: [4, 0] });
  });

  it('매일, 평일 반복은 그대로 둔다', () => {
    expect(shiftRecurrenceDays({ freq: 'daily' }, 2)).toEqual({ freq: 'daily' });
  });
});

describe('describeRecurrence', () => {
  it('매주 반복은 월요일부터 요일을 나열한다', () => {
    expect(describeRecurrence({ freq: 'weekly', days: [0, 3, 1] })).toBe('매주 월, 수, 일');
  });
});
