// ISO 8601 week helpers (Monday-start, UTC). weekId format: "YYYY-Www", e.g. "2026-W31".
// Needed to (a) derive a fallback current week before the very first weekCutover.lua run
// ever sets config:currentWeekId, and (b) compute earnScore.lua's minutesSinceWeekStart
// argument, which is business/time logic and therefore lives outside the Redis repository.

export function getIsoWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function getIsoWeekStart(weekId: string): Date {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekId);
  if (!match) {
    throw new Error(`Invalid weekId: ${weekId}`);
  }
  const year = Number(match[1]);
  const week = Number(match[2]);

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const start = new Date(week1Monday);
  start.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return start;
}

export function getMinutesSinceWeekStart(weekId: string, now: Date = new Date()): number {
  const start = getIsoWeekStart(weekId);
  return Math.floor((now.getTime() - start.getTime()) / 60000);
}
