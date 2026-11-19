// Weekly check-in: Direction A's week summary beside the reflection prompts.

import { useEffect, useMemo, useState } from 'react';
import { FollowUpReview, applyAnswers, type Answer } from '../components/FollowUps';
import { ExternalLink, type ToastState } from '../components/ui';
import { addDays, dateKey, formatDay, formatRange, isoWeek, shiftWeek, weekRange } from '../lib/dates';
import { weeklyPath, type WeeklyAnswer } from '../lib/entries';
import { detectPeople, dueFollowUps, newFollowUp, slug, type FollowUp, type FollowUpFile } from '../lib/followups';
import { explainError } from '../lib/github';
import { weeklyQuestionFor } from '../lib/prompts';
import { ConflictError, type Journal, type Overview, type WeeklyData } from '../lib/journal';
import { knownPeople, summarizeWeek } from '../lib/journalIndex';
import { clearDraft, loadDraft, saveDraft } from '../lib/store';

function mergeAnswers(prompts: string[], saved: WeeklyAnswer[] = []): WeeklyAnswer[] {
  const byPrompt = new Map(saved.map((a) => [a.prompt.toLowerCase(), a.answer]));
  const out = prompts.map((p) => ({ prompt: p, answer: byPrompt.get(p.toLowerCase()) ?? '' }));
  for (const a of saved) if (!prompts.some((p) => p.toLowerCase() === a.prompt.toLowerCase())) out.push(a);
  return out;
}

interface WeeklyDraft {
  answers: WeeklyAnswer[];
  question: string;
  remind: Record<string, boolean>;
}

/** Prompts about next week get a follow-up by default. */
const remindsByDefault = (prompt: string) => /next week/i.test(prompt);
const reminderId = (week: string, prompt: string) => `${week}-${slug(prompt)}`;

const LABELS = { mood: 'Mood', me: 'Me', relationships: 'Relationships', work: 'Work' } as const;

