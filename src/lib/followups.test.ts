import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS test helper
import { createFakeGitHub } from '../../tests/fake-github.mjs';
import { DEFAULT_CONFIG, parseConfig } from './config';
import { emptyLife } from './entries';
import {
  detectPeople,
  dueDate,
  dueFollowUps,
  mergeFollowUps,
  newFollowUp,
  parseFollowUps,
  renderFollowUpsMd,
  serializeFollowUps,
  upcomingFollowUps,
} from './followups';
import { GitHub } from './github';
import { Journal } from './journal';
import { GRATITUDE_LIBRARY, WEEKLY_LIBRARY, gratitudePool, gratitudePromptFor, weeklyQuestionFor } from './prompts';

describe('prompts', () => {
  it('has a large library without duplicates', () => {
    expect(new Set(GRATITUDE_LIBRARY.map((p) => p.toLowerCase())).size).toBe(GRATITUDE_LIBRARY.length);
    expect(GRATITUDE_LIBRARY.length).toBeGreaterThanOrEqual(40);
    expect(WEEKLY_LIBRARY.length).toBeGreaterThanOrEqual(25);
  });
  it('gives a stable prompt per day and ↻ moves to a different one', () => {
    const a = gratitudePromptFor(DEFAULT_CONFIG, '2026-11-18');
    expect(gratitudePromptFor(DEFAULT_CONFIG, '2026-11-18')).toBe(a);
    expect(gratitudePromptFor(DEFAULT_CONFIG, '2026-11-18', 1)).not.toBe(a);
    expect(gratitudePromptFor(DEFAULT_CONFIG, '2026-11-19')).toBe(gratitudePromptFor(DEFAULT_CONFIG, '2026-11-18', 1));
  });
  it("doesn't repeat until the list is used up", () => {
    const seen = new Set<string>();
    for (let d = 0; d < GRATITUDE_LIBRARY.length; d++) seen.add(gratitudePromptFor(DEFAULT_CONFIG, '2026-01-01', d));
    expect(seen.size).toBe(GRATITUDE_LIBRARY.length);
  });
  it('mixes in your own prompts, or uses only yours', () => {
    const mine = parseConfig(JSON.stringify({ gratitudePrompts: ['What did my dog teach me?'] }));
    expect(gratitudePool(mine)).toContain('What did my dog teach me?');
    expect(gratitudePool(mine).length).toBe(GRATITUDE_LIBRARY.length + 1);
    const only = parseConfig(JSON.stringify({ builtInPrompts: false, gratitudePrompts: ['Only this'] }));
    expect(gratitudePromptFor(only, '2026-11-18')).toBe('Only this');
  });
  it('keeps working with the first version of config.json', () => {
    const old = parseConfig(JSON.stringify({ version: 1, gratitudePrompts: ['Who made today easier?'], weeklyPrompts: ['A'], people: ['Mum'] }));
    expect(old.builtInPrompts).toBe(true);
    expect(gratitudePool(old).length).toBe(GRATITUDE_LIBRARY.length); // the old default is already in the library
    expect(old.people).toEqual(['Mum']);
    expect(weeklyQuestionFor(old, '2026-W47')).toBe(weeklyQuestionFor(old, '2026-W47'));
    expect(weeklyQuestionFor(old, '2026-W47', 1)).not.toBe(weeklyQuestionFor(old, '2026-W47'));
  });
});

