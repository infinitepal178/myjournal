// The journal: reads and writes entries in the data repo.

import { DATA_README, DEFAULT_CONFIG, parseConfig, serializeConfig, type JournalConfig } from './config';
import { localTimestamp } from './dates';
import {
  CONFIG_PATH,
  INDEX_PATH,
  classifyPath,
  gratitudePath,
  lifePath,
  parseGratitude,
  parseLife,
  parseWeekly,
  serializeGratitude,
  serializeLife,
  serializeWeekly,
  weeklyPath,
  type Gratitude,
  type Life,
  type Weekly,
} from './entries';
import { GitHub, type FileChange, type RepoInfo } from './github';
import { emptyIndex, parseIndex, serializeIndex, withDay, type JournalIndex } from './journalIndex';

/** Raised when a file changed on GitHub (or another device) after it was loaded here. */
export class ConflictError extends Error {
  constructor(public paths: string[]) {
    super('This entry was changed somewhere else after you opened it.');
  }
}

export interface Overview {
  files: Set<string>;
  /** Days with a gratitude or life entry. */
  written: Set<string>;
  gratitudeDays: Set<string>;
  lifeDays: Set<string>;
  weeklies: Set<string>;
  index: JournalIndex;
  config: JournalConfig;
}

export interface DayData {
  date: string;
  gratitude: Gratitude | null;
  life: Life | null;
  /** File contents as loaded, used to detect edits made elsewhere. */
  raw: { gratitude: string | null; life: string | null };
}

export interface WeeklyData {
  weekly: Weekly | null;
  raw: string | null;
}

