import { useState } from 'react';
import { ConfirmButton, ExternalLink, type ToastState } from '../components/ui';
import { plural } from '../lib/dates';
import { CONFIG_PATH } from '../lib/entries';
import { explainError } from '../lib/github';
import type { Journal } from '../lib/journal';
import type { JournalIndex } from '../lib/journalIndex';
import type { Settings as SettingsT } from '../lib/store';

interface Props {
  settings: SettingsT;
  journal: Journal;
  entryCount: number;
  onRebuilt: (index: JournalIndex) => void;
  onDisconnect: () => void;
  toast: (t: ToastState) => void;
}

export function Settings({ settings, journal, entryCount, onRebuilt, onDisconnect, toast }: Props) {
  const [busy, setBusy] = useState(false);

  async function rebuild() {
    setBusy(true);
    try {
      const index = await journal.rebuildIndex();
      onRebuilt(index);
      toast({ text: `Index rebuilt from ${plural(Object.keys(index.days).length, 'day')} of entries.` });
    } catch (e) {
      toast({ text: explainError(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow stack" style={{ gap: 16 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <span className="kicker">Settings</span>
        <h1 className="title">Your journal repo</h1>
      </div>

      <div className="card stack">
        <div>
          <span className="label">Connected to</span>
          <div style={{ fontWeight: 650, wordBreak: 'break-all' }}>
            {settings.owner}/{settings.repo}
          </div>
          <div className="small muted">
            branch {settings.branch} · {plural(entryCount, 'day')} written
          </div>
        </div>
        <div className="row">
          <ExternalLink href={journal.repoUrl}>Open repo on GitHub ↗</ExternalLink>
          <ExternalLink href={journal.fileUrl(CONFIG_PATH)}>Edit prompts ↗</ExternalLink>
        </div>
      </div>

      <div className="card stack">
        <div>
          <h2>Rebuild index</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Streaks, search and the weekly summary read <span className="path">.journal/index.json</span>. If you edit or add entries directly on GitHub, rebuild it so they show up here.
          </p>
        </div>
        <button className="btn" onClick={rebuild} disabled={busy}>
          {busy ? 'Rebuilding…' : 'Rebuild from entries'}
        </button>
      </div>

      <div className="card stack">
        <div>
          <h2>This device</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Your token and any unsaved drafts are stored only in this browser. Disconnecting removes them here. Your entries on GitHub are not touched.
          </p>
        </div>
        <ConfirmButton label="Disconnect this device" confirm="Yes, disconnect" onConfirm={onDisconnect} />
      </div>

      <p className="tiny muted" style={{ textAlign: 'center' }}>
        myjournal · entries are Markdown files you own
      </p>
    </div>
  );
}
