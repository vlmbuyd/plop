/** 오전 9시, 오후 2시 30분 */
export function formatTime(date: Date) {
  const h = date.getHours();
  const m = date.getMinutes();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${h < 12 ? '오전' : '오후'} ${hour12}시${m ? ` ${m}분` : ''}`;
}

/** 11월 10일 (화) */
export function formatDay(date: Date) {
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

export function formatRange(start: Date, end: Date, allDay: boolean) {
  if (allDay) {
    const last = new Date(end.getTime() - 1);
    return last.toDateString() === start.toDateString() ? `${formatDay(start)} 하루 종일` : `${formatDay(start)} ~ ${formatDay(last)}`;
  }
  return `${formatDay(start)} ${formatTime(start)} ~ ${formatTime(end)}`;
}