export function overviewFrom(files: string[], index: JournalIndex, config: JournalConfig): Overview {
  const gratitudeDays = new Set<string>();
  const lifeDays = new Set<string>();
  const weeklies = new Set<string>();
  for (const p of files) {
    const c = classifyPath(p);
    if (!c) continue;
    if (c.kind === 'weekly') weeklies.add(c.week);
    else (c.kind === 'gratitude' ? gratitudeDays : lifeDays).add(c.date);
  }
  return {
    files: new Set(files),
    written: new Set([...gratitudeDays, ...lifeDays]),
    gratitudeDays,
    lifeDays,
    weeklies,
    index,
    config,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export class Journal {
  constructor(
    public gh: GitHub,
    public branch: string,
    public repoUrl: string,
  ) {}

  fileUrl = (path: string) => `${this.repoUrl}/blob/${this.branch}/${path}`;
  historyUrl = (path: string) => `${this.repoUrl}/commits/${this.branch}/${path}`;

  /** First-run setup: create README, config and index if they're missing. */
  async bootstrap(info: RepoInfo): Promise<void> {
    if (info.empty) await this.gh.createFirstFile('README.md', DATA_README, 'Set up journal');
    const files = new Set(await this.gh.listFiles(this.branch));
    const hasEntries = [...files].some((p) => classifyPath(p));
    if (files.has('README.md') && files.has(CONFIG_PATH) && files.has(INDEX_PATH)) return;
    const index = hasEntries && !files.has(INDEX_PATH) ? await this.buildIndex([...files]) : null;
    await this.gh.commit(this.branch, 'Set up journal', async () => {
      const out: FileChange[] = [];
      if (!files.has('README.md')) out.push({ path: 'README.md', content: DATA_README });
      if (!files.has(CONFIG_PATH)) out.push({ path: CONFIG_PATH, content: serializeConfig(DEFAULT_CONFIG) });
      if (!files.has(INDEX_PATH)) out.push({ path: INDEX_PATH, content: serializeIndex(index ?? emptyIndex()) });
      return out;
    });
  }

  async overview(): Promise<Overview> {
    const [files, indexText, configText] = await Promise.all([
      this.gh.listFiles(this.branch),
      this.gh.readFile(INDEX_PATH, this.branch),
      this.gh.readFile(CONFIG_PATH, this.branch),
    ]);
    return overviewFrom(files, parseIndex(indexText), parseConfig(configText));
  }

  async loadDay(date: string): Promise<DayData> {
    const [g, l] = await Promise.all([this.gh.readFile(gratitudePath(date), this.branch), this.gh.readFile(lifePath(date), this.branch)]);
    return {
      date,
      gratitude: g === null ? null : parseGratitude(g, date),
      life: l === null ? null : parseLife(l, date),
      raw: { gratitude: g, life: l },
    };
  }

  /**
   * Save one day. Only the parts passed in are written. Unless `force` is set,
   * the save stops with ConflictError if a file changed since `loaded`.
   */
  async saveDay(
    loaded: DayData,
    parts: { gratitude?: Gratitude; life?: Life },
    force = false,
  ): Promise<{ day: DayData; index: JournalIndex }> {
    const now = localTimestamp();
    const date = loaded.date;
    const gratitude = parts.gratitude && { ...parts.gratitude, created: loaded.gratitude?.created ?? now, updated: now };
    const life = parts.life && { ...parts.life, created: loaded.life?.created ?? now, updated: now };
    const gText = gratitude ? serializeGratitude(gratitude) : loaded.raw.gratitude;
    const lText = life ? serializeLife(life) : loaded.raw.life;
    let index = emptyIndex();

    const what = [gratitude && 'gratitude', life && 'life'].filter(Boolean).join(' + ');
    await this.gh.commit(this.branch, `${what}: ${date}`, async (head) => {
      if (!force) {
        const changed: string[] = [];
        const checks: [boolean, string, string | null][] = [
          [!!gratitude, gratitudePath(date), loaded.raw.gratitude],
          [!!life, lifePath(date), loaded.raw.life],
        ];
        for (const [writing, path, before] of checks) {
          if (writing && (await this.gh.readFile(path, head)) !== before) changed.push(path);
        }
        if (changed.length) throw new ConflictError(changed);
      }
      index = withDay(parseIndex(await this.gh.readFile(INDEX_PATH, head)), date, { gratitude, life }, now);
      const files: FileChange[] = [];
      if (gratitude) files.push({ path: gratitudePath(date), content: gText! });
      if (life) files.push({ path: lifePath(date), content: lText! });
      files.push({ path: INDEX_PATH, content: serializeIndex(index) });
      return files;
    });

    return {
      day: {
        date,
        gratitude: gratitude ?? loaded.gratitude,
        life: life ?? loaded.life,
        raw: { gratitude: gText, life: lText },
      },
      index,
    };
  }

  async loadWeekly(week: string): Promise<WeeklyData> {
    const raw = await this.gh.readFile(weeklyPath(week), this.branch);
    return { weekly: raw === null ? null : parseWeekly(raw, week), raw };
  }

  async saveWeekly(loaded: WeeklyData, weekly: Weekly, force = false): Promise<WeeklyData> {
    const now = localTimestamp();
    const w = { ...weekly, created: loaded.weekly?.created ?? now, updated: now };
    const text = serializeWeekly(w);
    const path = weeklyPath(w.week);
    await this.gh.commit(this.branch, `weekly check-in: ${w.week}`, async (head) => {
      if (!force && (await this.gh.readFile(path, head)) !== loaded.raw) throw new ConflictError([path]);
      return [{ path, content: text }];
    });
    return { weekly: w, raw: text };
  }

  private async buildIndex(files: string[]): Promise<JournalIndex> {
    const days = files.map(classifyPath).filter((c): c is { kind: 'gratitude' | 'life'; date: string } => !!c && c.kind !== 'weekly');
    const parsed = await mapLimit(days, 6, async (c) => {
      const text = await this.gh.readFile(c.kind === 'gratitude' ? gratitudePath(c.date) : lifePath(c.date), this.branch);
      return { c, text };
    });
    let index = emptyIndex();
    for (const { c, text } of parsed) {
      if (text === null) continue;
      index = withDay(index, c.date, c.kind === 'gratitude' ? { gratitude: parseGratitude(text, c.date) } : { life: parseLife(text, c.date) });
    }
    return { ...index, updated: localTimestamp() };
  }

  /** Re-read every entry and rewrite index.json (use after editing files on GitHub). */
  async rebuildIndex(): Promise<JournalIndex> {
    const index = await this.buildIndex(await this.gh.listFiles(this.branch));
    await this.gh.commit(this.branch, 'Rebuild index', async () => [{ path: INDEX_PATH, content: serializeIndex(index) }]);
    return index;
  }
}
