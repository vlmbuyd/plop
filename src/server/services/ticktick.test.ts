import { describe, expect, it } from 'vitest';

import { createDb } from '../db/client';
import { tasks } from '../db/schema';
import { importTickTick, parseTickTickDate, parseTickTickRepeat } from './ticktick';

const CSV = `"Date: 2026-11-09+0000"
"Version: 7.1"
"Status: 
0 Normal
1 Completed
2 Archived"
"Folder Name","List Name","Title","Kind","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId"
"","Primary","이력서 고치기","TEXT","","금요일까지","N","","","","","0","0","2026-11-01T00:00:00+0000","","1","Asia/Seoul","","false","","","list","a1",""
"","Primary","알고리즘 스터디","TEXT","","","N","2026-11-09T04:00:00+0000","2026-11-09T04:30:00+0000","","RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR","0","0","2026-11-01T00:00:00+0000","","2","Asia/Seoul","false","false","","","list","a2",""
"","Simple","스프린트 데모데이","TEXT","","","N","2026-11-12T15:00:00+0000","2026-11-12T15:00:00+0000","","","0","0","2026-11-01T00:00:00+0000","","3","Asia/Seoul","true","false","","","list","a3",""
"","Simple","끝난 일","TEXT","","","N","","","","","0","2","2026-11-01T00:00:00+0000","2026-11-02T00:00:00+0000","4","Asia/Seoul","","false","","","list","a4",""
"","NA","격주 회의","TEXT","","","N","2026-11-10T01:00:00+0000","2026-11-10T02:00:00+0000","","RRULE:FREQ=WEEKLY;INTERVAL=2","0","0","2026-11-01T00:00:00+0000","","5","Asia/Seoul","false","false","","","list","a5",""
`;

describe('parseTickTickRepeat', () => {
  it('평일 반복, 매일 반복, 매주 요일 반복을 옮긴다', () => {
    expect(parseTickTickRepeat('RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR', null)).toEqual({ freq: 'weekdays' });
    expect(parseTickTickRepeat('RRULE:FREQ=DAILY;INTERVAL=1', null)).toEqual({ freq: 'daily' });
    expect(parseTickTickRepeat('RRULE:FREQ=WEEKLY;BYDAY=TU,TH', null)).toEqual({ freq: 'weekly', days: [2, 4] });
  });

  it('간격이 1이 아니면 지원하지 않는다고 알린다', () => {
    expect(parseTickTickRepeat('RRULE:FREQ=WEEKLY;INTERVAL=2', null)).toBe('unsupported');
  });
});

describe('parseTickTickDate', () => {
  it('+0000 같은 시간대 표기를 읽는다', () => {
    expect(parseTickTickDate('2026-11-09T04:00:00+0000')?.toISOString()).toBe('2026-11-09T04:00:00.000Z');
  });
});

describe('importTickTick', () => {
  it('완료하지 않은 할 일만 가져오고, 다시 가져와도 겹치지 않는다', () => {
    const db = createDb(':memory:');
    const now = new Date('2026-11-09T07:00:00Z');

    const first = importTickTick(db, CSV, now);
    expect(first).toMatchObject({ imported: 4, scheduled: 3, inbox: 1, recurring: 1, skipped: 1, unsupportedRepeat: 1 });

    const second = importTickTick(db, CSV, now);
    expect(second.imported).toBe(0);
    expect(db.select().from(tasks).all()).toHaveLength(4);
  });

  it('날짜 없는 할 일은 목록으로, 메모는 노트로 가져온다', () => {
    const db = createDb(':memory:');
    importTickTick(db, CSV, new Date());
    const resume = db.select().from(tasks).all().find((t) => t.title === '이력서 고치기');
    expect(resume).toMatchObject({ startsAt: null, notes: '금요일까지', groupId: null });
  });
});
