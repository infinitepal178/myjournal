// Follow-ups: things you said you'd do, and when to ask you about them.
// Stored in .journal/followups.json, with a readable copy in followups.md.

import { addDays, formatDay, formatShort, isoWeek, weekRange } from './dates';

export type FollowUpStatus = 'open' | 'done' | 'partly' | 'not-done' | 'dropped';

export interface FollowUp {
  /** Stable id; reminders made from the same answer reuse it so edits don't duplicate. */
  id: string;
  text: string;
  people: string[];
  /** Day the promise was made. */
  created: string;
  /** Day to ask about it. */
  due: string;
  /** File it came from, if any. */
  source?: string;
  status: FollowUpStatus;
  /** What actually happened, in your words. */
  outcome?: string;
  closed?: string;
  /** How many times it was pushed back. */
  snoozed?: number;
}

export interface FollowUpFile {
  version: 1;
  items: FollowUp[];
}

export const FOLLOWUPS_PATH = '.journal/followups.json';
export const FOLLOWUPS_MD_PATH = 'followups.md';

export const STATUS_LABEL: Record<FollowUpStatus, string> = {
  open: 'Open',
  done: 'Done',
  partly: 'Partly',
  'not-done': "Didn't happen",
  dropped: 'Dropped',
};

export const emptyFollowUps = (): FollowUpFile => ({ version: 1, items: [] });

export function parseFollowUps(text: string | null): FollowUpFile {
  if (!text) return emptyFollowUps();
  try {
    const j = JSON.parse(text);
    if (j && Array.isArray(j.items)) {
      const items = j.items.filter((x: Partial<FollowUp>) => x && typeof x.id === 'string' && typeof x.text === 'string' && typeof x.due === 'string');
      return { version: 1, items: items.map((x: FollowUp) => ({ ...x, people: Array.isArray(x.people) ? x.people : [], status: x.status ?? 'open' })) };
    }
  } catch {
    /* fall through */
  }
  return emptyFollowUps();
}

const byDue = (a: FollowUp, b: FollowUp) => a.due.localeCompare(b.due) || a.created.localeCompare(b.created);

export function serializeFollowUps(f: FollowUpFile): string {
  return JSON.stringify({ version: 1, items: [...f.items].sort(byDue) }, null, 2) + '\n';
}

/** Apply new or changed follow-ups (matched by id) on top of the latest file. */
export function mergeFollowUps(base: FollowUpFile, changes: FollowUp[]): FollowUpFile {
  const map = new Map(base.items.map((i) => [i.id, i]));
  for (const c of changes) map.set(c.id, c);
  return { version: 1, items: [...map.values()] };
}

/** Open follow-ups whose day has come (or passed), oldest first. */
export const dueFollowUps = (f: FollowUpFile, today: string) => f.items.filter((i) => i.status === 'open' && i.due <= today).sort(byDue);
export const upcomingFollowUps = (f: FollowUpFile, today: string) => f.items.filter((i) => i.status === 'open' && i.due > today).sort(byDue);
export const closedFollowUps = (f: FollowUpFile) =>
  f.items.filter((i) => i.status !== 'open').sort((a, b) => (b.closed ?? '').localeCompare(a.closed ?? ''));

// ---------- timing ----------

export type When = 'tomorrow' | 'this-week' | 'next-week' | 'two-weeks';

export const WHEN_LABEL: Record<When, string> = {
  tomorrow: 'Tomorrow',
  'this-week': 'End of this week',
  'next-week': 'End of next week',
  'two-weeks': 'In two weeks',
};

/** Sunday that ends the week containing `date`. */
export const endOfWeek = (date: string) => weekRange(isoWeek(date).id).end;

export function dueDate(from: string, when: When): string {
  switch (when) {
    case 'tomorrow':
      return addDays(from, 1);
    case 'this-week': {
      const end = endOfWeek(from);
      return end === from ? addDays(from, 7) : end; // on Sunday, "this week" means the coming one
    }
    case 'next-week':
      return addDays(endOfWeek(from), 7);
    case 'two-weeks':
      return addDays(from, 14);
  }
}

/** "tomorrow", "Sun 30 Nov", "2 days ago" … */
export function describeDue(due: string, today: string): string {
  if (due === today) return 'today';
  if (due === addDays(today, 1)) return 'tomorrow';
  if (due === addDays(today, -1)) return 'yesterday';
  return formatDay(due);
}

// ---------- helpers ----------

export function newFollowUp(text: string, created: string, due: string, people: string[], source?: string, id?: string): FollowUp {
  return {
    id: id ?? `${created}-${Math.random().toString(36).slice(2, 8)}`,
    text: text.trim(),
    people,
    created,
    due,
    source,
    status: 'open',
  };
}

/** Names from your people list that appear in the text, e.g. "Call Priya" → [Priya]. */
export function detectPeople(text: string, known: string[]): string[] {
  return known.filter((p) => new RegExp(`(^|[^\\p{L}])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu').test(text));
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

/** Link that opens Google Calendar with an all-day reminder filled in. */
export function calendarLink(f: FollowUp): string {
  const d = f.due.replace(/-/g, '');
  const next = addDays(f.due, 1).replace(/-/g, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Follow up: ${f.text}`,
    dates: `${d}/${next}`,
    details: `From your journal on ${formatShort(f.created)}. Open myjournal to note how it went.`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Human-readable followups.md, regenerated on every change. */
export function renderFollowUpsMd(f: FollowUpFile): string {
  const open = f.items.filter((i) => i.status === 'open').sort(byDue);
  const closed = closedFollowUps(f);
  const who = (i: FollowUp) => (i.people.length ? ` (with ${i.people.join(', ')})` : '');
  const lines = ['# Follow-ups', '', '_Written by myjournal. Things I said I would do, and what happened._', '', '## Open', ''];
  if (!open.length) lines.push('Nothing open.');
  for (const i of open) lines.push(`- [ ] ${i.text}${who(i)}: ask on ${formatShort(i.due)} · from ${formatShort(i.created)}`);
  lines.push('', '## Closed', '');
  if (!closed.length) lines.push('Nothing closed yet.');
  for (const i of closed) {
    const mark = i.status === 'done' ? 'x' : ' ';
    lines.push(`- [${mark}] ${i.text}${who(i)}: **${STATUS_LABEL[i.status]}**${i.closed ? ` on ${formatShort(i.closed)}` : ''}${i.outcome ? `. ${i.outcome.replace(/\s*\n\s*/g, ' ')}` : ''}`);
  }
  return lines.join('\n') + '\n';
}
