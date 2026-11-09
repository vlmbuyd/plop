/** 보이는 기간의 연월 제목. 기간이 두 달에 걸치면 둘 다 보여 준다. */
export function formatCalendarTitle(start: Date, endExclusive: Date) {
  const end = new Date(endExclusive.getTime() - 1);
  const startText = `${start.getFullYear()}년 ${start.getMonth() + 1}월`;

  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) return startText;
  if (start.getFullYear() === end.getFullYear()) return `${startText} ~ ${end.getMonth() + 1}월`;
  return `${startText} ~ ${end.getFullYear()}년 ${end.getMonth() + 1}월`;
}
