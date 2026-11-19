// All follow-ups: due now, coming up, and what happened with past ones.

import { useMemo, useState } from 'react';
import { AddFollowUp, CalendarLink, FollowUpReview, applyAnswers, type Answer } from '../components/FollowUps';
import type { ToastState } from '../components/ui';
import { dateKey, formatDay } from '../lib/dates';
import { STATUS_LABEL, closedFollowUps, describeDue, dueFollowUps, upcomingFollowUps, type FollowUp, type FollowUpFile } from '../lib/followups';
import { explainError } from '../lib/github';
import type { Journal, Overview } from '../lib/journal';
import { knownPeople } from '../lib/journalIndex';

export function FollowUps({ journal, overview, onSaved, toast }: { journal: Journal; overview: Overview; onSaved: (f: FollowUpFile) => void; toast: (t: ToastState) => void }) {
  const today = dateKey();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [added, setAdded] = useState<FollowUp[]>([]);
  const [saving, setSaving] = useState(false);
  const people = useMemo(() => knownPeople(overview.index, overview.config.people), [overview]);
  const due = dueFollowUps(overview.followUps, today);
  const upcoming = upcomingFollowUps(overview.followUps, today);
  const closed = closedFollowUps(overview.followUps).slice(0, 50);
  const pending = Object.keys(answers).length + added.length;

  async function save() {
    setSaving(true);
    try {
      const changes = [...applyAnswers([...due, ...upcoming], answers, today), ...added];
      const file = await journal.saveFollowUps(changes);
      onSaved(file);
      setAnswers({});
      setAdded([]);
      toast({ text: `Saved ${changes.length === 1 ? 'follow-up' : `${changes.length} follow-ups`}` });
    } catch (e) {
      toast({ text: explainError(e), error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="narrow stack" style={{ gap: 16 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <a href="#history" className="small muted" style={{ textDecoration: 'none' }}>
          ‹ History
        </a>
        <h1 className="title">Follow-ups</h1>
        <p className="small muted" style={{ margin: 0 }}>
          Things you said you'd do. Each one comes back on its day so you can note how it went.
        </p>
      </div>

      <section className="stack">
        <h2 className="label">Due now</h2>
        {due.length ? (
          <FollowUpReview items={due} answers={answers} onChange={setAnswers} today={today} />
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            Nothing due. You're all caught up.
          </p>
        )}
      </section>

      <section className="stack">
        <h2 className="label">Coming up</h2>
        {upcoming.length === 0 && (
          <p className="small muted" style={{ margin: 0 }}>
            Nothing scheduled.
          </p>
        )}
        {upcoming.map((f) => (
          <div key={f.id} className="card stack" style={{ gap: 4 }}>
            <div className="fu-text">{f.text}</div>
            <div className="tiny muted">
              Ask {describeDue(f.due, today)}
              {f.people.length ? ` · ${f.people.join(', ')}` : ''}
            </div>
            <div className="row">
              <CalendarLink f={f} />
              {!answers[f.id] && (
                <button type="button" className="link tiny" onClick={() => setAnswers({ ...answers, [f.id]: { choice: 'done', outcome: '' } })}>
                  Answer early
                </button>
              )}
            </div>
            {answers[f.id] && <FollowUpReview items={[f]} answers={answers} onChange={setAnswers} today={today} />}
          </div>
        ))}
        <AddFollowUp
          from={today}
          known={people}
          added={added}
          onAdd={(f) => setAdded([...added, f])}
          onRemove={(id) => setAdded(added.filter((x) => x.id !== id))}
          label="Add a follow-up"
        />
      </section>

      {pending > 0 && (
        <div className="flow-foot" style={{ paddingBottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px) + 12px)' }}>
          <button className="btn primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : `Save ${pending === 1 ? 'change' : `${pending} changes`}`}
          </button>
        </div>
      )}

      <section className="stack">
        <h2 className="label">What happened</h2>
        {closed.length === 0 && (
          <p className="small muted" style={{ margin: 0 }}>
            Closed follow-ups will show here with what you wrote.
          </p>
        )}
        {closed.map((f) => (
          <div key={f.id} className="card" style={{ padding: 14 }}>
            <div className="spread" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <div className="fu-text">{f.text}</div>
              <span className={`status status-${f.status}`}>{STATUS_LABEL[f.status]}</span>
            </div>
            {f.outcome && <p className="small" style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{f.outcome}</p>}
            <div className="tiny muted" style={{ marginTop: 4 }}>
              Said {formatDay(f.created)}
              {f.closed ? ` · closed ${formatDay(f.closed)}` : ''}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
