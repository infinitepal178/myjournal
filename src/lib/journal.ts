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
import {
  FOLLOWUPS_MD_PATH,
  FOLLOWUPS_PATH,
  emptyFollowUps,
  mergeFollowUps,
  parseFollowUps,
  renderFollowUpsMd,
  serializeFollowUps,
  type FollowUp,
  type FollowUpFile,
} from './followups';
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
  followUps: FollowUpFile;
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

export function overviewFrom(files: string[], index: JournalIndex, config: JournalConfig, followUps: FollowUpFile = emptyFollowUps()): Overview {
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
    followUps,
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

const followUpFiles = (f: FollowUpFile): FileChange[] => [
  { path: FOLLOWUPS_PATH, content: serializeFollowUps(f) },
  { path: FOLLOWUPS_MD_PATH, content: renderFollowUpsMd(f) },
];

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
    const files = await this.gh.listFiles(this.branch);
    const has = new Set(files);
    const read = (p: string) => (has.has(p) ? this.gh.readFile(p, this.branch) : Promise.resolve(null));
    const [indexText, configText, followText] = await Promise.all([read(INDEX_PATH), read(CONFIG_PATH), read(FOLLOWUPS_PATH)]);
    return overviewFrom(files, parseIndex(indexText), parseConfig(configText), parseFollowUps(followText));
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
    followUps: FollowUp[] = [],
  ): Promise<{ day: DayData; index: JournalIndex; followUps: FollowUpFile | null }> {
    const now = localTimestamp();
    const date = loaded.date;
    const gratitude = parts.gratitude && { ...parts.gratitude, created: loaded.gratitude?.created ?? now, updated: now };
    const life = parts.life && { ...parts.life, created: loaded.life?.created ?? now, updated: now };
    const gText = gratitude ? serializeGratitude(gratitude) : loaded.raw.gratitude;
    const lText = life ? serializeLife(life) : loaded.raw.life;
    let index = emptyIndex();
    let follow: FollowUpFile | null = null;

    const what = [gratitude && 'gratitude', life && 'life', followUps.length && 'follow-ups'].filter(Boolean).join(' + ');
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
      if (followUps.length) {
        follow = await this.followUpsAt(head, followUps);
        files.push(...followUpFiles(follow));
      }
      return files;
    });

    return {
      followUps: follow,
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

  /** Save a weekly check-in (or only follow-up answers, when `weekly` is null). */
  async saveWeekly(
    loaded: WeeklyData,
    weekly: Weekly | null,
    force = false,
    followUps: FollowUp[] = [],
  ): Promise<{ data: WeeklyData; followUps: FollowUpFile | null }> {
    const now = localTimestamp();
    const w = weekly && { ...weekly, created: loaded.weekly?.created ?? now, updated: now };
    const text = w ? serializeWeekly(w) : loaded.raw;
    let follow: FollowUpFile | null = null;
    const label = w ? `weekly check-in${followUps.length ? ' + follow-ups' : ''}: ${w.week}` : 'follow-ups';
    await this.gh.commit(this.branch, label, async (head) => {
      const files: FileChange[] = [];
      if (w) {
        const path = weeklyPath(w.week);
        if (!force && (await this.gh.readFile(path, head)) !== loaded.raw) throw new ConflictError([path]);
        files.push({ path, content: text! });
      }
      if (followUps.length) {
        follow = await this.followUpsAt(head, followUps);
        files.push(...followUpFiles(follow));
      }
      return files;
    });
    return { data: w ? { weekly: w, raw: text } : loaded, followUps: follow };
  }

  /** Save follow-up changes on their own (e.g. answering one from the Today screen). */
  async saveFollowUps(changes: FollowUp[], message = 'follow-ups'): Promise<FollowUpFile> {
    let follow = emptyFollowUps();
    await this.gh.commit(this.branch, message, async (head) => {
      follow = await this.followUpsAt(head, changes);
      return followUpFiles(follow);
    });
    return follow;
  }

  private async followUpsAt(head: string, changes: FollowUp[]): Promise<FollowUpFile> {
    return mergeFollowUps(parseFollowUps(await this.gh.readFile(FOLLOWUPS_PATH, head)), changes);
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
