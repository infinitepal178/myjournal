import { useState, type FormEvent } from 'react';
import { GitHub, explainError } from '../lib/github';
import { Journal } from '../lib/journal';
import { saveSettings, type Settings } from '../lib/store';

/** Accepts "owner/repo" or a github.com URL. */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const s = input.trim().replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
  const m = /^([\w.-]+)\/([\w.-]+)$/.exec(s);
  return m ? { owner: m[1], repo: m[2] } : null;
}

type Step = { text: string; state: 'doing' | 'ok' | 'fail' };

export function Connect({ onConnected }: { onConnected: (s: Settings, j: Journal) => void }) {
  const [repoText, setRepoText] = useState('');
  const [token, setToken] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [publicRepo, setPublicRepo] = useState(false);
  const [acceptPublic, setAcceptPublic] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseRepo(repoText);
    if (!parsed) {
      setSteps([{ text: 'Enter the repo as your-username/repo-name.', state: 'fail' }]);
      return;
    }
    const tok = token.trim();
    if (!tok) {
      setSteps([{ text: 'Paste your GitHub token.', state: 'fail' }]);
      return;
    }
    setBusy(true);
    const log: Step[] = [];
    // `log` holds finished steps; `push` shows the step in progress after them.
    const push = (s: Step) => setSteps([...log, s]);
    const done = (text: string) => {
      log.push({ text, state: 'ok' });
      setSteps([...log]);
    };
    try {
      push({ text: 'Checking the repo…', state: 'doing' });
      const gh = new GitHub(parsed.owner, parsed.repo, tok);
      const info = await gh.getRepo();
      if (!info.private && !acceptPublic) {
        setPublicRepo(true);
        log.push({ text: 'This repo is public: anyone could read your entries.', state: 'fail' });
        setSteps([...log]);
        return;
      }
      done(info.private ? 'Found it. The repo is private.' : 'Found it. The repo is public (you accepted this).');
      push({ text: 'Setting up journal files…', state: 'doing' });
      const journal = new Journal(gh, info.defaultBranch, info.htmlUrl);
      await journal.bootstrap(info);
      done('Journal files are ready.');
      const settings: Settings = { owner: parsed.owner, repo: parsed.repo, token: tok, branch: info.defaultBranch };
      saveSettings(settings);
      onConnected(settings, journal);
    } catch (err) {
      log.push({ text: explainError(err), state: 'fail' });
      setSteps([...log]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <div className="narrow stack" style={{ gap: 18 }}>
        <div className="page-head">
          <span className="kicker">myjournal · first time on this device</span>
          <h1 className="title">Connect your journal</h1>
          <p className="muted" style={{ margin: 0 }}>
            Your entries are saved as Markdown files in a private GitHub repo that you own. The token stays on this device.
          </p>
        </div>

        <form className="card strong stack" onSubmit={submit}>
          <label className="field">
            <span className="label">Journal repo</span>
            <input
              id="repo"
              className="input"
              placeholder="your-username/myjournal-data"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={repoText}
              onChange={(e) => setRepoText(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">GitHub token</span>
            <input
              id="token"
              className="input"
              type="password"
              placeholder="github_pat_…"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>

          {publicRepo && (
            <label className="notice danger row" style={{ alignItems: 'flex-start' }}>
              <input type="checkbox" checked={acceptPublic} onChange={(e) => setAcceptPublic(e.target.checked)} style={{ marginTop: 4 }} />
              <span>Use it anyway. I understand anyone can read entries in a public repo. (Better: make the repo private in its GitHub settings.)</span>
            </label>
          )}

          {steps.length > 0 && (
            <ul className="stack small" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 6 }} aria-live="polite">
              {steps.map((s, i) => (
                <li key={i} style={{ color: s.state === 'fail' ? 'var(--danger)' : s.state === 'ok' ? 'var(--checkin)' : 'var(--mute)' }}>
                  {s.state === 'ok' ? '✓ ' : s.state === 'fail' ? '✕ ' : '… '}
                  {s.text}
                </li>
              ))}
            </ul>
          )}

          <button className="btn primary wide" disabled={busy}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </form>

        <details className="card">
          <summary>First time? Set up the repo and token (5 minutes)</summary>
          <ol className="small">
            <li>
              Create a <b>private</b> repo called <span className="path">myjournal-data</span>:{' '}
              <a href="https://github.com/new" target="_blank" rel="noreferrer noopener">github.com/new</a>. An empty repo is fine.
            </li>
            <li>
              Create a fine-grained token:{' '}
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer noopener">
                github.com/settings/personal-access-tokens/new
              </a>
              <ul>
                <li>Repository access: <b>Only select repositories</b> → myjournal-data</li>
                <li>Permissions → Repository → <b>Contents: Read and write</b></li>
                <li>Expiration: up to you (a year is a sensible choice)</li>
              </ul>
            </li>
            <li>Copy the token, paste it above, and tap Connect.</li>
          </ol>
        </details>
      </div>
    </div>
  );
}
