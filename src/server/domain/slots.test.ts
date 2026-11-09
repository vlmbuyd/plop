import { describe, expect, it } from 'vitest';

import { findFreeSlots, firstFit, fitsInSlots } from './slots';

const M = 60 * 1000;

describe('findFreeSlots', () => {
  it('바쁜 시간을 빼고 남은 틈을 돌려준다', () => {
    const slots = findFreeSlots({ start: 0, end: 600 * M }, [
      { start: 60 * M, end: 120 * M },
      { start: 100 * M, end: 180 * M },
      { start: 300 * M, end: 310 * M },
    ]);
    expect(slots).toEqual([
      { start: 0, end: 60 * M },
      { start: 180 * M, end: 300 * M },
      { start: 310 * M, end: 600 * M },
    ]);
  });

  it('최소 길이보다 짧은 틈은 버린다', () => {
    const slots = findFreeSlots({ start: 0, end: 100 * M }, [{ start: 10 * M, end: 90 * M }], 15);
    expect(slots).toEqual([]);
  });
});

describe('firstFit, fitsInSlots', () => {
  const slots = [
    { start: 0, end: 30 * M },
    { start: 60 * M, end: 180 * M },
  ];

  it('길이가 맞는 첫 빈자리를 찾는다', () => {
    expect(firstFit(slots, 60 * M)).toEqual({ start: 60 * M, end: 120 * M });
    expect(firstFit(slots, 200 * M)).toBeNull();
  });

  it('빈자리 하나 안에 다 들어가야 맞는다고 본다', () => {
    expect(fitsInSlots({ start: 70 * M, end: 100 * M }, slots)).toBe(true);
    expect(fitsInSlots({ start: 20 * M, end: 70 * M }, slots)).toBe(false);
  });
});
