// .journal/config.json: your own prompts and people list. Edit it on GitHub
// (Settings → Edit prompts); the app picks up changes the next time it opens.

export interface JournalConfig {
  version: 1;
  /** Also use the app's built-in prompt library (src/lib/prompts.ts). */
  builtInPrompts: boolean;
  /** Your own gratitude prompts, mixed in with the built-in ones. */
  gratitudePrompts: string[];
  /** The fixed questions on every weekly check-in, in order. */
  weeklyPrompts: string[];
  /** Your own deeper weekly questions; one is added to each check-in. */
  weeklyQuestions: string[];
  /** Names offered as chips on the Relationships step. */
  people: string[];
}

export const DEFAULT_CONFIG: JournalConfig = {
  version: 1,
  builtInPrompts: true,
  gratitudePrompts: [],
  weeklyPrompts: [
    'Best moment of the week',
    'What drained me',
    'A relationship to invest in next week',
    "Work: what moved, what's stuck",
    'One intention for next week',
  ],
  weeklyQuestions: [],
  people: [],
};

export function parseConfig(text: string | null): JournalConfig {
  if (!text) return DEFAULT_CONFIG;
  try {
    const j = JSON.parse(text) as Partial<JournalConfig>;
    const list = (v: unknown) => (Array.isArray(v) ? v.map(String).map((x) => x.trim()).filter(Boolean) : []);
    const weekly = list(j.weeklyPrompts);
    return {
      version: 1,
      builtInPrompts: j.builtInPrompts !== false,
      gratitudePrompts: list(j.gratitudePrompts),
      weeklyPrompts: weekly.length ? weekly : DEFAULT_CONFIG.weeklyPrompts,
      weeklyQuestions: list(j.weeklyQuestions),
      people: list(j.people),
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export const serializeConfig = (c: JournalConfig) => JSON.stringify(c, null, 2) + '\n';

export const DATA_README = `# My journal

This private repo is written by the **myjournal** app. Every entry is a Markdown file.

\`\`\`
daily/YYYY/MM/YYYY-MM-DD/gratitude.md   three things I'm grateful for
daily/YYYY/MM/YYYY-MM-DD/life.md        mood, energy, me / relationships / work
checkins/weekly/YYYY/YYYY-Www.md        Sunday review
followups.md                            things I said I'd do, and what happened
.journal/config.json                    my own prompts and people (safe to edit)
.journal/followups.json                 follow-up data used by the app
.journal/index.json                     summary used by the app (rebuildable)
\`\`\`

Keep this repo **private**.
`;
