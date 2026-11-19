// Shared follow-up controls: answering ones that are due, and adding new ones.

import { useState } from 'react';
import { formatDay } from '../lib/dates';
import {
  WHEN_LABEL,
  calendarLink,
  describeDue,
  detectPeople,
  dueDate,
  newFollowUp,
  type FollowUp,
  type When,
} from '../lib/followups';

export type Choice = 'done' | 'partly' | 'not-done' | 'later' | 'dropped';

export interface Answer {
  choice: Choice;
  outcome: string;
  later?: When;
}

const CHOICES: { id: Choice; label: string }[] = [
  { id: 'done', label: 'Done' },
  { id: 'partly', label: 'Partly' },
  { id: 'not-done', label: "Didn't" },
  { id: 'later', label: 'Not yet' },
  { id: 'dropped', label: 'Drop it' },
];

/** Turn answers into updated follow-ups ready to save. */
export function applyAnswers(items: FollowUp[], answers: Record<string, Answer>, today: string): FollowUp[] {
  const out: FollowUp[] = [];
  for (const item of items) {
    const a = answers[item.id];
    if (!a) continue;
    if (a.choice === 'later') {
      out.push({ ...item, due: dueDate(today, a.later ?? 'tomorrow'), snoozed: (item.snoozed ?? 0) + 1 });
    } else {
      out.push({ ...item, status: a.choice, outcome: a.outcome.trim() || undefined, closed: today });
    }
  }
  return out;
}

export function FollowUpReview({
  items,
  answers,
  onChange,
  today,
}: {
  items: FollowUp[];
  answers: Record<string, Answer>;
  onChange: (a: Record<string, Answer>) => void;
  today: string;
}) {
  const set = (id: string, a: Answer | null) => {
    const next = { ...answers };
    if (a) next[id] = a;
    else delete next[id];
    onChange(next);
  };
  return (
    <div className="stack">
      {items.map((f) => {
        const a = answers[f.id];
        return (
          <div className="card followup" key={f.id}>
            <div className="fu-text">{f.text}</div>
            <div className="tiny muted">
              You said this on {formatDay(f.created)}
              {f.people.length ? ` · ${f.people.join(', ')}` : ''} · {f.due < today ? `was due ${describeDue(f.due, today)}` : `due ${describeDue(f.due, today)}`}
            </div>
            <div className="chips" role="group" aria-label={`How did "${f.text}" go?`}>
              {CHOICES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="chip"
                  aria-pressed={a?.choice === c.id}
                  onClick={() => set(f.id, a?.choice === c.id ? null : { choice: c.id, outcome: a?.outcome ?? '', later: c.id === 'later' ? (a?.later ?? 'tomorrow') : undefined })}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {a && (a.choice === 'done' || a.choice === 'partly' || a.choice === 'not-done') && (
              <textarea
                className="textarea"
                style={{ minHeight: 70 }}
                aria-label={`What happened with "${f.text}"?`}
                placeholder={a.choice === 'not-done' ? 'What got in the way? (optional)' : 'What did you do? (optional)'}
                value={a.outcome}
                onChange={(e) => set(f.id, { ...a, outcome: e.target.value })}
              />
            )}
            {a?.choice === 'later' && (
              <div className="chips" role="group" aria-label="Ask me again">
                {(['tomorrow', 'this-week', 'next-week'] as When[]).map((w) => (
                  <button key={w} type="button" className="chip" aria-pressed={a.later === w} onClick={() => set(f.id, { ...a, later: w })}>
                    Ask {WHEN_LABEL[w].toLowerCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** "+ Remind me to follow up" with a text box and a when-picker. */
export function AddFollowUp({
  from,
  known,
  source,
  added,
  onAdd,
  onRemove,
  label = 'Remind me to follow up on something',
  defaultWhen = 'next-week',
}: {
  from: string;
  known: string[];
  source?: string;
  added: FollowUp[];
  onAdd: (f: FollowUp) => void;
  onRemove: (id: string) => void;
  label?: string;
  defaultWhen?: When;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [when, setWhen] = useState<When>(defaultWhen);
  const add = () => {
    if (!text.trim()) return;
    onAdd(newFollowUp(text, from, dueDate(from, when), detectPeople(text, known), source));
    setText('');
    setOpen(false);
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      {added.map((f) => (
        <div key={f.id} className="notice row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <span className="small">
            ↪ {f.text} <span className="muted">· ask {describeDue(f.due, from)}</span>
          </span>
          <button type="button" className="link" aria-label={`Remove reminder "${f.text}"`} onClick={() => onRemove(f.id)}>
            Remove
          </button>
        </div>
      ))}
      {!open ? (
        <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
          + {label}
        </button>
      ) : (
        <div className="card stack" style={{ gap: 10 }}>
          <input
            className="input"
            id="followup-text"
            autoFocus
            placeholder="e.g. Call Priya and plan the trip"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <div className="chips" role="group" aria-label="When should I ask?">
            {(Object.keys(WHEN_LABEL) as When[]).map((w) => (
              <button key={w} type="button" className="chip" aria-pressed={when === w} onClick={() => setWhen(w)}>
                {WHEN_LABEL[w]}
              </button>
            ))}
          </div>
          <div className="row">
            <button type="button" className="btn sm primary" onClick={add} disabled={!text.trim()}>
              Add reminder
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CalendarLink({ f }: { f: FollowUp }) {
  return (
    <a className="tiny muted" href={calendarLink(f)} target="_blank" rel="noreferrer noopener">
      Add to Google Calendar ↗
    </a>
  );
}
