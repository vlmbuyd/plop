import { desc, eq, isNotNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { Recurrence } from '../../shared/recurrence';
import type { ChatMessage } from '../../shared/task';
import { AiError, type AiRunner } from '../ai/runner';
import type { Db } from '../db/client';
import { changeBatches, chatMessages, facts } from '../db/schema';
import { parseLocalDateTime } from '../domain/time';
import { describeInbox, describeNow, describeProfile, describeSchedule } from './context';
import type { GroupingService } from './grouping';
import { planDay } from './planning';
import { captureFact, createRecorder, saveBatch, undoBatch, type Recorder } from './recorder';
import { createTask, deleteTask, getTaskOrThrow, NotFoundError, setCompleted, updateTask } from './tasks';

const SYSTEM = `너는 Plop이라는 플래너 앱의 비서다. 사용자가 채팅창에 쓴 말을 할 일 변경으로 바꾼다.
사용자가 직접 시킨 일은 확인을 묻지 않고 바로 반영한다.

actions 규칙:
- create: 새 할 일. 날짜나 시간이 없으면 startsAt 없이 만든다(오른쪽 목록에 들어간다).
  시간이 있으면 startsAt, 끝을 말했으면 endsAt. 날짜만 있으면 allDay=true, startsAt은 그날 'T00:00'.
  반복을 말했으면 recurrence: freq는 daily(매일), weekdays(평일), weekly(매주, days에 요일 번호 0=일 ~ 6=토).
- update: 이미 있는 할 일 바꾸기. taskId는 아래 목록의 [대괄호] 안 ID를 그대로 쓴다. 새로 지어내지 않는다.
  옮길 때는 startsAt(필요하면 endsAt). 캘린더에서 빼서 목록으로 돌리려면 unschedule=true. 이름은 title.
- delete: 지우기. complete / uncomplete: 완료 표시와 취소. 반복 일정의 한 회차면 occurrenceStartsAt에 그 회차 시작.
- remember: 사용자가 자기 습관, 에너지, 집중 시간, 선호를 말하면 fact에 한 문장으로 남긴다. 예: "오전에 집중이 잘 된다".
- plan: 계획을 짜 달라, 배치해 달라, 다시 짜 달라고 하면. 날짜는 planDate('YYYY-MM-DD'), 시간대를 말했으면 planFrom, planTo('HH:mm').
- 모든 시각은 시간대 없는 'YYYY-MM-DDTHH:mm'이다. "오늘", "내일", "금요일"은 지금 시각을 기준으로 계산한다.
- 어느 할 일인지 모호하거나 요청을 이해하지 못하면 actions를 비우고 reply로 짧게 되묻는다.

reply 규칙:
- 존댓말 한두 문장. 무엇을 바꿨는지 구체적으로 말한다. 예: "내일 오후 2시에 치과 일정을 넣었어요."
- 이모지, 느낌표 남발, 과한 맞장구는 쓰지 않는다.`;

const actionSchema = z.object({
  type: z.enum(['create', 'update', 'delete', 'complete', 'uncomplete', 'remember', 'plan']),
  taskId: z.string().optional(),
  title: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  allDay: z.boolean().optional(),
  unschedule: z.boolean().optional(),
  occurrenceStartsAt: z.string().optional(),
  recurrence: z
    .object({ freq: z.enum(['daily', 'weekdays', 'weekly']), days: z.array(z.number()).optional() })
    .optional(),
  fact: z.string().optional(),
  planDate: z.string().optional(),
  planFrom: z.string().optional(),
  planTo: z.string().optional(),
});

const outputSchema = z.object({ reply: z.string(), actions: z.array(actionSchema) });

type ChatAction = z.infer<typeof actionSchema>;

const HISTORY_FOR_CONTEXT = 6;

function toRecurrence(raw: ChatAction['recurrence'], start: Date | null): Recurrence | null {
  if (!raw) return null;
  if (raw.freq !== 'weekly') return { freq: raw.freq };
  const days = (raw.days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return { freq: 'weekly', days: days.length ? days : [start?.getDay() ?? 1] };
}

function toMessage(row: typeof chatMessages.$inferSelect, undone: boolean): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    text: row.text,
    batchId: row.batchId,
    undone,
    isError: row.isError,
    createdAt: row.createdAt.toISOString(),
  };
}

export function listChat(db: Db, limit = 40): ChatMessage[] {
  const rows = db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)).limit(limit).all().reverse();
  const undone = new Set(
    db.select({ id: changeBatches.id }).from(changeBatches).where(isNotNull(changeBatches.undoneAt)).all().map((b) => b.id),
  );
  return rows.map((r) => toMessage(r, r.batchId !== null && undone.has(r.batchId)));
}

interface ApplyResult {
  applied: number;

  skipped: number;

  addedToInbox: boolean;

  planNote: string | null;
}

