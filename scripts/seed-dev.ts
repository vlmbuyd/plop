/** 개발용 데이터(./.data)에 이번 주 예시 할 일을 넣는다. 매일 쓰는 데이터에는 쓰지 않는다. */
import { randomUUID } from 'node:crypto';

import { openDataDb, resolveDataDir } from '../src/server/db/client';
import { tasks } from '../src/server/db/schema';

if (!process.env.PLOP_DATA_DIR) {
  console.error('PLOP_DATA_DIR가 없습니다. 매일 쓰는 데이터를 보호하려고 멈춥니다.');
  process.exit(1);
}

const db = openDataDb();
const now = new Date();
const monday = new Date(now);
monday.setHours(0, 0, 0, 0);
monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

function at(dayOffset: number, hour: number, minute = 0) {
  const date = new Date(monday);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date;
}

const samples = [
  { title: '알고리즘 스터디', startsAt: at(0, 13), endsAt: at(0, 13, 30), recurrence: { freq: 'weekdays' as const } },
  { title: '탐색 튜토리얼 기능 추가', startsAt: at(0, 0), endsAt: at(1, 0), allDay: true },
  { title: '테코톡 편집', startsAt: at(1, 14, 15), endsAt: at(1, 15, 15) },
  { title: '피드백장 정리', startsAt: at(2, 11, 30), endsAt: at(2, 12, 30) },
  { title: '스프린트 데모데이', startsAt: at(4, 0), endsAt: at(5, 0), allDay: true },
  { title: '최종 데모데이 2부', startsAt: at(4, 14), endsAt: at(4, 16, 30) },
  { title: '알고리즘 공부', startsAt: at(0, 13, 30), endsAt: at(0, 14, 10), completedAt: at(0, 14, 20) },
  { title: '이력서 중본 최종 점검' },
  { title: '하네스 토큰 사용량 측정' },
  { title: '랜딩 페이지 인터랙션 라이브러리로 만들기' },
  { title: 'TS 스터디 질문 달기' },
  { title: 'react router, layout 노션에 정리' },
  { title: '예비군 일정 확인' },
];

db.delete(tasks).run();
db.insert(tasks)
  .values(samples.map((s) => ({ id: randomUUID(), allDay: false, createdAt: now, updatedAt: now, ...s })))
  .run();

console.log(`${samples.length}개를 넣었습니다: ${resolveDataDir()}`);
