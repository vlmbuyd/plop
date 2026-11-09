import { MINUTE } from './time';

export interface Interval {
  start: number;

  end: number;
}

/** [window.start, window.end)에서 busy를 뺀 빈 시간. minMinutes보다 짧은 틈은 버린다. */
export function findFreeSlots(window: Interval, busy: readonly Interval[], minMinutes = 15): Interval[] {
  const sorted = busy
    .filter((b) => b.end > window.start && b.start < window.end)
    .sort((a, b) => a.start - b.start);

  const free: Interval[] = [];
  let cursor = window.start;

  for (const b of sorted) {
    if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, window.end) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });

  return free.filter((slot) => slot.end - slot.start >= minMinutes * MINUTE);
}

/** 빈 시간 안에 그대로 들어가는지. */
export function fitsInSlots(candidate: Interval, slots: readonly Interval[]) {
  return slots.some((slot) => candidate.start >= slot.start && candidate.end <= slot.end);
}

/** 길이가 durationMs인 첫 빈자리. */
export function firstFit(slots: readonly Interval[], durationMs: number): Interval | null {
  const slot = slots.find((s) => s.end - s.start >= durationMs);
  return slot ? { start: slot.start, end: slot.start + durationMs } : null;
}
