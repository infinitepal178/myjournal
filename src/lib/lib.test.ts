import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS test helper
import { createFakeGitHub } from '../../tests/fake-github.mjs';
import { addDays, formatRange, isoWeek, monthGrid, weekRange, weekday } from './dates';
import {
  classifyPath,
  emptyLife,
  gratitudePath,
  lifePath,
  parseGratitude,
  parseLife,
  parseWeekly,
  serializeGratitude,
  serializeLife,
  serializeWeekly,
  weeklyPath,
} from './entries';
import { GitHub } from './github';
import { ConflictError, Journal } from './journal';
import { emptyIndex, parseIndex, searchIndex, streaks, summarizeWeek, withDay } from './journalIndex';

describe('dates', () => {
  it('computes ISO weeks, including year boundaries', () => {
    expect(isoWeek('2026-11-18').id).toBe('2026-W47');
    expect(isoWeek('2026-01-01').id).toBe('2026-W01'); // Thursday
    expect(isoWeek('2027-01-01').id).toBe('2026-W53'); // Friday belongs to last year's week
    expect(isoWeek('2024-12-30').id).toBe('2025-W01');
  });
  it('gives week ranges Monday→Sunday', () => {
    expect(weekRange('2026-W47')).toMatchObject({ start: '2026-11-16', end: '2026-11-22' });
    expect(formatRange('2026-11-16', '2026-11-22')).toBe('16–22 Nov');
  });
  it('builds Monday-first month grids', () => {
    const g = monthGrid(2026, 11); // 1 Nov 2026 is a Sunday
    expect(g.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(g.filter(Boolean)).toHaveLength(30);
    expect(weekday('2026-11-18')).toBe(2);
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
  });
});

describe('entry files', () => {
  it('round-trips gratitude.md', () => {
    const g = { date: '2026-11-18', items: ['A long call with Mum.', 'Slept 8 hours.\nFinally.', 'Sam: "covered" the call'], prompt: 'Who made today easier?', tags: ['family'], created: '2026-11-18T21:42:10' };
    const md = serializeGratitude(g);
    expect(md).toContain('# Gratitude · Wed 18 Nov 2026');
    expect(md).toContain('2. Slept 8 hours. Finally.');
    expect(parseGratitude(md, g.date)).toEqual({ ...g, items: ['A long call with Mum.', 'Slept 8 hours. Finally.', 'Sam: "covered" the call'], updated: undefined });
  });
  it('round-trips life.md and omits empty sections', () => {
    const l = { ...emptyLife('2026-11-18'), mood: 4, energy: 3, scores: { me: 4, relationships: null, work: 2 }, people: ['Mum', 'Sam'], notes: { me: 'Gym.\n\nFelt sharp.', relationships: '', work: 'Deck is late.', tomorrow: 'Reply to Priya.' } };
    const md = serializeLife(l);
    expect(md).toContain('people: [Mum, Sam]');
    expect(md).not.toContain('## Relationships');
    expect(parseLife(md, l.date)).toEqual({ ...l, created: undefined, updated: undefined });
  });
  it('parses files edited by hand', () => {
    const l = parseLife('---\nmood: 9\nscores: { me: 3 }\n---\n## me\nhello\n## Work\n', '2026-11-18');
    expect(l.mood).toBeNull();
    expect(l.scores.me).toBe(3);
    expect(l.notes.me).toBe('hello');
    expect(parseGratitude('- one\n* two\n3) three', '2026-11-18').items).toEqual(['one', 'two', 'three']);
  });
  it('round-trips weekly check-ins', () => {
    const w = { week: '2026-W47', start: '2026-11-16', end: '2026-11-22', daysWritten: 5, averages: { mood: 3.6 }, answers: [{ prompt: 'Best moment of the week', answer: 'Dinner.' }, { prompt: 'What drained me', answer: '' }] };
    const md = serializeWeekly(w);
    expect(md).toContain('Week 47 (16–22 Nov 2026)');
    const back = parseWeekly(md, w.week);
    expect(back.answers).toEqual([{ prompt: 'Best moment of the week', answer: 'Dinner.' }]);
    expect(back.averages).toEqual({ mood: 3.6 });
  });
  it('uses the agreed folder layout', () => {
    expect(gratitudePath('2026-11-18')).toBe('daily/2026/11/2026-11-18/gratitude.md');
    expect(lifePath('2026-11-18')).toBe('daily/2026/11/2026-11-18/life.md');
    expect(weeklyPath('2026-W47')).toBe('checkins/weekly/2026/2026-W47.md');
    expect(classifyPath('daily/2026/11/2026-11-18/life.md')).toEqual({ kind: 'life', date: '2026-11-18' });
    expect(classifyPath('checkins/weekly/2026/2026-W47.md')).toEqual({ kind: 'weekly', week: '2026-W47' });
    expect(classifyPath('notes.md')).toBeNull();
  });
});

describe('index', () => {
  it('counts streaks', () => {
    const s = new Set(['2026-11-10', '2026-11-11', '2026-11-15', '2026-11-16', '2026-11-17']);
    expect(streaks(s, '2026-11-18')).toEqual({ current: 3, best: 3 }); // today not written yet
    expect(streaks(new Set([...s, '2026-11-18']), '2026-11-18').current).toBe(4);
    expect(streaks(new Set(['2026-11-01']), '2026-11-18').current).toBe(0);
  });
  it('summarises a week and searches', () => {
    let i = emptyIndex();
    i = withDay(i, '2026-11-16', { gratitude: { date: '2026-11-16', items: ['Sunny walk'], tags: [] }, life: { ...emptyLife('2026-11-16'), mood: 3, scores: { me: 3, relationships: 4, work: 2 }, people: ['Mum'] } });
    i = withDay(i, '2026-11-17', { life: { ...emptyLife('2026-11-17'), mood: 4, people: ['Mum', 'Sam'], tags: ['deadline'] } });
    i = withDay(i, '2026-11-24', { gratitude: { date: '2026-11-24', items: ['Next week'], tags: [] } });
    const w = summarizeWeek(parseIndex(JSON.stringify(i)), '2026-W47', new Set(['2026-11-16', '2026-11-17']));
    expect(w.daysWritten).toBe(2);
    expect(w.averages).toEqual({ mood: 3.5, me: 3, relationships: 4, work: 2 });
    expect(w.gratitude).toEqual([{ date: '2026-11-16', text: 'Sunny walk' }]);
    expect(w.people[0]).toEqual({ name: 'Mum', count: 2 });
    expect(searchIndex(i, 'sunny')).toEqual([{ date: '2026-11-16', match: 'Sunny walk' }]);
    expect(searchIndex(i, '#dead')[0].date).toBe('2026-11-17');
  });
});

describe('journal against a fake GitHub', () => {
  const setup = async (opts = {}) => {
    const fake = createFakeGitHub(opts);
    const gh = new GitHub('me', 'myjournal-data', 'tok', fake.fetch);
    const info = await gh.getRepo();
    const j = new Journal(gh, info.defaultBranch, info.htmlUrl);
    await j.bootstrap(info);
    return { fake, j };
  };

  it('sets up an empty repo', async () => {
    const { fake } = await setup({ empty: true });
    expect(fake.paths().sort()).toEqual(['.journal/config.json', '.journal/index.json', 'README.md']);
  });

  it('saves a day as one commit and reads it back', async () => {
    const { fake, j } = await setup();
    const day = await j.loadDay('2026-11-18');
    await j.saveDay(day, { gratitude: { date: '2026-11-18', items: ['a', 'b', 'c'], tags: [] }, life: { ...emptyLife('2026-11-18'), mood: 5 } });
    expect(fake.commitMessages()[0]).toBe('gratitude + life: 2026-11-18');
    expect(fake.file('daily/2026/11/2026-11-18/gratitude.md')).toContain('3. c');
    const o = await j.overview();
    expect([...o.written]).toEqual(['2026-11-18']);
    expect(o.index.days['2026-11-18'].mood).toBe(5);
    const again = await j.loadDay('2026-11-18');
    expect(again.gratitude?.items).toEqual(['a', 'b', 'c']);
    expect(again.gratitude?.created).toBeTruthy();
  });

  it('retries when the branch moves mid-save, keeping both changes in the index', async () => {
    const { fake, j } = await setup();
    await j.saveDay(await j.loadDay('2026-11-17'), { gratitude: { date: '2026-11-17', items: ['x'], tags: [] } });
    fake.failNextRefUpdate();
    await j.saveDay(await j.loadDay('2026-11-18'), { gratitude: { date: '2026-11-18', items: ['y'], tags: [] } });
    const o = await j.overview();
    expect(Object.keys(o.index.days)).toEqual(['2026-11-17', '2026-11-18']);
  });

  it('refuses to overwrite an entry edited elsewhere unless forced', async () => {
    const { fake, j } = await setup();
    const day = await j.loadDay('2026-11-18');
    fake.write('daily/2026/11/2026-11-18/gratitude.md', '1. written on github\n');
    const g = { date: '2026-11-18', items: ['mine'], tags: [] };
    await expect(j.saveDay(day, { gratitude: g })).rejects.toBeInstanceOf(ConflictError);
    await j.saveDay(day, { gratitude: g }, true);
    expect(fake.file('daily/2026/11/2026-11-18/gratitude.md')).toContain('1. mine');
  });

  it('rebuilds the index from files', async () => {
    const { fake, j } = await setup();
    fake.write('daily/2026/11/2026-11-10/gratitude.md', '1. hand-written\n');
    const idx = await j.rebuildIndex();
    expect(idx.days['2026-11-10'].gratitude).toEqual(['hand-written']);
  });
});
