import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type { Db } from '../db/client';
import { changeBatches, facts, suggestions, tasks, type SerializedRow } from '../db/schema';

/** 채팅 한 번으로 바뀌는 행의 이전 상태를 모은다. 되돌리기에 쓴다. */
export interface Recorder {
  tasks: Map<string, SerializedRow | null>;

  facts: Map<string, SerializedRow | null>;

  createdSuggestionIds: string[];
}

const TASK_DATE_COLUMNS = ['startsAt', 'endsAt', 'completedAt', 'originalStartsAt', 'rescheduleOfferedAt', 'createdAt', 'updatedAt'];
const FACT_DATE_COLUMNS = ['createdAt', 'updatedAt'];

export function createRecorder(): Recorder {
  return { tasks: new Map(), facts: new Map(), createdSuggestionIds: [] };
}

function serialize(row: object): SerializedRow {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.getTime() : v]));
}

function deserialize(row: SerializedRow, dateColumns: string[]) {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, dateColumns.includes(k) && typeof v === 'number' ? new Date(v) : v]),
  );
}

/** 처음 건드릴 때 한 번만 이전 상태를 남긴다. 없는 행이면 새로 만든 것으로 본다. */
export function captureTask(db: Db, recorder: Recorder | undefined, id: string) {
  if (!recorder || recorder.tasks.has(id)) return;
  const row = db.select().from(tasks).where(eq(tasks.id, id)).get();
  recorder.tasks.set(id, row ? serialize(row) : null);
}

export function captureFact(db: Db, recorder: Recorder | undefined, id: string) {
  if (!recorder || recorder.facts.has(id)) return;
  const row = db.select().from(facts).where(eq(facts.id, id)).get();
  recorder.facts.set(id, row ? serialize(row) : null);
}

/** 바뀐 게 없으면 null. */
export function saveBatch(db: Db, recorder: Recorder, now: Date) {
  if (recorder.tasks.size === 0 && recorder.facts.size === 0 && recorder.createdSuggestionIds.length === 0) return null;
  const id = randomUUID();
  db.insert(changeBatches)
    .values({
      id,
      before: {
        tasks: [...recorder.tasks].map(([taskId, before]) => ({ id: taskId, before })),
        facts: [...recorder.facts].map(([factId, before]) => ({ id: factId, before })),
        createdSuggestionIds: recorder.createdSuggestionIds,
      },
      createdAt: now,
    })
    .run();
  return id;
}

export function undoBatch(db: Db, batchId: string, now: Date) {
  const batch = db.select().from(changeBatches).where(eq(changeBatches.id, batchId)).get();
  if (!batch || batch.undoneAt) return false;

  db.transaction((tx) => {
    if (batch.before.createdSuggestionIds.length) {
      tx.delete(suggestions).where(inArray(suggestions.id, batch.before.createdSuggestionIds)).run();
    }
    for (const { id, before } of batch.before.tasks) {
      if (before === null) {
        tx.delete(tasks).where(eq(tasks.id, id)).run();
        continue;
      }
      const row = deserialize(before, TASK_DATE_COLUMNS) as typeof tasks.$inferInsert;
      tx.insert(tasks).values(row).onConflictDoUpdate({ target: tasks.id, set: row }).run();
    }
    for (const { id, before } of batch.before.facts) {
      if (before === null) {
        tx.delete(facts).where(eq(facts.id, id)).run();
        continue;
      }
      const row = deserialize(before, FACT_DATE_COLUMNS) as typeof facts.$inferInsert;
      tx.insert(facts).values(row).onConflictDoUpdate({ target: facts.id, set: row }).run();
    }
    tx.update(changeBatches).set({ undoneAt: now }).where(eq(changeBatches.id, batchId)).run();
  });

  return true;
}
