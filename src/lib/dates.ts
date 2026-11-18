// Date helpers. Every journal date is a local calendar day written as
// "YYYY-MM-DD". Arithmetic is done on UTC day numbers so daylight-saving
// changes can never shift a day.

const DAY_MS = 86_400_000;

/** plural(1, 'day') → "1 day", plural(3, 'day') → "3 days" */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const pad = (n: number) => String(n).padStart(2, '0');

/** Today's (or the given moment's) local calendar date. */
export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function dayNum(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromDayNum(n: number): string {
  const d = new Date(n * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(key: string, n: number): string {
  return fromDayNum(dayNum(key) + n);
}

export function daysBetween(a: string, b: string): number {
  return dayNum(b) - dayNum(a);
}

/** Monday = 0 … Sunday = 6 */
export function weekday(key: string): number {
  return (new Date(dayNum(key) * DAY_MS).getUTCDay() + 6) % 7;
}

export function mondayOf(key: string): string {
  return addDays(key, -weekday(key));
}

/** ISO-8601 week, e.g. 2026-11-18 → { year: 2026, week: 47, id: "2026-W47" } */
export function isoWeek(key: string): { year: number; week: number; id: string } {
  const monday = mondayOf(key);
  const year = Number(addDays(monday, 3).slice(0, 4)); // the week's Thursday decides the year
  const week1 = mondayOf(`${year}-01-04`);
  const week = 1 + daysBetween(week1, monday) / 7;
  return { year, week, id: `${year}-W${pad(week)}` };
}

export function weekRange(id: string): { start: string; end: string; days: string[] } {
  const m = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!m) throw new Error(`Not an ISO week: ${id}`);
  const start = addDays(mondayOf(`${m[1]}-01-04`), (Number(m[2]) - 1) * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return { start, end: days[6], days };
}

export function shiftWeek(id: string, n: number): string {
  return isoWeek(addDays(weekRange(id).start, n * 7)).id;
}

function fmt(key: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(new Date(dayNum(key) * DAY_MS));
}

/** "Wednesday, 18 November" */
export const formatLong = (key: string) => fmt(key, { weekday: 'long', day: 'numeric', month: 'long' });
/** "Wed 18 Nov 2026" */
export const formatShort = (key: string) =>
  fmt(key, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(',', '');
/** "Wed 18 Nov" */
export const formatDay = (key: string) => fmt(key, { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
/** "November 2026" */
export const formatMonth = (year: number, month: number) => fmt(`${year}-${pad(month)}-01`, { month: 'long', year: 'numeric' });
/** "16–22 Nov" */
export function formatRange(start: string, end: string): string {
  const s = fmt(start, { day: 'numeric', month: 'short' });
  const e = fmt(end, { day: 'numeric', month: 'short' });
  return start.slice(5, 7) === end.slice(5, 7) ? `${s.split(' ')[0]}–${e}` : `${s} – ${e}`;
}

/** Calendar cells for a month, Monday first. Leading cells are null. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = `${year}-${pad(month)}-01`;
  const len = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array(weekday(first)).fill(null);
  for (let d = 1; d <= len; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`);
  return cells;
}

/** Local ISO timestamp without a zone, e.g. 2026-11-18T21:42:10 */
export function localTimestamp(d: Date = new Date()): string {
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function dayOfYear(key: string): number {
  return daysBetween(`${key.slice(0, 4)}-01-01`, key);
}
