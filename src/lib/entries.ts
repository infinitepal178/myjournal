// Journal entry types and their Markdown file format.
// Each file is readable Markdown with YAML frontmatter on top; the
// frontmatter holds the structured data, the body holds the writing.

import YAML from 'yaml';
import { formatShort, formatRange, isoWeek } from './dates';

export type Score = number | null; // 1–5, or null when skipped

export interface Scores {
  me: Score;
  relationships: Score;
  work: Score;
}

export interface Gratitude {
  date: string;
  items: string[];
  /** The rotating prompt the last item answered, if any. */
  prompt?: string;
  tags: string[];
  created?: string;
  updated?: string;
}

export interface LifeNotes {
  me: string;
  relationships: string;
  work: string;
  tomorrow: string;
}

export interface Life {
  date: string;
  mood: Score;
  energy: Score;
  scores: Scores;
  people: string[];
  tags: string[];
  notes: LifeNotes;
  created?: string;
  updated?: string;
}

export interface WeeklyAnswer {
  prompt: string;
  answer: string;
}

export interface Weekly {
  week: string;
  start: string;
  end: string;
  daysWritten: number;
  averages: Partial<Record<'mood' | 'me' | 'relationships' | 'work', number>>;
  answers: WeeklyAnswer[];
  /** This week's deeper question (rotates weekly). */
  question?: string;
  created?: string;
  updated?: string;
}

// ---------- paths ----------

export const dayDir = (date: string) => `daily/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}`;
export const gratitudePath = (date: string) => `${dayDir(date)}/gratitude.md`;
export const lifePath = (date: string) => `${dayDir(date)}/life.md`;
export const weeklyPath = (week: string) => `checkins/weekly/${week.slice(0, 4)}/${week}.md`;
export const CONFIG_PATH = '.journal/config.json';
export const INDEX_PATH = '.journal/index.json';

const DAILY_RE = /^daily\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})\/(gratitude|life)\.md$/;
const WEEKLY_RE = /^checkins\/weekly\/\d{4}\/(\d{4}-W\d{2})\.md$/;

export function classifyPath(path: string):
  | { kind: 'gratitude' | 'life'; date: string }
  | { kind: 'weekly'; week: string }
  | null {
  const d = DAILY_RE.exec(path);
  if (d) return { kind: d[2] as 'gratitude' | 'life', date: d[1] };
  const w = WEEKLY_RE.exec(path);
  if (w) return { kind: 'weekly', week: w[1] };
  return null;
}

// ---------- frontmatter ----------

export function splitFrontmatter(md: string): { data: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(md);
  if (!m) return { data: {}, body: md };
  let data: unknown;
  try {
    data = YAML.parse(m[1]);
  } catch {
    data = {};
  }
  return { data: data && typeof data === 'object' ? (data as Record<string, unknown>) : {}, body: m[2] };
}

function frontmatter(data: Record<string, unknown>): string {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  const doc = new YAML.Document(clean);
  // Short lists read better inline: people: [Mum, Sam]
  YAML.visit(doc, {
    Seq(_, node) {
      node.flow = true;
    },
  });
  return `---\n${doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd()}\n---\n`;
}

