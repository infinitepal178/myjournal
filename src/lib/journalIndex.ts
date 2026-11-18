// .journal/index.json: a small summary per day, so streaks, search and the
// weekly check-in load from one file instead of one request per entry.
// It can always be rebuilt from the Markdown files (Settings → Rebuild).

import { addDays, weekRange } from './dates';
import type { Gratitude, Life, Score, Scores } from './entries';

export interface DaySummary {
  gratitude?: string[];
  mood?: Score;
  energy?: Score;
  scores?: Scores;
  people?: string[];
  tags?: string[];
}

export interface JournalIndex {
  version: 1;
  updated?: string;
  days: Record<string, DaySummary>;
}

export const emptyIndex = (): JournalIndex => ({ version: 1, days: {} });

export function parseIndex(text: string | null): JournalIndex {
  if (!text) return emptyIndex();
  try {
    const j = JSON.parse(text);
    if (j && typeof j === 'object' && j.days && typeof j.days === 'object') return { version: 1, updated: j.updated, days: j.days };
  } catch {
    /* fall through */
  }
  return emptyIndex();
}

export function serializeIndex(index: JournalIndex): string {
  const days = Object.fromEntries(Object.entries(index.days).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({ ...index, days }, null, 2) + '\n';
}

/** Merge one day's entries into the index. Parts left undefined are kept as they were. */
export function withDay(index: JournalIndex, date: string, parts: { gratitude?: Gratitude; life?: Life }, updated?: string): JournalIndex {
  const prev = index.days[date] ?? {};
  const next: DaySummary = { ...prev };
  if (parts.gratitude) {
    next.gratitude = parts.gratitude.items.filter(Boolean);
    next.tags = Array.from(new Set([...(parts.life?.tags ?? prev.tags ?? []), ...parts.gratitude.tags]));
  }
  if (parts.life) {
    next.mood = parts.life.mood;
    next.energy = parts.life.energy;
    next.scores = parts.life.scores;
    next.people = parts.life.people;
    next.tags = Array.from(new Set([...parts.life.tags, ...(parts.gratitude?.tags ?? [])]));
  }
  return { ...index, updated: updated ?? index.updated, days: { ...index.days, [date]: next } };
}

// ---------- streaks ----------

export function streaks(written: Set<string>, today: string): { current: number; best: number } {
  let start = written.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (written.has(start)) {
    current++;
    start = addDays(start, -1);
  }
  const sorted = [...written].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best: Math.max(best, current) };
}

// ---------- weekly summary ----------

export interface WeekSummary {
  days: string[];
  daysWritten: number;
  averages: Partial<Record<'mood' | 'me' | 'relationships' | 'work', number>>;
  gratitude: { date: string; text: string }[];
  people: { name: string; count: number }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function summarizeWeek(index: JournalIndex, weekId: string, written: Set<string>): WeekSummary {
  const { days } = weekRange(weekId);
  const vals: Record<'mood' | 'me' | 'relationships' | 'work', number[]> = { mood: [], me: [], relationships: [], work: [] };
  const gratitude: WeekSummary['gratitude'] = [];
  const people = new Map<string, number>();
  for (const d of days) {
    const s = index.days[d];
    if (!s) continue;
    if (s.mood) vals.mood.push(s.mood);
    if (s.scores?.me) vals.me.push(s.scores.me);
    if (s.scores?.relationships) vals.relationships.push(s.scores.relationships);
    if (s.scores?.work) vals.work.push(s.scores.work);
    for (const t of s.gratitude ?? []) gratitude.push({ date: d, text: t });
    for (const p of s.people ?? []) people.set(p, (people.get(p) ?? 0) + 1);
  }
  const averages: WeekSummary['averages'] = {};
  for (const k of Object.keys(vals) as (keyof typeof vals)[]) {
    if (vals[k].length) averages[k] = round1(vals[k].reduce((a, b) => a + b, 0) / vals[k].length);
  }
  return {
    days,
    daysWritten: days.filter((d) => written.has(d)).length,
    averages,
    gratitude,
    people: [...people].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}

/** Search gratitude lines, people and tags. Newest first. */
export function searchIndex(index: JournalIndex, query: string): { date: string; match: string }[] {
  const q = query.trim().toLowerCase().replace(/^#/, '');
  if (!q) return [];
  const out: { date: string; match: string }[] = [];
  for (const [date, s] of Object.entries(index.days)) {
    const hit =
      s.gratitude?.find((g) => g.toLowerCase().includes(q)) ??
      s.people?.find((p) => p.toLowerCase().includes(q)) ??
      s.tags?.map((t) => `#${t}`).find((t) => t.toLowerCase().includes(q));
    if (hit) out.push({ date, match: hit });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Everyone mentioned so far, most frequent first. */
export function knownPeople(index: JournalIndex, extra: string[] = []): string[] {
  const counts = new Map<string, number>();
  for (const p of extra) counts.set(p, 0);
  for (const s of Object.values(index.days)) for (const p of s.people ?? []) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p]) => p);
}