describe('follow-ups', () => {
  it('works out when to ask', () => {
    expect(dueDate('2026-11-18', 'tomorrow')).toBe('2026-11-19');
    expect(dueDate('2026-11-18', 'this-week')).toBe('2026-11-22');
    expect(dueDate('2026-11-22', 'this-week')).toBe('2026-11-29'); // said on a Sunday
    expect(dueDate('2026-11-18', 'next-week')).toBe('2026-11-29');
    expect(dueDate('2026-11-18', 'two-weeks')).toBe('2026-12-02');
  });
  it('finds people by whole name, any case', () => {
    expect(detectPeople('call priya and Sam tonight', ['Priya', 'Sam', 'Arun'])).toEqual(['Priya', 'Sam']);
    expect(detectPeople('bought a Samsung', ['Sam'])).toEqual([]);
  });
  it('merges by id and sorts due vs upcoming', () => {
    const a = newFollowUp('Call Priya', '2026-11-16', '2026-11-18', ['Priya'], undefined, 'a');
    const b = newFollowUp('Gym 3x', '2026-11-16', '2026-11-29', [], undefined, 'b');
    let f = mergeFollowUps(parseFollowUps(null), [a, b]);
    expect(dueFollowUps(f, '2026-11-18').map((x) => x.id)).toEqual(['a']);
    expect(upcomingFollowUps(f, '2026-11-18').map((x) => x.id)).toEqual(['b']);
    f = mergeFollowUps(f, [{ ...a, status: 'done', outcome: 'We planned the trip.', closed: '2026-11-18' }]);
    expect(f.items).toHaveLength(2);
    expect(dueFollowUps(f, '2026-11-18')).toEqual([]);
    const back = parseFollowUps(serializeFollowUps(f));
    expect(back.items.find((x) => x.id === 'a')?.outcome).toBe('We planned the trip.');
    const md = renderFollowUpsMd(f);
    expect(md).toContain('- [ ] Gym 3x: ask on Sun 29 Nov 2026');
    expect(md).toContain('- [x] Call Priya (with Priya): **Done** on Wed 18 Nov 2026. We planned the trip.');
  });
  it('ignores a broken file instead of crashing', () => {
    expect(parseFollowUps('{not json').items).toEqual([]);
    expect(parseFollowUps('{"items":[{"id":1}]}').items).toEqual([]);
  });

  it('saves follow-ups in the same commit as the day, and on their own', async () => {
    const fake = createFakeGitHub();
    const gh = new GitHub('me', 'myjournal-data', 'tok', fake.fetch);
    const info = await gh.getRepo();
    const j = new Journal(gh, info.defaultBranch, info.htmlUrl);
    await j.bootstrap(info);
    const f = newFollowUp('Reply to Priya', '2026-11-18', '2026-11-19', ['Priya'], 'daily/2026/11/2026-11-18/life.md', '2026-11-18-tomorrow');
    const r = await j.saveDay(await j.loadDay('2026-11-18'), { life: { ...emptyLife('2026-11-18'), notes: { me: '', relationships: '', work: '', tomorrow: 'Reply to Priya' } } }, false, [f]);
    expect(fake.commitMessages()[0]).toBe('life + follow-ups: 2026-11-18');
    expect(r.followUps?.items).toHaveLength(1);
    expect(fake.file('followups.md')).toContain('Reply to Priya (with Priya)');
    // Another device adds a follow-up; answering ours must keep theirs.
    const other = newFollowUp('Book dentist', '2026-11-18', '2026-11-25', [], undefined, 'other');
    fake.write('.journal/followups.json', serializeFollowUps(mergeFollowUps(parseFollowUps(fake.file('.journal/followups.json')), [other])));
    const after = await j.saveFollowUps([{ ...f, status: 'done', closed: '2026-11-19' }]);
    expect(after.items.map((x) => x.id).sort()).toEqual(['2026-11-18-tomorrow', 'other']);
    expect((await j.overview()).followUps.items.find((x) => x.id === '2026-11-18-tomorrow')?.status).toBe('done');
    // Weekly save with only follow-up changes writes no check-in file.
    const w = await j.saveWeekly(await j.loadWeekly('2026-W47'), null, false, [{ ...other, status: 'dropped', closed: '2026-11-19' }]);
    expect(w.data.weekly).toBeNull();
    expect(fake.paths().some((p: string) => p.startsWith('checkins/'))).toBe(false);
  });
});