/** Split a Markdown body into "## Heading" sections. */
function sections(body: string): Map<string, string> {
  const out = new Map<string, string>();
  const parts = body.split(/^## +(.+?)\s*$/m);
  for (let i = 1; i < parts.length; i += 2) out.set(parts[i].trim().toLowerCase(), (parts[i + 1] ?? '').trim());
  return out;
}

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();
const num = (v: unknown): Score => (typeof v === 'number' && v >= 1 && v <= 5 ? v : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
const str = (v: unknown): string | undefined => (v == null ? undefined : String(v));

// ---------- gratitude.md ----------

export function serializeGratitude(g: Gratitude): string {
  const items = g.items.map(oneLine).filter(Boolean);
  const fm = frontmatter({
    type: 'gratitude',
    date: g.date,
    prompt: g.prompt || undefined,
    tags: g.tags,
    created: g.created,
    updated: g.updated,
  });
  const list = items.map((t, i) => `${i + 1}. ${t}`).join('\n');
  return `${fm}# Gratitude · ${formatShort(g.date)}\n\n${list}\n`;
}

export function parseGratitude(md: string, date: string): Gratitude {
  const { data, body } = splitFrontmatter(md);
  const items = body
    .split('\n')
    .map((l) => /^\s*(?:\d+[.)]|[-*])\s+(.*)$/.exec(l)?.[1]?.trim())
    .filter((x): x is string => !!x);
  return {
    date: str(data.date) ?? date,
    items,
    prompt: str(data.prompt),
    tags: strList(data.tags),
    created: str(data.created),
    updated: str(data.updated),
  };
}

// ---------- life.md ----------

const LIFE_SECTIONS: [keyof LifeNotes, string][] = [
  ['me', 'Me'],
  ['relationships', 'Relationships'],
  ['work', 'Work'],
  ['tomorrow', 'Tomorrow'],
];

export function serializeLife(l: Life): string {
  const fm = frontmatter({
    type: 'life',
    date: l.date,
    mood: l.mood,
    energy: l.energy,
    scores: { me: l.scores.me, relationships: l.scores.relationships, work: l.scores.work },
    people: l.people,
    tags: l.tags,
    created: l.created,
    updated: l.updated,
  });
  const body = LIFE_SECTIONS.filter(([k]) => l.notes[k].trim())
    .map(([k, title]) => `## ${title}\n${l.notes[k].trim()}`)
    .join('\n\n');
  return `${fm}# Life · ${formatShort(l.date)}\n${body ? `\n${body}\n` : ''}`;
}

export function parseLife(md: string, date: string): Life {
  const { data, body } = splitFrontmatter(md);
  const s = sections(body);
  const scores = (data.scores ?? {}) as Record<string, unknown>;
  return {
    date: str(data.date) ?? date,
    mood: num(data.mood),
    energy: num(data.energy),
    scores: { me: num(scores.me), relationships: num(scores.relationships), work: num(scores.work) },
    people: strList(data.people),
    tags: strList(data.tags),
    notes: {
      me: s.get('me') ?? '',
      relationships: s.get('relationships') ?? '',
      work: s.get('work') ?? '',
      tomorrow: s.get('tomorrow') ?? '',
    },
    created: str(data.created),
    updated: str(data.updated),
  };
}

// ---------- weekly check-in ----------

export function serializeWeekly(w: Weekly): string {
  const fm = frontmatter({
    type: 'weekly-checkin',
    week: w.week,
    start: w.start,
    end: w.end,
    days_written: w.daysWritten,
    averages: Object.keys(w.averages).length ? w.averages : undefined,
    question: w.question || undefined,
    created: w.created,
    updated: w.updated,
  });
  const body = w.answers
    .filter((a) => a.answer.trim())
    .map((a) => `## ${oneLine(a.prompt)}\n${a.answer.trim()}`)
    .join('\n\n');
  const { week } = isoWeek(w.start);
  return `${fm}# Weekly check-in · Week ${week} (${formatRange(w.start, w.end)} ${w.end.slice(0, 4)})\n${body ? `\n${body}\n` : ''}`;
}

export function parseWeekly(md: string, week: string): Weekly {
  const { data, body } = splitFrontmatter(md);
  const s = sections(body);
  const avg = (data.averages ?? {}) as Record<string, unknown>;
  const averages: Weekly['averages'] = {};
  for (const k of ['mood', 'me', 'relationships', 'work'] as const) if (typeof avg[k] === 'number') averages[k] = avg[k] as number;
  // Keep the original heading text (sections() lowercases keys).
  const headings = [...body.matchAll(/^## +(.+?)\s*$/gm)].map((m) => m[1].trim());
  return {
    week: str(data.week) ?? week,
    start: str(data.start) ?? '',
    end: str(data.end) ?? '',
    daysWritten: typeof data.days_written === 'number' ? data.days_written : 0,
    averages,
    answers: headings.map((h) => ({ prompt: h, answer: s.get(h.toLowerCase()) ?? '' })),
    question: str(data.question),
    created: str(data.created),
    updated: str(data.updated),
  };
}

// ---------- empty values ----------

export const emptyLife = (date: string): Life => ({
  date,
  mood: null,
  energy: null,
  scores: { me: null, relationships: null, work: null },
  people: [],
  tags: [],
  notes: { me: '', relationships: '', work: '', tomorrow: '' },
});
