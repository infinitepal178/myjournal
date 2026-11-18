import { useEffect, useState, type ReactNode } from 'react';
import type { Score } from '../lib/entries';

export function ScaleInput({ value, onChange, label, low, high }: { value: Score; onChange: (v: Score) => void; label: string; low?: string; high?: string }) {
  return (
    <div>
      <div className="scale" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-pressed={value === n} onClick={() => onChange(value === n ? null : n)}>
            {n}
          </button>
        ))}
      </div>
      {low && high && (
        <div className="scale-ends">
          <span>{low}</span>
          <span>{high}</span>
        </div>
      )}
    </div>
  );
}

const MOODS = ['rough', 'meh', 'okay', 'good', 'great'];

export function MoodInput({ value, onChange }: { value: Score; onChange: (v: Score) => void }) {
  return (
    <div className="moods" role="group" aria-label="Mood">
      {MOODS.map((m, i) => (
        <button key={m} type="button" className="mood" aria-pressed={value === i + 1} onClick={() => onChange(value === i + 1 ? null : i + 1)}>
          <i />
          {m}
        </button>
      ))}
    </div>
  );
}

export const moodLabel = (v: Score) => (v ? MOODS[v - 1] : '–');

export type ToastState = { text: string; error?: boolean } | null;

export function Toast({ toast, onDone }: { toast: ToastState; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, toast.error ? 7000 : 3500);
    return () => clearTimeout(t);
  }, [toast, onDone]);
  if (!toast) return null;
  return (
    <div className={`toast${toast.error ? ' error' : ''}`} role="status" onClick={onDone}>
      {toast.text}
    </div>
  );
}

export function Loading({ children = 'Loading…' }: { children?: ReactNode }) {
  return <div className="center muted">{children}</div>;
}

/** Inline "are you sure" without browser dialogs. */
export function ConfirmButton({ label, confirm, onConfirm, className = 'btn ghost' }: { label: string; confirm: string; onConfirm: () => void; className?: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className={className} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  return (
    <div className="row">
      <button type="button" className="btn danger" onClick={onConfirm}>
        {confirm}
      </button>
      <button type="button" className="btn ghost" onClick={() => setAsking(false)}>
        Cancel
      </button>
    </div>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="small muted">
      {children}
    </a>
  );
}

const ICONS: Record<string, ReactNode> = {
  today: <path d="M4 20h4L19 9l-4-4L4 16v4Zm10-14 4 4" />,
  history: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  checkin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.8-5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    </>
  ),
};

export function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
