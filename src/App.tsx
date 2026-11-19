import { useCallback, useEffect, useState } from 'react';
import { Icon, Loading, Toast, type ToastState } from './components/ui';
import { dateKey } from './lib/dates';
import { gratitudePath, lifePath, weeklyPath } from './lib/entries';
import { dueFollowUps, type FollowUpFile } from './lib/followups';
import { GitHub, GitHubError, explainError } from './lib/github';
import { Journal, overviewFrom, type DayData, type Overview } from './lib/journal';
import type { JournalIndex } from './lib/journalIndex';
import { clearDevice, loadSettings, type Settings as SettingsT } from './lib/store';
import { Checkin } from './screens/Checkin';
import { Connect } from './screens/Connect';
import { FollowUps } from './screens/FollowUps';
import { History } from './screens/History';
import { Settings } from './screens/Settings';
import { Today } from './screens/Today';

export type Tab = 'today' | 'history' | 'checkin' | 'settings' | 'followups';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'history', label: 'History' },
  { id: 'checkin', label: 'Check-in' },
  { id: 'settings', label: 'Settings' },
];

const tabFromHash = (): Tab => {
  const h = location.hash.slice(1);
  return h === 'followups' || TABS.some((t) => t.id === h) ? (h as Tab) : 'today';
};

const makeJournal = (s: SettingsT) => new Journal(new GitHub(s.owner, s.repo, s.token), s.branch, `https://github.com/${s.owner}/${s.repo}`);

export function App() {
  const [settings, setSettings] = useState<SettingsT | null>(loadSettings);
  const [journal, setJournal] = useState<Journal | null>(() => (settings ? makeJournal(settings) : null));
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<{ text: string; auth: boolean } | null>(null);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [date, setDate] = useState(dateKey);
  const [focus, setFocus] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [reload, setReload] = useState(0);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const on = () => setTab(tabFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    if (!journal) return;
    let live = true;
    setError(null);
    journal
      .overview()
      .then((o) => live && setOverview(o))
      .catch((e) => live && setError({ text: explainError(e), auth: e instanceof GitHubError && (e.status === 401 || e.status === 404) }));
    return () => {
      live = false;
    };
  }, [journal, reload]);

  const goTo = (t: Tab) => {
    if (location.hash.slice(1) !== t) location.hash = t;
    setTab(t);
    window.scrollTo(0, 0);
  };

  const disconnect = () => {
    clearDevice();
    setSettings(null);
    setJournal(null);
    setOverview(null);
    goTo('today');
  };

  if (!settings || !journal)
    return (
      <Connect
        onConnected={(s, j) => {
          setSettings(s);
          setJournal(j);
          goTo('today');
        }}
      />
    );

  const onDaySaved = (day: DayData, index: JournalIndex, followUps: FollowUpFile | null) =>
    setOverview((o) => {
      if (!o) return o;
      const files = [...o.files];
      if (day.gratitude) files.push(gratitudePath(day.date));
      if (day.life) files.push(lifePath(day.date));
      return overviewFrom(files, index, o.config, followUps ?? o.followUps);
    });
  const onFollowUps = (f: FollowUpFile) => setOverview((o) => o && { ...o, followUps: f });
  const dueCount = overview ? dueFollowUps(overview.followUps, dateKey()).length : 0;

  const nav = (
    <nav className="tabbar" aria-label="Sections" hidden={focus}>
      <span className="brand">myjournal</span>
      {TABS.map((t) => (
        <a
          key={t.id}
          href={`#${t.id}`}
          aria-current={tab === t.id || (tab === 'followups' && t.id === 'history') ? 'page' : undefined}
          onClick={() => window.scrollTo(0, 0)}
        >
          <span className="tab-icon">
            <Icon name={t.id as 'today'} />
            {t.id === 'today' && dueCount > 0 && <i className="badge" aria-label={`${dueCount} follow-ups due`} />}
          </span>
          {t.label}
        </a>
      ))}
    </nav>
  );

  let body;
  if (error)
    body = (
      <div className="narrow stack">
        <div className="notice danger">{error.text}</div>
        <button className="btn" onClick={() => setReload((r) => r + 1)}>
          Try again
        </button>
        {error.auth && (
          <button className="btn ghost" onClick={disconnect}>
            Connect with a different repo or token
          </button>
        )}
      </div>
    );
  else if (!overview) body = <Loading>Opening your journal…</Loading>;
  else if (tab === 'today')
    body = (
      <Today
        journal={journal}
        overview={overview}
        date={date}
        setDate={setDate}
        onSaved={onDaySaved}
        onFollowUps={onFollowUps}
        toast={setToast}
        goTo={goTo}
        onFocusMode={setFocus}
      />
    );
  else if (tab === 'history')
    body = (
      <History
        journal={journal}
        overview={overview}
        onEdit={(d) => {
          setDate(d);
          goTo('today');
        }}
      />
    );
  else if (tab === 'followups') body = <FollowUps journal={journal} overview={overview} onSaved={onFollowUps} toast={setToast} />;
  else if (tab === 'checkin')
    body = (
      <Checkin
        journal={journal}
        overview={overview}
        toast={setToast}
        onSaved={(w, f) => setOverview((o) => o && overviewFrom(w ? [...o.files, weeklyPath(w)] : [...o.files], o.index, o.config, f ?? o.followUps))}
      />
    );
  else
    body = (
      <Settings
        settings={settings}
        journal={journal}
        entryCount={overview.written.size}
        onRebuilt={(index) => setOverview((o) => o && overviewFrom([...o.files], index, o.config, o.followUps))}
        onDisconnect={disconnect}
        toast={setToast}
      />
    );

  return (
    <>
      {nav}
      <main className="shell" style={focus ? { paddingBottom: 0 } : undefined}>
        {body}
      </main>
      <Toast toast={toast} onDone={clearToast} />
    </>
  );
}
