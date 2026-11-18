// Today: Direction B's guided entry, one question per screen.

import { useEffect, useMemo, useState } from 'react';
import { MoodInput, ScaleInput, moodLabel, type ToastState } from '../components/ui';
import { promptFor } from '../lib/config';
import { addDays, dateKey, formatDay, formatShort, isoWeek, mondayOf, plural, weekday } from '../lib/dates';
import { emptyLife, gratitudePath, lifePath, type LifeNotes, type Score, type Scores } from '../lib/entries';
import { explainError } from '../lib/github';
import { ConflictError, type DayData, type Journal, type Overview } from '../lib/journal';
import { knownPeople, streaks, type JournalIndex } from '../lib/journalIndex';
import { clearDraft, loadDraft, saveDraft } from '../lib/store';
import type { Tab } from '../App';

type Mode = 'full' | 'quick';
type StepId = 'mood' | 'g1' | 'g2' | 'g3' | 'me' | 'relationships' | 'work' | 'tomorrow' | 'review';

const STEPS: Record<Mode, StepId[]> = {
  full: ['mood', 'g1', 'g2', 'g3', 'me', 'relationships', 'work', 'tomorrow', 'review'],
  quick: ['g1', 'g2', 'g3', 'review'],
};

interface Draft {
  mode: Mode;
  step: number;
  items: string[];
  prompt: string;
  tags: string[];
  mood: Score;
  energy: Score;
  scores: Scores;
  people: string[];
  notes: LifeNotes;
}

const draftId = (date: string) => `day.${date}`;

function draftFrom(day: DayData, mode: Mode, prompt: string): Draft {
  const l = day.life ?? emptyLife(day.date);
  const items = [...(day.gratitude?.items ?? [])];
  while (items.length < 3) items.push('');
  return {
    mode,
    step: 0,
    items,
    prompt: day.gratitude?.prompt ?? prompt,
    tags: day.gratitude?.tags ?? [],
    mood: l.mood,
    energy: l.energy,
    scores: { ...l.scores },
    people: [...l.people],
    notes: { ...l.notes },
  };
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Still up?' : h < 12 ? 'Good morning.' : h < 18 ? 'Good afternoon.' : 'Good evening.';
}

interface Props {
  journal: Journal;
  overview: Overview;
  date: string;
  setDate: (d: string) => void;
  onSaved: (day: DayData, index: JournalIndex) => void;
  toast: (t: ToastState) => void;
  goTo: (t: Tab) => void;
  /** Hides the tab bar while answering questions. */
  onFocusMode: (on: boolean) => void;
}

