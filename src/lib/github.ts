// Minimal GitHub REST client for one repo. Uses the Git Data API so a save
// (e.g. gratitude.md + life.md + index.json) lands as a single commit.

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RepoInfo {
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  empty: boolean;
}

export interface FileChange {
  path: string;
  content: string;
}

type Fetch = typeof fetch;

const API = 'https://api.github.com';

/** Turn an API failure into a sentence a person can act on. */
export function explainError(e: unknown): string {
  if (e instanceof GitHubError) {
    if (e.status === 401) return 'GitHub rejected the token. It may have expired or been revoked. Create a new one and reconnect in Settings.';
    if (e.status === 403)
      return /rate limit/i.test(e.message)
        ? 'GitHub rate limit reached. Wait a few minutes and try again.'
        : 'The token can read the repo but not write to it. Give it "Contents: Read and write" access.';
    if (e.status === 404) return "Repo not found, or the token doesn't have access to it.";
    if (e.status === 0) return "Couldn't reach GitHub. Check your connection. Your draft is kept on this device.";
    return `GitHub error ${e.status}: ${e.message}`;
  }
  return e instanceof Error ? e.message : String(e);
}

export class GitHub {
  private fetch: Fetch;

  constructor(
    public owner: string,
    public repo: string,
    private token: string,
    fetchImpl?: Fetch,
  ) {
    this.fetch = fetchImpl ?? ((...a) => globalThis.fetch(...a));
  }

  private async request(method: string, path: string, body?: unknown, accept = 'application/vnd.github+json'): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetch(`${API}${path}`, {
        method,
        cache: 'no-store',
        headers: {
          Accept: accept,
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new GitHubError(0, 'Network error');
    }
    if (!res.ok) {
      let msg = res.statusText;
      try {
        msg = (await res.json()).message ?? msg;
      } catch {
        /* keep statusText */
      }
      throw new GitHubError(res.status, msg);
    }
    return res;
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    return (await this.request(method, path, body)).json() as Promise<T>;
  }

  private get base() {
    return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
  }

  async getRepo(): Promise<RepoInfo> {
    const r = await this.json<{ private: boolean; default_branch: string; html_url: string; size: number }>('GET', this.base);
    let empty = false;
    try {
      await this.json('GET', `${this.base}/git/ref/heads/${encodeURIComponent(r.default_branch)}`);
    } catch (e) {
      if (e instanceof GitHubError && (e.status === 409 || e.status === 404)) empty = true;
      else throw e;
    }
    return { private: r.private, defaultBranch: r.default_branch, htmlUrl: r.html_url, empty };
  }

  /** File contents as text, or null if the file doesn't exist. */
  async readFile(path: string, ref: string): Promise<string | null> {
    try {
      const res = await this.request('GET', `${this.base}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, undefined, 'application/vnd.github.raw+json');
      return await res.text();
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return null;
      throw e;
    }
  }

  /** Every file path in the repo at `ref`. */
  async listFiles(ref: string): Promise<string[]> {
    try {
      const t = await this.json<{ tree: { path: string; type: string }[]; truncated: boolean }>(
        'GET',
        `${this.base}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      );
      return t.tree.filter((n) => n.type === 'blob').map((n) => n.path);
    } catch (e) {
      if (e instanceof GitHubError && (e.status === 409 || e.status === 404)) return [];
      throw e;
    }
  }

  /** Create the first file in an empty repo (the Git Data API needs at least one commit). */
  async createFirstFile(path: string, content: string, message: string): Promise<void> {
    await this.json('PUT', `${this.base}/contents/${encodePath(path)}`, { message, content: toBase64(content) });
  }

  /**
   * Commit several files in one commit on `branch`.
   * `prepare` receives the current head commit and returns the files to write;
   * it runs again if someone else pushed in between (e.g. another device),
   * so it can re-read and merge files such as index.json.
   */
  async commit(branch: string, message: string, prepare: (head: string) => Promise<FileChange[]>, attempts = 3): Promise<string> {
    for (let i = 0; ; i++) {
      const ref = await this.json<{ object: { sha: string } }>('GET', `${this.base}/git/ref/heads/${encodeURIComponent(branch)}`);
      const head = ref.object.sha;
      const commit = await this.json<{ tree: { sha: string } }>('GET', `${this.base}/git/commits/${head}`);
      const files = await prepare(head);
      const tree = await this.json<{ sha: string }>('POST', `${this.base}/git/trees`, {
        base_tree: commit.tree.sha,
        tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })),
      });
      const created = await this.json<{ sha: string }>('POST', `${this.base}/git/commits`, { message, tree: tree.sha, parents: [head] });
      try {
        await this.json('PATCH', `${this.base}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: created.sha, force: false });
        return created.sha;
      } catch (e) {
        // 422 = not a fast-forward: the branch moved while we were writing.
        if (e instanceof GitHubError && e.status === 422 && i + 1 < attempts) continue;
        throw e;
      }
    }
  }
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