async function applyActions(db: Db, ai: AiRunner, actions: ChatAction[], now: Date, recorder: Recorder): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, skipped: 0, addedToInbox: false, planNote: null };
  const plans: ChatAction[] = [];

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'create': {
          if (!action.title?.trim()) throw new Error('title missing');
          const start = parseLocalDateTime(action.startsAt);
          const end = parseLocalDateTime(action.endsAt);
          const allDay = Boolean(action.allDay && start);
          const allDayStart = allDay && start ? new Date(start.getFullYear(), start.getMonth(), start.getDate()) : start;
          createTask(
            db,
            {
              title: action.title.trim(),
              startsAt: allDayStart?.toISOString() ?? null,
              endsAt: end && allDayStart && end > allDayStart ? end.toISOString() : null,
              allDay,
              recurrence: toRecurrence(action.recurrence, allDayStart),
            },
            now,
            recorder,
          );
          if (!start) result.addedToInbox = true;
          break;
        }
        case 'update': {
          const task = getTaskOrThrow(db, action.taskId ?? '');
          const start = parseLocalDateTime(action.startsAt);
          const end = parseLocalDateTime(action.endsAt);
          updateTask(
            db,
            task.id,
            {
              ...(action.title?.trim() ? { title: action.title.trim() } : {}),
              ...(action.unschedule
                ? { startsAt: null }
                : start
                  ? { startsAt: start.toISOString(), ...(end && end > start ? { endsAt: end.toISOString() } : {}), ...(action.allDay !== undefined ? { allDay: action.allDay } : {}) }
                  : {}),
              ...(action.recurrence ? { recurrence: toRecurrence(action.recurrence, start ?? task.startsAt) } : {}),
            },
            now,
            recorder,
          );
          if (action.unschedule) result.addedToInbox = true;
          break;
        }
        case 'delete':
          deleteTask(db, action.taskId ?? '', recorder);
          break;
        case 'complete':
        case 'uncomplete':
          setCompleted(
            db,
            action.taskId ?? '',
            { done: action.type === 'complete', occurrenceStartsAt: parseLocalDateTime(action.occurrenceStartsAt)?.toISOString() },
            now,
            recorder,
          );
          break;
        case 'remember': {
          if (!action.fact?.trim()) throw new Error('fact missing');
          const id = randomUUID();
          captureFact(db, recorder, id);
          db.insert(facts).values({ id, text: action.fact.trim().slice(0, 300), source: 'chat', createdAt: now, updatedAt: now }).run();
          break;
        }
        case 'plan':
          plans.push(action);
          continue;
      }
      result.applied++;
    } catch (error) {
      if (!(error instanceof NotFoundError)) console.error('[chat] action failed:', action.type, error);
      result.skipped++;
    }
  }

  // 계획은 다른 변경을 다 반영한 뒤에 짠다. 방금 추가한 할 일도 배치 후보가 된다.
  const plan = plans.at(-1);
  if (plan) {
    const outcome = await planDay(
      db,
      ai,
      {
        ...(plan.planDate && /^\d{4}-\d{2}-\d{2}$/.test(plan.planDate) ? { date: plan.planDate } : {}),
        ...(plan.planFrom && /^\d{2}:\d{2}$/.test(plan.planFrom) ? { from: plan.planFrom } : {}),
        ...(plan.planTo && /^\d{2}:\d{2}$/.test(plan.planTo) ? { to: plan.planTo } : {}),
      },
      now,
      recorder,
    );
    result.planNote = outcome.created > 0 ? `제안 ${outcome.created}개를 캘린더에 흐리게 놓았어요. 눌러서 확정해 주세요.` : outcome.message;
    if (outcome.created > 0) result.applied++;
  }

  return result;
}

function insertMessage(db: Db, values: Omit<typeof chatMessages.$inferInsert, 'id'>) {
  return db.insert(chatMessages).values({ id: randomUUID(), ...values }).returning().get();
}

export async function handleChat(db: Db, ai: AiRunner, grouping: GroupingService, text: string, now: Date) {
  const history = db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)).limit(HISTORY_FOR_CONTEXT).all().reverse();
  const userRow = insertMessage(db, { role: 'user', text, createdAt: now });

  const prompt = [
    describeNow(now),
    describeSchedule(db, now),
    describeInbox(db),
    describeProfile(db, now),
    history.length ? `최근 대화:\n${history.map((m) => `${m.role === 'user' ? '사용자' : 'Plop'}: ${m.text}`).join('\n')}` : '',
    `사용자 요청: ${text}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const output = await ai.run({ system: SYSTEM, prompt, schema: outputSchema, tier: 'fast' });
    const recorder = createRecorder();
    const result = await applyActions(db, ai, output.actions, new Date(), recorder);
    const batchId = saveBatch(db, recorder, new Date());

    if (result.addedToInbox) grouping.schedule();

    const notes = [
      result.planNote,
      result.skipped > 0 && result.applied === 0 ? '요청한 할 일을 찾지 못해 반영하지 못했어요.' : null,
      result.skipped > 0 && result.applied > 0 ? `${result.skipped}개는 반영하지 못했어요.` : null,
    ].filter(Boolean);
    const reply = [output.reply.trim(), ...notes].filter(Boolean).join(' ');

    const assistantRow = insertMessage(db, { role: 'assistant', text: reply || '반영했어요.', batchId, createdAt: new Date() });
    return [toMessage(userRow, false), toMessage(assistantRow, false)];
  } catch (error) {
    const message = error instanceof AiError ? error.message : '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
    if (!(error instanceof AiError)) console.error('[chat] failed:', error);
    const assistantRow = insertMessage(db, { role: 'assistant', text: message, isError: true, createdAt: new Date() });
    return [toMessage(userRow, false), toMessage(assistantRow, false)];
  }
}

export function undoChat(db: Db, batchId: string, now: Date) {
  return undoBatch(db, batchId, now);
}

export function getMessageByBatch(db: Db, batchId: string) {
  return db.select().from(chatMessages).where(eq(chatMessages.batchId, batchId)).get();
}