export function Today({ journal, overview, date, setDate, onSaved, toast, goTo, onFocusMode }: Props) {
  const today = dateKey();
  const [day, setDay] = useState<DayData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<'home' | 'flow' | 'done'>('home');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [draftTick, setDraftTick] = useState(0);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    onFocusMode(view === 'flow');
    return () => onFocusMode(false);
  }, [view, onFocusMode]);

  useEffect(() => {
    let live = true;
    setDay(null);
    setLoadError(null);
    setView('home');
    setDraft(null);
    journal
      .loadDay(date)
      .then((d) => live && setDay(d))
      .catch((e) => live && setLoadError(explainError(e)));
    return () => {
      live = false;
    };
  }, [journal, date, reload]);

  // Autosave the draft on this device while writing.
  useEffect(() => {
    if (draft && view === 'flow') saveDraft(draftId(date), draft);
  }, [draft, view, date]);

  const stored = useMemo(() => (view === 'home' ? loadDraft<Draft>(draftId(date)) : null), [date, view, draftTick]);
  const people = useMemo(() => knownPeople(overview.index, overview.config.people), [overview]);

  if (loadError)
    return (
      <div className="narrow stack">
        <div className="notice danger">{loadError}</div>
        <button className="btn" onClick={() => setReload((r) => r + 1)}>
          Try again
        </button>
      </div>
    );
  if (!day) return <div className="center muted">Loading {formatDay(date)}…</div>;

  const start = (mode: Mode) => {
    setDraft(draftFrom(day, mode, promptFor(overview.config, date)));
    setConflict(false);
    setView('flow');
  };

  async function save(force = false) {
    if (!day || !draft) return;
    const items = draft.items.map((s) => s.trim()).filter(Boolean);
    const parts: Parameters<Journal['saveDay']>[1] = {};
    if (items.length) parts.gratitude = { date, items, prompt: draft.items[2]?.trim() ? draft.prompt : undefined, tags: draft.tags };
    if (draft.mode === 'full')
      parts.life = {
        ...(day.life ?? emptyLife(date)),
        date,
        mood: draft.mood,
        energy: draft.energy,
        scores: draft.scores,
        people: draft.people,
        notes: draft.notes,
      };
    if (!parts.gratitude && !parts.life) {
      toast({ text: 'Write at least one thing before saving.', error: true });
      return;
    }
    setSaving(true);
    setConflict(false);
    try {
      const r = await journal.saveDay(day, parts, force);
      clearDraft(draftId(date));
      setDay(r.day);
      onSaved(r.day, r.index);
      setView('done');
    } catch (e) {
      if (e instanceof ConflictError) setConflict(true);
      else toast({ text: explainError(e), error: true });
    } finally {
      setSaving(false);
    }
  }

  // ---------- flow ----------
  if (view === 'flow' && draft) {
    const steps = STEPS[draft.mode];
    const id = steps[draft.step];
    const last = draft.step === steps.length - 1;
    const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
    const setItem = (i: number, v: string) => set({ items: draft.items.map((x, j) => (j === i ? v : x)) });
    const go = (n: number) => {
      if (n < 0) return setView('home');
      set({ step: Math.min(n, steps.length - 1) });
      window.scrollTo(0, 0);
    };
    const isToday = date === today;

    return (
      <div className="narrow flow">
        <div className="flow-top">
          <button className="iconbtn" aria-label="Back" onClick={() => go(draft.step - 1)}>
            ‹
          </button>
          <div className="progress" aria-hidden="true">
            <b style={{ width: `${((draft.step + 1) / steps.length) * 100}%` }} />
          </div>
          <span className="mono muted">
            {draft.step + 1}/{steps.length}
          </span>
          <button className="iconbtn" aria-label="Close and keep draft" onClick={() => setView('home')}>
            ×
          </button>
        </div>

        <div className="flow-body" key={id}>
          {id === 'mood' && (
            <div className="stack">
              <span className="kicker">Check-in · {formatDay(date)}</span>
              <h1 className="q">How was {isToday ? 'today' : 'that day'}, overall?</h1>
              <MoodInput value={draft.mood} onChange={(mood) => set({ mood })} />
              <span className="kicker" style={{ marginTop: 18 }}>
                Energy
              </span>
              <ScaleInput label="Energy" value={draft.energy} onChange={(energy) => set({ energy })} low="drained" high="buzzing" />
            </div>
          )}

          {(id === 'g1' || id === 'g2' || id === 'g3') && (
            <div className="stack">
              <span className="kicker">Gratitude · {Number(id[1])} of 3</span>
              <h1 className="q">
                {id === 'g1'
                  ? `What's one thing you're grateful for ${isToday ? 'today' : 'that day'}?`
                  : id === 'g2'
                    ? 'And another?'
                    : draft.prompt}
              </h1>
              <textarea
                id={`gratitude-${id}`}
                className="textarea"
                autoFocus
                placeholder="Start typing…"
                value={draft.items[Number(id[1]) - 1]}
                onChange={(e) => setItem(Number(id[1]) - 1, e.target.value)}
              />
              {id === 'g1' && <p className="small muted">Big or small. A person, a moment, something you usually overlook.</p>}
              {id === 'g3' && <p className="small muted">Today's prompt. It changes every day.</p>}
            </div>
          )}

          {id === 'me' && (
            <div className="stack">
              <span className="kicker">Life · Me</span>
              <h1 className="q">How are you doing: body, mind, energy?</h1>
              <ScaleInput label="Me" value={draft.scores.me} onChange={(me) => set({ scores: { ...draft.scores, me } })} low="struggling" high="thriving" />
              <textarea id="notes-me" className="textarea" placeholder="A line or two (optional)" value={draft.notes.me} onChange={(e) => set({ notes: { ...draft.notes, me: e.target.value } })} />
            </div>
          )}

          {id === 'relationships' && (
            <div className="stack">
              <span className="kicker">Life · Relationships</span>
              <h1 className="q">Who did you connect with?</h1>
              <PeoplePicker known={people} value={draft.people} onChange={(p) => set({ people: p })} />
              <ScaleInput
                label="Relationships"
                value={draft.scores.relationships}
                onChange={(relationships) => set({ scores: { ...draft.scores, relationships } })}
                low="disconnected"
                high="close"
              />
              <textarea
                id="notes-relationships"
                className="textarea"
                placeholder="Anything to remember or follow up on?"
                value={draft.notes.relationships}
                onChange={(e) => set({ notes: { ...draft.notes, relationships: e.target.value } })}
              />
            </div>
          )}

          {id === 'work' && (
            <div className="stack">
              <span className="kicker">Life · Work</span>
              <h1 className="q">One win, one friction.</h1>
              <ScaleInput label="Work" value={draft.scores.work} onChange={(work) => set({ scores: { ...draft.scores, work } })} low="rough" high="great" />
              <textarea id="notes-work" className="textarea" placeholder={'Win: …\nFriction: …'} value={draft.notes.work} onChange={(e) => set({ notes: { ...draft.notes, work: e.target.value } })} />
            </div>
          )}

          {id === 'tomorrow' && (
            <div className="stack">
              <span className="kicker">Tomorrow</span>
              <h1 className="q">What one thing would make tomorrow good?</h1>
              <input id="notes-tomorrow" className="input" autoFocus placeholder="One line" value={draft.notes.tomorrow} onChange={(e) => set({ notes: { ...draft.notes, tomorrow: e.target.value } })} />
            </div>
          )}

          {id === 'review' && (
            <Review
              draft={draft}
              date={date}
              conflict={conflict}
              onReload={() => {
                clearDraft(draftId(date));
                setReload((r) => r + 1);
              }}
              onForce={() => save(true)}
              onEdit={(step) => set({ step })}
            />
          )}
        </div>

        <div className="flow-foot">
          {!last && (
            <button className="btn ghost" onClick={() => go(draft.step + 1)}>
              Skip
            </button>
          )}
          <button className="btn primary" disabled={saving} onClick={() => (last ? save() : go(draft.step + 1))}>
            {last ? (saving ? 'Saving…' : 'Save to GitHub') : 'Next'}
          </button>
        </div>
      </div>
    );
  }

  const { current, best } = streaks(overview.written, today);

  // ---------- done ----------
  if (view === 'done')
    return (
      <div className="narrow done">
        <div className="big">{current}</div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>day streak{current === best && current > 1 ? ' · your best yet' : ''}</div>
        <p className="muted" style={{ margin: '4px 0 18px' }}>
          Saved to your repo. {date === today ? 'See you tomorrow.' : `${formatDay(date)} is filled in.`}
        </p>
        <div className="stack" style={{ width: '100%' }}>
          <button className="btn wide" onClick={() => goTo('history')}>
            See it in History
          </button>
          <button className="btn ghost wide" onClick={() => setView('home')}>
            Back to Today
          </button>
        </div>
      </div>
    );

  // ---------- home ----------
  const monday = mondayOf(today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const hasEntry = !!(day.gratitude || day.life);
  const isToday = date === today;
  const weekId = isoWeek(today).id;
  const checkinDue = weekday(today) >= 5 && !overview.weeklies.has(weekId);

  return (
    <div className="narrow stack" style={{ gap: 16 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <span className="kicker">
          {formatDay(date)}
          {isToday ? ' · today' : ''}
        </span>
        <h1 className="title">
          {isToday ? greeting() : `Writing for ${formatDay(date)}`}
          {!hasEntry && isToday && (
            <>
              <br />
              Two minutes tonight?
            </>
          )}
        </h1>
      </div>

      <div className="week" aria-label="This week">
        {week.map((d) => (
          <button
            key={d}
            className={[overview.written.has(d) && 'written', d === today && 'today', d === date && 'sel'].filter(Boolean).join(' ')}
            disabled={d > today}
            onClick={() => setDate(d)}
            aria-label={`${formatDay(d)}${overview.written.has(d) ? ', written' : ''}`}
          >
            <i />
            <span>{'MTWTFSS'[weekday(d)]}</span>
          </button>
        ))}
      </div>

      {stored && (
        <div className="card strong stack">
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Continue where you left off</div>
            <div className="small muted">
              Unsaved {stored.mode === 'full' ? 'full check-in' : 'gratitude'} on this device · step {stored.step + 1} of {STEPS[stored.mode].length}
            </div>
          </div>
          <div className="row">
            <button
              className="btn primary"
              onClick={() => {
                setDraft(stored);
                setView('flow');
              }}
            >
              Continue
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                clearDraft(draftId(date));
                setDraftTick((t) => t + 1);
              }}
            >
              Discard draft
            </button>
          </div>
        </div>
      )}

      {hasEntry ? (
        <div className="card stack">
          <div className="spread">
            <div style={{ fontWeight: 700, fontSize: 17 }}>✓ Saved for {isToday ? 'today' : formatDay(date)}</div>
          </div>
          {day.gratitude && (
            <ol className="glist" style={{ paddingLeft: 20 }}>
              {day.gratitude.items.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ol>
          )}
          {day.life && (
            <div className="small muted">
              mood {moodLabel(day.life.mood)} · me {day.life.scores.me ?? '–'} · relationships {day.life.scores.relationships ?? '–'} · work {day.life.scores.work ?? '–'}
            </div>
          )}
          <div className="row">
            <button className="btn sm" onClick={() => start('full')}>
              {day.life ? 'Edit check-in' : 'Add the full check-in'}
            </button>
            <button className="btn sm ghost" onClick={() => start('quick')}>
              Edit gratitude
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card strong stack">
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>Full check-in</div>
              <div className="small muted">Mood · 3 gratitudes · me, relationships, work · about 4 min</div>
            </div>
            <button className="btn primary wide" onClick={() => start('full')}>
              Start
            </button>
          </div>
          <div className="card stack">
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>Just gratitude</div>
              <div className="small muted">Three lines and you're done · about 1 min · counts for your streak</div>
            </div>
            <button className="btn wide" onClick={() => start('quick')}>
              Quick entry
            </button>
          </div>
        </>
      )}

      {checkinDue && (
        <div className="card stack">
          <div>
            <div style={{ fontWeight: 700 }}>Your weekly check-in is ready</div>
            <div className="small muted">Five prompts about week {isoWeek(today).week}, with your week's entries alongside.</div>
          </div>
          <button className="btn sm" onClick={() => goTo('checkin')}>
            Open weekly check-in
          </button>
        </div>
      )}

      <div className="spread small muted">
        <span>
          {current ? `${plural(current, 'day')} in a row` : 'Write today to start a streak'}
          {best > current ? ` · best ${best}` : ''}
        </span>
        <label className="row" style={{ gap: 6 }}>
          Other day
          <input
            type="date"
            className="input"
            style={{ width: 'auto', padding: '6px 8px', fontSize: 14 }}
            max={today}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

function PeoplePicker({ known, value, onChange }: { known: string[]; value: string[]; onChange: (p: string[]) => void }) {
  const [adding, setAdding] = useState('');
  const all = Array.from(new Set([...known, ...value]));
  const toggle = (p: string) => onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);
  const add = () => {
    const name = adding.trim();
    if (name && !value.includes(name)) onChange([...value, name]);
    setAdding('');
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      {all.length > 0 && (
        <div className="chips">
          {all.map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={value.includes(p)} onClick={() => toggle(p)}>
              {p}
            </button>
          ))}
        </div>
      )}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input
          id="add-person"
          className="input"
          placeholder="Add a person"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn ghost" onClick={add} disabled={!adding.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

function Review({ draft, date, conflict, onReload, onForce, onEdit }: { draft: Draft; date: string; conflict: boolean; onReload: () => void; onForce: () => void; onEdit: (step: number) => void }) {
  const items = draft.items.map((s) => s.trim()).filter(Boolean);
  const steps = STEPS[draft.mode];
  const at = (id: StepId) => steps.indexOf(id);
  return (
    <div className="review">
      <span className="kicker">Review · {formatShort(date)}</span>
      <h1 className="q" style={{ fontSize: 22, marginBottom: 6 }}>
        Looks good?
      </h1>
      {conflict && (
        <div className="notice danger stack" style={{ gap: 8 }}>
          <span>This day was changed on GitHub or another device after you opened it here.</span>
          <div className="row">
            <button className="btn sm" onClick={onReload}>
              Load the newer version
            </button>
            <button className="btn sm danger" onClick={onForce}>
              Save mine anyway
            </button>
          </div>
        </div>
      )}
      <div className="card">
        <div className="spread">
          <span className="label">Gratitude</span>
          <button className="link" onClick={() => onEdit(at('g1'))}>
            Edit
          </button>
        </div>
        {items.length ? (
          <ol>
            {items.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ol>
        ) : (
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            Nothing written. Gratitude won't be saved.
          </p>
        )}
      </div>
      {draft.mode === 'full' && (
        <div className="card">
          <div className="spread">
            <span className="label">Life</span>
            <button className="link" onClick={() => onEdit(at('mood'))}>
              Edit
            </button>
          </div>
          <div className="small" style={{ marginTop: 4 }}>
            mood {moodLabel(draft.mood)} · energy {draft.energy ?? '–'} · me {draft.scores.me ?? '–'} · relationships {draft.scores.relationships ?? '–'} · work {draft.scores.work ?? '–'}
          </div>
          {draft.people.length > 0 && <div className="small muted">with {draft.people.join(', ')}</div>}
          {draft.notes.tomorrow && <div className="small muted">Tomorrow: {draft.notes.tomorrow}</div>}
        </div>
      )}
      <span className="kicker" style={{ marginTop: 6 }}>
        Will save to your repo
      </span>
      <div className="files">
        {items.length > 0 && <div>{gratitudePath(date)}</div>}
        {draft.mode === 'full' && <div>{lifePath(date)}</div>}
        <div>.journal/index.json</div>
      </div>
    </div>
  );
}