export function Checkin({
  journal,
  overview,
  toast,
  onSaved,
}: {
  journal: Journal;
  overview: Overview;
  toast: (t: ToastState) => void;
  onSaved: (week: string | null, followUps: FollowUpFile | null) => void;
}) {
  const today = dateKey();
  const currentWeek = isoWeek(today).id;
  const [week, setWeek] = useState(currentWeek);
  const [data, setData] = useState<WeeklyData | null>(null);
  const [answers, setAnswers] = useState<WeeklyAnswer[]>([]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reload, setReload] = useState(0);
  const [question, setQuestion] = useState('');
  const [questionSkip, setQuestionSkip] = useState(0);
  const [remind, setRemind] = useState<Record<string, boolean>>({});
  const [fuAnswers, setFuAnswers] = useState<Record<string, Answer>>({});

  const range = weekRange(week);
  const summary = useMemo(() => summarizeWeek(overview.index, week, overview.written), [overview, week]);
  const draftKey = `weekly.${week}`;
  const people = useMemo(() => knownPeople(overview.index, overview.config.people), [overview]);
  // Follow-ups whose day falls on or before the end of this week.
  // Daily reminders wait for their own day; plans from earlier weekly check-ins show for the whole week.
  const dueItems =
    week === currentWeek
      ? dueFollowUps(overview.followUps, range.end).filter((f) => f.due <= today || f.source?.startsWith('checkins/weekly/'))
      : [];
  const existing = (prompt: string) => overview.followUps.items.find((f) => f.id === reminderId(week, prompt));

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    setConflict(false);
    journal
      .loadWeekly(week)
      .then((d) => {
        if (!live) return;
        setData(d);
        const raw = loadDraft<WeeklyDraft | WeeklyAnswer[]>(`weekly.${week}`);
        const draft = Array.isArray(raw) ? { answers: raw, question: '', remind: {} } : raw;
        const q = draft?.question || d.weekly?.question || weeklyQuestionFor(overview.config, week);
        const list = draft?.answers ?? mergeAnswers([...overview.config.weeklyPrompts, q], d.weekly?.answers);
        if (!list.some((a) => a.prompt === q)) list.push({ prompt: q, answer: '' });
        setQuestion(q);
        setQuestionSkip(0);
        setAnswers(list);
        setRemind(
          draft?.remind ??
            Object.fromEntries(
              list.map((a) => {
                const f = overview.followUps.items.find((x) => x.id === reminderId(week, a.prompt));
                return [a.prompt, f ? f.status === 'open' : remindsByDefault(a.prompt)];
              }),
            ),
        );
        setFuAnswers({});
        setDirty(!!draft);
      })
      .catch((e) => live && setError(explainError(e)));
    return () => {
      live = false;
    };
    // Deliberately not reloading on overview changes: that would wipe what you're typing.
  }, [journal, week, reload]);

  useEffect(() => {
    if (dirty) saveDraft(draftKey, { answers, question, remind } satisfies WeeklyDraft);
  }, [answers, question, remind, dirty, draftKey]);

  const refreshQuestion = () => {
    const skip = questionSkip + 1;
    const next = weeklyQuestionFor(overview.config, week, skip);
    setAnswers((list) => list.map((a) => (a.prompt === question ? { ...a, prompt: next } : a)));
    setRemind((r) => ({ ...r, [next]: r[question] ?? false }));
    setQuestion(next);
    setQuestionSkip(skip);
    setDirty(true);
  };

  const setAnswer = (i: number, answer: string) => {
    setAnswers((a) => a.map((x, j) => (j === i ? { ...x, answer } : x)));
    setDirty(true);
  };

  async function save(force = false) {
    if (!data) return;
    const hasAnswers = answers.some((a) => a.answer.trim());
    const changes: FollowUp[] = applyAnswers(dueItems, fuAnswers, today);
    for (const a of answers) {
      const text = a.answer.trim().replace(/\s*\n\s*/g, ' ').slice(0, 200);
      const prev = existing(a.prompt);
      if (prev && prev.status !== 'open') continue; // already answered; leave it alone
      if (remind[a.prompt] && text)
        changes.push({
          ...newFollowUp(text, today, addDays(range.end, 7), detectPeople(text, people), weeklyPath(week), reminderId(week, a.prompt)),
          ...(prev ? { created: prev.created, due: prev.due, snoozed: prev.snoozed } : {}),
        });
      else if (prev) changes.push({ ...prev, status: 'dropped', closed: today });
    }
    if (!hasAnswers && !changes.length) {
      toast({ text: 'Answer at least one prompt before saving.', error: true });
      return;
    }
    setSaving(true);
    setConflict(false);
    try {
      const saved = await journal.saveWeekly(
        data,
        hasAnswers ? { week, start: range.start, end: range.end, daysWritten: summary.daysWritten, averages: summary.averages, answers, question } : null,
        force,
        changes,
      );
      clearDraft(draftKey);
      setDirty(false);
      setData(saved.data);
      setFuAnswers({});
      onSaved(hasAnswers ? week : null, saved.followUps);
      const n = changes.filter((c) => c.status === 'open' && !dueItems.some((d) => d.id === c.id)).length;
      toast({ text: hasAnswers ? `Saved week ${isoWeek(range.start).week}${n ? `. I'll ask about ${n === 1 ? 'your plan' : `${n} plans`} on ${formatDay(addDays(range.end, 7))}` : ''}` : 'Follow-ups saved' });
    } catch (e) {
      if (e instanceof ConflictError) setConflict(true);
      else toast({ text: explainError(e), error: true });
    } finally {
      setSaving(false);
    }
  }

  const { week: weekNo } = isoWeek(range.start);

  return (
    <div>
      <div className="page-head">
        <span className="kicker">Weekly check-in</span>
        <div className="spread" style={{ flexWrap: 'nowrap' }}>
          <button className="btn sm ghost" aria-label="Previous week" onClick={() => setWeek(shiftWeek(week, -1))}>
            ‹
          </button>
          <div style={{ textAlign: 'center' }}>
            <h1 className="title" style={{ fontSize: 24 }}>
              Week {weekNo}
            </h1>
            <div className="small muted">
              {formatRange(range.start, range.end)} {range.end.slice(0, 4)}
              {week === currentWeek ? ' · this week' : ''}
            </div>
          </div>
          <button className="btn sm ghost" aria-label="Next week" onClick={() => setWeek(shiftWeek(week, 1))} disabled={week >= currentWeek}>
            ›
          </button>
        </div>
      </div>

      <div className="two-col">
        <div className="card stack">
          <h2>Your week{week === currentWeek && range.end > today ? ' so far' : ''}</h2>
          <div className="stack" style={{ gap: 6 }}>
            <div className="daystrip" aria-hidden="true">
              {summary.days.map((d) => (
                <i key={d} className={overview.written.has(d) ? 'on' : undefined} title={formatDay(d)} />
              ))}
            </div>
            <span className="small muted">
              {summary.daysWritten} of 7 days written
            </span>
          </div>
          {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((k) => {
            const v = summary.averages[k];
            return (
              <div className="bar" key={k}>
                <span>{LABELS[k]}</span>
                <div>
                  <b style={{ width: v ? `${(v / 5) * 100}%` : 0 }} />
                </div>
                <span>{v ?? '–'}</span>
              </div>
            );
          })}
          <div>
            <span className="label">Gratitude this week</span>
            {summary.gratitude.length ? (
              <ul className="glist" style={{ marginTop: 6 }}>
                {summary.gratitude.map((g, i) => (
                  <li key={i}>
                    {g.text} <span className="tiny muted">· {formatDay(g.date).split(' ')[0]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted" style={{ margin: '6px 0 0' }}>
                No gratitude entries this week yet.
              </p>
            )}
          </div>
          {summary.people.length > 0 && (
            <div>
              <span className="label">People you mentioned</span>
              <p className="small" style={{ margin: '6px 0 0' }}>
                {summary.people.map((p) => `${p.name} ×${p.count}`).join(' · ')}
              </p>
            </div>
          )}
        </div>

        <div className="card strong stack">
          <div className="spread">
            <h2>Reflect</h2>
            <span className="tiny muted">
              {data?.weekly?.updated ? `Saved ${formatDay(data.weekly.updated.slice(0, 10))}` : dirty ? 'Draft on this device' : 'Not written yet'}
            </span>
          </div>
          {error && <div className="notice danger">{error}</div>}
          {!data && !error && <p className="small muted">Loading…</p>}
          {conflict && (
            <div className="notice danger stack" style={{ gap: 8 }}>
              <span>This check-in was changed on GitHub or another device after you opened it here.</span>
              <div className="row">
                <button
                  className="btn sm"
                  onClick={() => {
                    clearDraft(draftKey);
                    setReload((r) => r + 1);
                  }}
                >
                  Load the newer version
                </button>
                <button className="btn sm danger" onClick={() => save(true)}>
                  Save mine anyway
                </button>
              </div>
            </div>
          )}
          {data && dueItems.length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              <span className="label">From earlier: you said you'd do {dueItems.length === 1 ? 'this' : 'these'}</span>
              <FollowUpReview
                items={dueItems}
                answers={fuAnswers}
                onChange={(a) => {
                  setFuAnswers(a);
                }}
                today={today}
              />
            </div>
          )}
          {data &&
            answers.map((a, i) => {
              const isQuestion = a.prompt === question;
              return (
                <div className="field" key={isQuestion ? 'question' : a.prompt}>
                  {isQuestion && (
                    <div className="spread">
                      <span className="kicker">This week's question</span>
                      <button type="button" className="btn sm ghost" onClick={refreshQuestion} aria-label="Show a different question">
                        ↻ Another
                      </button>
                    </div>
                  )}
                  <label className="label" htmlFor={`weekly-${i}`} style={{ textTransform: 'none', letterSpacing: 0, fontSize: 14, color: 'var(--ink)' }}>
                    {a.prompt}
                  </label>
                  <textarea id={`weekly-${i}`} className="textarea" style={{ minHeight: 90 }} value={a.answer} onChange={(e) => setAnswer(i, e.target.value)} />
                  {a.answer.trim() && (
                    <label className="row tiny muted" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <input
                        type="checkbox"
                        id={`weekly-remind-${i}`}
                        checked={!!remind[a.prompt]}
                        disabled={existing(a.prompt) ? existing(a.prompt)!.status !== 'open' : false}
                        onChange={(e) => {
                          setRemind({ ...remind, [a.prompt]: e.target.checked });
                          setDirty(true);
                        }}
                      />
                      <span>
                        {existing(a.prompt) && existing(a.prompt)!.status !== 'open'
                          ? 'Follow-up already answered'
                          : `Ask me how this went at the end of next week (${formatDay(addDays(range.end, 7))})`}
                      </span>
                    </label>
                  )}
                </div>
              );
            })}
          {data && (
            <>
              <button className="btn primary wide" disabled={saving} onClick={() => save()}>
                {saving ? 'Saving…' : data.weekly ? 'Update check-in' : 'Save check-in'}
              </button>
              <div className="row tiny muted">
                <span>
                  Saves to <span className="path">{weeklyPath(week)}</span>
                </span>
                {data.weekly && <ExternalLink href={journal.fileUrl(weeklyPath(week))}>Open on GitHub ↗</ExternalLink>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
