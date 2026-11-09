import { and, desc, eq, isNotNull, isNull, notInArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { AiRunner } from '../ai/runner';
import type { Db } from '../db/client';
import { groups, tasks } from '../db/schema';

const MAX_GROUPS = 7;
const FALLBACK_GROUP = '기타';

const SYSTEM = `너는 할 일 목록을 묶는 정리 담당이다.
사용자가 날짜 없이 적어 둔 할 일을 사람이 한눈에 알아볼 수 있는 몇 개의 묶음으로 나눈다.

규칙:
- 묶음은 넓게 잡는다. 전체 묶음 수는 ${MAX_GROUPS}개를 넘기지 않는다. 할 일 한두 개만 들어갈 묶음은 만들지 않는다.
- 이미 있는 묶음에 맞으면 반드시 그 이름을 그대로 쓴다. 맞는 묶음이 없을 때만 새 이름을 만든다.
- 사용자가 직접 옮긴 예시가 있으면 그 기준을 따른다.
- 묶음 이름은 2~8자 한국어 명사로 짧게 쓴다. 예: 업무, 공부, 취업 준비, 생활, 글쓰기. 이모지와 기호는 쓰지 않는다.
- 모든 할 일에 묶음을 하나씩 정한다.`;

const outputSchema = z.object({
  assignments: z.array(z.object({ taskId: z.string(), group: z.string() })),
});

/** 날짜 없는 할 일이 추가되면 잠깐 기다렸다가 한 번에 묶는다. */
export class GroupingService {
  private timer: NodeJS.Timeout | null = null;

  private running = false;

  private rerun = false;

  constructor(
    private readonly db: Db,
    private readonly ai: AiRunner,
    private readonly delayMs = 1200,
  ) {}

  get pending() {
    return this.timer !== null || this.running;
  }

  schedule() {
    if (this.running) {
      this.rerun = true;
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, this.delayMs);
    this.timer.unref();
  }

  async run() {
    this.running = true;
    try {
      await groupUngrouped(this.db, this.ai);
    } catch (error) {
      console.error('[grouping] failed:', error instanceof Error ? error.message : error);
    } finally {
      this.running = false;
      if (this.rerun) {
        this.rerun = false;
        this.schedule();
      }
    }
  }
}

export async function groupUngrouped(db: Db, ai: AiRunner) {
  const ungrouped = db
    .select()
    .from(tasks)
    .where(and(isNull(tasks.startsAt), isNull(tasks.completedAt), isNull(tasks.groupId)))
    .all();
  if (ungrouped.length === 0) return;

  const existing = db.select().from(groups).all();
  const samples = existing.map((g) => {
    const titles = db
      .select({ title: tasks.title })
      .from(tasks)
      .where(eq(tasks.groupId, g.id))
      .orderBy(desc(tasks.createdAt))
      .limit(5)
      .all()
      .map((t) => t.title);
    return `- ${g.name}: ${titles.join(', ') || '(비어 있음)'}`;
  });

  const examples = db
    .select({ title: tasks.title, group: groups.name })
    .from(tasks)
    .innerJoin(groups, eq(groups.id, tasks.groupId))
    .where(eq(tasks.groupSetBy, 'user'))
    .orderBy(desc(tasks.updatedAt))
    .limit(30)
    .all();

  const prompt = [
    `이미 있는 묶음과 들어 있는 할 일:\n${samples.join('\n') || '- 없음'}`,
    examples.length ? `사용자가 직접 옮긴 예시:\n${examples.map((e) => `- ${e.title} → ${e.group}`).join('\n')}` : '',
    `묶을 할 일:\n${ungrouped.map((t) => `- [${t.id}] ${t.title}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const { assignments } = await ai.run({ system: SYSTEM, prompt, schema: outputSchema, tier: 'fast' });
  applyAssignments(db, assignments, new Set(ungrouped.map((t) => t.id)), new Date());
}

function normalize(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

export function applyAssignments(
  db: Db,
  assignments: { taskId: string; group: string }[],
  allowedTaskIds: Set<string>,
  now: Date,
) {
  db.transaction((tx) => {
    const byName = new Map(tx.select().from(groups).all().map((g) => [normalize(g.name), g.id]));

    const resolveGroup = (rawName: string) => {
      let name = normalize(rawName).slice(0, 12) || FALLBACK_GROUP;
      const found = byName.get(name);
      if (found) return found;
      if (byName.size >= MAX_GROUPS) name = FALLBACK_GROUP;
      const again = byName.get(name);
      if (again) return again;
      const id = randomUUID();
      tx.insert(groups).values({ id, name, createdAt: now }).run();
      byName.set(name, id);
      return id;
    };

    for (const { taskId, group } of assignments) {
      if (!allowedTaskIds.has(taskId)) continue;
      tx.update(tasks)
        .set({ groupId: resolveGroup(group), groupSetBy: 'ai' })
        .where(and(eq(tasks.id, taskId), isNull(tasks.groupId)))
        .run();
    }

    // 할 일이 하나도 없는 묶음은 지운다.
    const used = tx
      .selectDistinct({ id: tasks.groupId })
      .from(tasks)
      .where(isNotNull(tasks.groupId))
      .all()
      .map((r) => r.id!);
    tx.delete(groups)
      .where(used.length ? notInArray(groups.id, used) : sql`1 = 1`)
      .run();
  });
}
