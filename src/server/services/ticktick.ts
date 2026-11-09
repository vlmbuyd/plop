import { parse } from 'csv-parse/sync';
import { inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type { Recurrence } from '../../shared/recurrence';
import type { Db } from '../db/client';
import { tasks, type NewTaskRow } from '../db/schema';
import { DAY, MINUTE } from '../domain/time';

/**
 * TickTick 설정 > 백업에서 내려받은 CSV를 읽는다.
 * 파일 앞쪽에 설명 줄이 몇 줄 있고, 그 뒤에 "Folder Name","List Name","Title" ... 머리 줄이 온다.
 */
interface TickTickRow {
  title: string;

  content: string;

  kind: string;

  startDate: string;

  dueDate: string;

  isAllDay: boolean;

  repeat: string;

  status: string;

  taskId: string;
}

export interface ImportSummary {
  imported: number;

  scheduled: number;

  inbox: number;

  recurring: number;

  /** 완료했거나, 이미 가져왔거나, 메모였던 것. */
  skipped: number;

  /** Plop이 지원하지 않는 반복이라 한 번짜리로 가져온 것. */
  unsupportedRepeat: number;
}

export function parseTickTickCsv(text: string): TickTickRow[] {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => /"?Title"?/.test(line) && /"?(taskId|List Name)"?/.test(line));
  if (headerIndex < 0) throw new Error('TickTick 백업 CSV 형식이 아닙니다. 머리 줄(Title, List Name)을 찾지 못했습니다.');

  const records = parse(lines.slice(headerIndex).join('\n'), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  }) as Record<string, string>[];

  return records.map((r) => ({
    title: (r['Title'] ?? '').trim(),
    content: (r['Content'] ?? '').trim(),
    kind: (r['Kind'] ?? '').trim().toUpperCase(),
    startDate: (r['Start Date'] ?? '').trim(),
    dueDate: (r['Due Date'] ?? '').trim(),
    isAllDay: (r['Is All Day'] ?? '').trim().toLowerCase() === 'true',
    repeat: (r['Repeat'] ?? '').trim(),
    status: (r['Status'] ?? '0').trim(),
    taskId: (r['taskId'] ?? '').trim(),
  }));
}

/** "2026-11-09T04:00:00+0000" 같은 TickTick 날짜. */
export function parseTickTickDate(value: string) {
  if (!value) return null;
  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

const BYDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Plop이 다루는 반복(매일, 평일, 매주 요일)만 옮긴다. 간격이 1이 아니거나 다른 규칙이면 null. */
export function parseTickTickRepeat(rrule: string, start: Date | null): Recurrence | null | 'unsupported' {
  if (!rrule) return null;
  const parts = Object.fromEntries(
    rrule
      .replace(/^RRULE:/i, '')
      .split(';')
      .map((p) => p.split('=') as [string, string])
      .map(([k, v]) => [k.toUpperCase(), (v ?? '').toUpperCase()]),
  );
  if (parts['INTERVAL'] && parts['INTERVAL'] !== '1') return 'unsupported';
  if (parts['COUNT']) return 'unsupported';

  const until = parts['UNTIL'] ? parseRruleUntil(parts['UNTIL']) : undefined;
  const withUntil = <T extends Recurrence>(rule: T): T => (until ? { ...rule, until } : rule);

  if (parts['FREQ'] === 'DAILY' && !parts['BYDAY']) return withUntil({ freq: 'daily' });
  if (parts['FREQ'] === 'WEEKLY' || (parts['FREQ'] === 'DAILY' && parts['BYDAY'])) {
    const days = (parts['BYDAY'] ?? '')
      .split(',')
      .map((d: string) => BYDAY[d.replace(/^[+-]?\d+/, '')])
      .filter((d: number | undefined): d is number => d !== undefined);
    if (days.length === 0) return start ? withUntil({ freq: 'weekly', days: [start.getDay()] }) : 'unsupported';
    if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return withUntil({ freq: 'weekdays' });
    return withUntil({ freq: 'weekly', days: [...new Set(days)] });
  }
  return 'unsupported';
}

function parseRruleUntil(value: string) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(value);
  if (!m) return undefined;
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 23), +(m[5] ?? 59), +(m[6] ?? 59))).toISOString();
}

/** 완료하지 않은 할 일만 가져온다. 목록 구분은 가져오지 않고 AI 자동 묶음에 맡긴다. */
export function importTickTick(db: Db, csv: string, now: Date): ImportSummary {
  const rows = parseTickTickCsv(csv);
  const summary: ImportSummary = { imported: 0, scheduled: 0, inbox: 0, recurring: 0, skipped: 0, unsupportedRepeat: 0 };

  const externalIds = rows.filter((r) => r.taskId).map((r) => `ticktick:${r.taskId}`);
  const existing = new Set(
    externalIds.length
      ? db.select({ id: tasks.externalId }).from(tasks).where(inArray(tasks.externalId, externalIds)).all().map((r) => r.id)
      : [],
  );

  const values: NewTaskRow[] = [];
  for (const row of rows) {
    const externalId = row.taskId ? `ticktick:${row.taskId}` : null;
    if (!row.title || row.status !== '0' || row.kind === 'NOTE' || (externalId && existing.has(externalId))) {
      summary.skipped++;
      continue;
    }

    const start = parseTickTickDate(row.startDate) ?? parseTickTickDate(row.dueDate);
    const due = parseTickTickDate(row.dueDate);
    let startsAt: Date | null = null;
    let endsAt: Date | null = null;

    if (start) {
      if (row.isAllDay) {
        startsAt = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const last = due && due > start ? due : start;
        endsAt = new Date(Math.max(startsAt.getTime() + DAY, new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime()));
      } else {
        startsAt = start;
        endsAt = due && due > start ? due : new Date(start.getTime() + 30 * MINUTE);
      }
    }

    const repeat = parseTickTickRepeat(row.repeat, startsAt);
    if (repeat === 'unsupported') summary.unsupportedRepeat++;
    const recurrence = startsAt && repeat && repeat !== 'unsupported' ? repeat : null;

    values.push({
      id: randomUUID(),
      title: row.title.slice(0, 200),
      notes: row.content || null,
      startsAt,
      endsAt,
      allDay: Boolean(startsAt && row.isAllDay),
      recurrence,
      externalId,
      createdAt: now,
      updatedAt: now,
    });
    if (externalId) existing.add(externalId);

    summary.imported++;
    if (recurrence) summary.recurring++;
    if (startsAt) summary.scheduled++;
    else summary.inbox++;
  }

  if (values.length) {
    db.transaction((tx) => {
      for (let i = 0; i < values.length; i += 200) tx.insert(tasks).values(values.slice(i, i + 200)).run();
    });
  }
  return summary;
}
