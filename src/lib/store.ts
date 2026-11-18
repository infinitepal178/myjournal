// Device-local storage: connection settings and unsaved drafts.
// Every access is wrapped because storage can be unavailable (private
// browsing, blocked site data); the app keeps working without it.

export interface Settings {
  owner: string;
  repo: string;
  token: string;
  branch: string;
}

const SETTINGS_KEY = 'myjournal.settings';
const DRAFT_PREFIX = 'myjournal.draft.';

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function loadSettings(): Settings | null {
  try {
    const s = JSON.parse(get(SETTINGS_KEY) ?? 'null');
    return s && s.owner && s.repo && s.token ? (s as Settings) : null;
  } catch {
    return null;
  }
}

export const saveSettings = (s: Settings) => set(SETTINGS_KEY, JSON.stringify(s));

export function clearDevice(): void {
  set(SETTINGS_KEY, null);
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(DRAFT_PREFIX)) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function loadDraft<T>(id: string): T | null {
  try {
    return JSON.parse(get(DRAFT_PREFIX + id) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

export const saveDraft = (id: string, value: unknown) => set(DRAFT_PREFIX + id, JSON.stringify(value));
export const clearDraft = (id: string) => set(DRAFT_PREFIX + id, null);
