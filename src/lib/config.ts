// .journal/config.json: your prompts and people list. Edit it on GitHub to
// change the prompts; the app picks the changes up on the next load.

import { dayOfYear } from './dates';

export interface JournalConfig {
  version: 1;
  gratitudePrompts: string[];
  weeklyPrompts: string[];
  people: string[];
}

export const DEFAULT_CONFIG: JournalConfig = {
  version: 1,
  gratitudePrompts: [
    'Who made today easier?',
    'What small moment do you want to remember?',
    'What did your body let you do today?',
    'What went better than you expected?',
    'What made you laugh or smile?',
    "What's something you usually take for granted?",
    'Who are you glad is in your life, and why?',
  ],
  weeklyPrompts: [
    'Best moment of the week',
    'What drained me',
    'A relationship to invest in next week',
    "Work: what moved, what's stuck",
    'One intention for next week',
  ],
  people: [],
};

export function parseConfig(text: string | null): JournalConfig {
  if (!text) return DEFAULT_CONFIG;
  try {
    const j = JSON.parse(text) as Partial<JournalConfig>;
    const list = (v: unknown, fallback: string[]) =>
      Array.isArray(v) && v.length ? v.map(String).filter(Boolean) : fallback;
    return {
      version: 1,
      gratitudePrompts: list(j.gratitudePrompts, DEFAULT_CONFIG.gratitudePrompts),
      weeklyPrompts: list(j.weeklyPrompts, DEFAULT_CONFIG.weeklyPrompts),
      people: Array.isArray(j.people) ? j.people.map(String).filter(Boolean) : [],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export const serializeConfig = (c: JournalConfig) => JSON.stringify(c, null, 2) + '\n';

/** The gratitude prompt for a given day; rotates daily. */
export function promptFor(config: JournalConfig, date: string): string {
  const p = config.gratitudePrompts;
  return p[dayOfYear(date) % p.length];
}

export const DATA_README = `# My journal

This private repo is written by the **myjournal** app. Every entry is a Markdown file.

\`\`\`
daily/YYYY/MM/YYYY-MM-DD/gratitude.md   three things I'm grateful for
daily/YYYY/MM/YYYY-MM-DD/life.md        mood, energy, me / relationships / work
checkins/weekly/YYYY/YYYY-Www.md        Sunday review
.journal/config.json                    prompts (safe to edit)
.journal/index.json                     summary used by the app (rebuildable)
\`\`\`

Keep this repo **private**.
`;
