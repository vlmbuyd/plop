import { and, desc, gte, isNotNull, isNull } from 'drizzle-orm';

import type { Insight } from '../../shared/task';
import type { Db } from '../db/client';
import { dismissedInsights, occurrenceCompletions, tasks } from '../db/schema';
import { DAY, MINUTE } from '../domain/time';

const LOOKBACK_DAYS = 30;
const MIN_SAMPLES_FOR_PEAK = 5;

function hourLabel(hour: number) {
  const h = hour % 24;
  const meridiem = h < 12 ? '오전' : '오후';
  return `${meridiem} ${h % 12 === 0 ? 12 : h % 12}시`;
}

/** 캘린더 기록에서 자주 미루는 일, 주로 끝내는 시간대, 계획보다 오래 걸린 일을 뽑는다. 숨긴 것은 뺀다. */
export function deriveInsights(db: Db, now: Date): Insight[] {
  const dismissed = new Set(db.select().from(dismissedInsights).all().map((d) => d.key));
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY);
  const insights: Insight[] = [];

  const postponed = db
    .select()
    .from(tasks)
    .where(and(isNull(tasks.completedAt), gte(tasks.postponeCount, 2)))
    .orderBy(desc(tasks.postponeCount))
    .limit(5)
    .all();
  for (const t of postponed) {
    insights.push({ key: `postponed:${t.id}`, kind: 'postponed', text: `‘${t.title}’ 일정을 ${t.postponeCount}번 미뤘어요` });
  }

  const completedTasks = db
    .select()
    .from(tasks)
    .where(and(isNotNull(tasks.completedAt), gte(tasks.completedAt, since)))
    .all();
  const completedOccurrences = db
    .select()
    .from(occurrenceCompletions)
    .where(gte(occurrenceCompletions.completedAt, since))
    .all();
  const completionTimes = [
    ...completedTasks.map((t) => t.completedAt!),
    ...completedOccurrences.map((c) => c.completedAt),
  ];

  if (completionTimes.length >= MIN_SAMPLES_FOR_PEAK) {
    const byHour = new Array<number>(24).fill(0);
    for (const time of completionTimes) byHour[time.getHours()]!++;

    let bestHour = 0;
    let bestCount = 0;
    for (let h = 0; h < 24; h++) {
      const count = byHour[h]! + byHour[(h + 1) % 24]!;
      if (count > bestCount) [bestHour, bestCount] = [h, count];
    }
    if (bestCount / completionTimes.length >= 0.3) {
      insights.push({
        key: 'peak-hours',
        kind: 'peak-hours',
        text: `할 일을 주로 ${hourLabel(bestHour)}~${hourLabel(bestHour + 2)}에 끝내요 (최근 ${LOOKBACK_DAYS}일 ${completionTimes.length}건 중 ${bestCount}건)`,
      });
    }
  }

  const overruns = new Map<string, number[]>();
  for (const t of completedTasks) {
    if (t.allDay || !t.endsAt || !t.startsAt) continue;
    const late = t.completedAt!.getTime() - t.endsAt.getTime();
    if (late > 15 * MINUTE && late < DAY) {
      const list = overruns.get(t.title) ?? [];
      list.push(late);
      overruns.set(t.title, list);
    }
  }
  [...overruns]
    .map(([title, lates]) => ({ title, avg: Math.round(lates.reduce((a, b) => a + b, 0) / lates.length / MINUTE) }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3)
    .forEach(({ title, avg }) => {
      insights.push({ key: `overrun:${title}`, kind: 'overrun', text: `‘${title}’ 일정은 계획보다 평균 ${avg}분 더 걸렸어요` });
    });

  return insights.filter((i) => !dismissed.has(i.key));
}
