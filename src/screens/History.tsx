// History: Direction A's month calendar beside the entry for the chosen day.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, moodLabel } from '../components/ui';
import { dateKey, formatDay, formatMonth, formatShort, isoWeek, monthGrid, weekday } from '../lib/dates';
import { gratitudePath, lifePath } from '../lib/entries';
import { explainError } from '../lib/github';
import type { DayData, Journal, Overview } from '../lib/journal';
import { searchIndex, streaks } from '../lib/journalIndex';

type View = 'gratitude' | 'life' | 'raw';

export function History({ journal, overview, onEdit }: { journal: Journal; overview: Overview; onEdit: (date: string) => void }) {
  const today = dateKey();
  const latest = [...overview.written].sort().pop();
  const [sel, setSel] = useState(overview.written.has(today) || !latest ? today : latest);
  const [ym, setYm] = useState<[number, number]>([Number(sel.slice(0, 4)), Number(sel.slice(5, 7))]);
  const [view, setView] = useState<View>('gratitude');
  const [day, setDay] = useState<DayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const cache = useRef(new Map<string, DayData>());

  useEffect(() => cache.current.clear(), [overview]);

  useEffect(() => {
    let live = true;
    setError(null);
    const hit = cache.current.get(sel);
    const show = (d: DayData) => {
      setDay(d);
      setView(d.gratitude || !d.life ? 'gratitude' : 'life');
    };
    if (hit) show(hit);
    else {
      setDay(null);
      if (!overview.written.has(sel)) {
        show({ date: sel, gratitude: null, life: null, raw: { gratitude: null, life: null } });
        return;
      }
      journal
        .loadDay(sel)
        .then((d) => {
          cache.current.set(sel, d);
          if (live) show(d);
        })
        .catch((e) => live && setError(explainError(e)));
    }
    return () => {
      live = false;
    };
  }, [sel, journal, overview]);

  const results = useMemo(() => searchIndex(overview.index, query).slice(0, 40), [overview.index, query]);
  const { current, best } = streaks(overview.written, today);
  const [y, m] = ym;
  const monthPrefix = `${y}-${String(m).padStart(2, '0')}`;
  const inMonth = [...overview.written].filter((d) => d.startsWith(monthPrefix)).length;
  const thisMonth = today.slice(0, 7);
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setYm([d.getUTCFullYear(), d.getUTCMonth() + 1]);
  };

  const pick = (d: string) => {
    setSel(d);
    setYm([Number(d.slice(0, 4)), Number(d.slice(5, 7))]);
    setQuery('');
  };

  return (
    <div>
      <div className="page-head">
        <span className="kicker">History</span>
        <h1 className="title">Every day you've written</h1>
      </div>

      <div className="stats">
        <div className="stat">
          <strong>{current}</strong>
          <span>day streak</span>
        </div>
        <div className="stat">
          <strong>{best}</strong>
          <span>best streak</span>
        </div>
        <div className="stat">
          <strong>{inMonth}</strong>
          <span>{inMonth === 1 ? 'day' : 'days'} in {formatMonth(y, m).split(' ')[0].slice(0, 3)}</span>
        </div>
      </div>

      <div className="two-col">
        <div className="card stack">
          <div className="spread" style={{ flexWrap: 'nowrap' }}>
            <button className="btn sm ghost" aria-label="Previous month" onClick={() => shift(-1)}>
              ‹
            </button>
            <b>{formatMonth(y, m)}</b>
            <button className="btn sm ghost" aria-label="Next month" onClick={() => shift(1)} disabled={monthPrefix >= thisMonth}>
              ›
            </button>
          </div>
          <div className="cal" role="grid" aria-label={formatMonth(y, m)}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="h">
                {d}
              </div>
            ))}
            {monthGrid(y, m).map((d, i) =>
              d === null ? (
                <div key={`b${i}`} />
              ) : (
                <button
                  key={d}
                  className={d === today ? 'today' : undefined}
                  aria-pressed={d === sel}
                  disabled={d > today}
                  onClick={() => setSel(d)}
                  aria-label={`${formatDay(d)}${overview.written.has(d) ? ', has entries' : ''}`}
                >
                  {Number(d.slice(8))}
                  <span className="dots">
                    {overview.gratitudeDays.has(d) && <i className="dot-g" />}
                    {overview.lifeDays.has(d) && <i className="dot-l" />}
                    {weekday(d) === 6 && overview.weeklies.has(isoWeek(d).id) && <i className="dot-c" />}
                  </span>
                </button>
              ),
            )}
          </div>
          <div className="legend">
            <span>
              <i className="dot-g" />
              gratitude
            </span>
            <span>
              <i className="dot-l" />
              life check-in
            </span>
            <span>
              <i className="dot-c" />
              weekly check-in
            </span>
          </div>
          <label className="field">
            <span className="label">Search</span>
            <input id="search" className="input" type="search" placeholder="Gratitude, people or #tags" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {query.trim() && (
            <ul className="results" aria-label="Search results">
              {results.length === 0 && <li className="small muted">No matches. Search looks at gratitude lines, people and tags.</li>}
              {results.map((r) => (
                <li key={r.date}>
                  <button onClick={() => pick(r.date)}>
                    <span className="mono muted">{formatDay(r.date)}</span>
                    <br />
                    {r.match}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card stack entry" aria-live="polite">
          <div className="spread">
            <b>{formatShort(sel)}</b>
            {day && (day.gratitude || day.life) && (
              <button className="btn sm" onClick={() => onEdit(sel)}>
                Edit this day
              </button>
            )}
          </div>
          {error && <div className="notice danger">{error}</div>}
          {!day && !error && <p className="muted small">Loading…</p>}
          {day && !day.gratitude && !day.life && (
            <div className="stack">
              <p className="muted" style={{ margin: 0 }}>
                Nothing written {sel === today ? 'yet today' : 'on this day'}.
              </p>
              <button className="btn" onClick={() => onEdit(sel)}>
                Write an entry for {sel === today ? 'today' : formatDay(sel)}
              </button>
            </div>
          )}
          {day && (day.gratitude || day.life) && <DayView day={day} view={view} setView={setView} journal={journal} />}
        </div>
      </div>
    </div>
  );
}

function DayView({ day, view, setView, journal }: { day: DayData; view: View; setView: (v: View) => void; journal: Journal }) {
  const path = view === 'life' ? lifePath(day.date) : gratitudePath(day.date);
  const l = day.life;
  return (
    <>
      <div className="tabs" role="tablist">
        {(['gratitude', 'life', 'raw'] as View[]).map((v) => (
          <button key={v} role="tab" className="chip" aria-pressed={view === v} aria-selected={view === v} onClick={() => setView(v)}>
            {v === 'gratitude' ? 'Gratitude' : v === 'life' ? 'Life' : 'Files'}
          </button>
        ))}
      </div>

      {view === 'gratitude' &&
        (day.gratitude ? (
          <div>
            <ol>
              {day.gratitude.items.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ol>
            {day.gratitude.prompt && <p className="small muted">Prompt: {day.gratitude.prompt}</p>}
          </div>
        ) : (
          <p className="muted small">No gratitude entry this day.</p>
        ))}

      {view === 'life' &&
        (l ? (
          <div>
            <div className="scores">
              <div className="score">
                <b>{moodLabel(l.mood)}</b>
                <span>mood</span>
              </div>
              <div className="score">
                <b>{l.energy ?? '–'}</b>
                <span>energy</span>
              </div>
              <div className="score">
                <b>{l.scores.me ?? '–'}</b>
                <span>me</span>
              </div>
              <div className="score">
                <b>{l.scores.relationships ?? '–'}</b>
                <span>relationships</span>
              </div>
              <div className="score">
                <b>{l.scores.work ?? '–'}</b>
                <span>work</span>
              </div>
            </div>
            {l.people.length > 0 && (
              <div className="chips" style={{ marginTop: 12 }}>
                {l.people.map((p) => (
                  <span key={p} className="chip static">
                    {p}
                  </span>
                ))}
              </div>
            )}
            {(
              [
                ['Me', l.notes.me],
                ['Relationships', l.notes.relationships],
                ['Work', l.notes.work],
                ['Tomorrow', l.notes.tomorrow],
              ] as const
            )
              .filter(([, t]) => t)
              .map(([h, t]) => (
                <div key={h}>
                  <h3>{h}</h3>
                  <p>{t}</p>
                </div>
              ))}
          </div>
        ) : (
          <p className="muted small">No life check-in this day.</p>
        ))}

      {view === 'raw' && (
        <div className="stack">
          {day.raw.gratitude !== null && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="path">{gratitudePath(day.date)}</span>
              <pre className="raw">{day.raw.gratitude}</pre>
            </div>
          )}
          {day.raw.life !== null && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="path">{lifePath(day.date)}</span>
              <pre className="raw">{day.raw.life}</pre>
            </div>
          )}
        </div>
      )}

      {view !== 'raw' && (view === 'life' ? day.life : day.gratitude) && (
        <div className="row">
          <ExternalLink href={journal.fileUrl(path)}>Open on GitHub ↗</ExternalLink>
          <ExternalLink href={journal.historyUrl(path)}>Earlier versions ↗</ExternalLink>
        </div>
      )}
    </>
  );
}
