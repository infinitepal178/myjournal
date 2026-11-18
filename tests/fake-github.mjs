// In-memory stand-in for the parts of the GitHub REST API the app uses.
// Used by unit tests (as a fetch function) and by the browser tests
// (behind Playwright's request interception).

export function createFakeGitHub({ owner = 'me', repo = 'myjournal-data', files = { 'README.md': '# My journal\n' }, isPrivate = true, empty = false } = {}) {
  let n = 0;
  const sha = (p) => `${p}${(++n).toString(16).padStart(8, '0')}`;
  const trees = new Map(); // treeSha -> Map(path -> content)
  const commits = new Map(); // commitSha -> { tree, parents, message }
  let head = null;
  const log = [];

  function addCommit(fileMap, message, parents) {
    const t = sha('t');
    trees.set(t, fileMap);
    const c = sha('c');
    commits.set(c, { tree: t, parents, message });
    log.push({ sha: c, message, paths: [...fileMap.keys()] });
    return c;
  }
  if (!empty) head = addCommit(new Map(Object.entries(files)), 'Initial commit', []);

  const filesAt = (ref) => {
    const c = ref === 'main' || ref == null ? head : ref;
    if (!c || !commits.has(c)) return null;
    return trees.get(commits.get(c).tree);
  };

  const base = `/repos/${owner}/${repo}`;
  const json = (status, body) => ({ status, body: JSON.stringify(body), contentType: 'application/json' });
  let failNextRefUpdate = 0;

  function handle(method, urlString, bodyText, headers = {}) {
    const url = new URL(urlString);
    const p = decodeURIComponent(url.pathname);
    const body = bodyText ? JSON.parse(bodyText) : null;
    if (!/^Bearer \S+/.test(headers.authorization ?? headers.Authorization ?? '')) return json(401, { message: 'Bad credentials' });
    if (!p.startsWith(base)) return json(404, { message: 'Not Found' });
    const rest = p.slice(base.length);

    if (method === 'GET' && rest === '') return json(200, { private: isPrivate, default_branch: 'main', html_url: `https://github.com/${owner}/${repo}`, size: 0 });

    if (method === 'GET' && rest === '/git/ref/heads/main') return head ? json(200, { object: { sha: head } }) : json(409, { message: 'Git Repository is empty.' });

    let m;
    if (method === 'GET' && (m = /^\/git\/commits\/(\w+)$/.exec(rest))) {
      const c = commits.get(m[1]);
      return c ? json(200, { sha: m[1], tree: { sha: c.tree } }) : json(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (m = /^\/git\/trees\/(.+)$/.exec(rest))) {
      const f = filesAt(m[1]);
      if (!f) return json(409, { message: 'Git Repository is empty.' });
      return json(200, { tree: [...f.keys()].map((path) => ({ path, type: 'blob' })), truncated: false });
    }
    if (method === 'POST' && rest === '/git/trees') {
      const baseFiles = trees.get(body.base_tree);
      const next = new Map(baseFiles);
      for (const e of body.tree) next.set(e.path, e.content);
      const t = sha('t');
      trees.set(t, next);
      return json(201, { sha: t });
    }
    if (method === 'POST' && rest === '/git/commits') {
      const c = sha('c');
      commits.set(c, { tree: body.tree, parents: body.parents, message: body.message });
      return json(201, { sha: c });
    }
    if (method === 'PATCH' && rest === '/git/refs/heads/main') {
      const c = commits.get(body.sha);
      if (failNextRefUpdate > 0) {
        failNextRefUpdate--;
        return json(422, { message: 'Update is not a fast forward' });
      }
      if (!c || c.parents[0] !== head) return json(422, { message: 'Update is not a fast forward' });
      head = body.sha;
      log.push({ sha: head, message: c.message, paths: [...trees.get(c.tree).keys()] });
      return json(200, { object: { sha: head } });
    }
    if ((m = /^\/contents\/(.+)$/.exec(rest))) {
      const path = m[1];
      if (method === 'GET') {
        const f = filesAt(url.searchParams.get('ref'));
        if (!f || !f.has(path)) return json(404, { message: 'Not Found' });
        return { status: 200, body: f.get(path), contentType: 'text/plain; charset=utf-8' };
      }
      if (method === 'PUT') {
        const text = new TextDecoder().decode(Uint8Array.from(atob(body.content), (ch) => ch.charCodeAt(0)));
        const next = new Map(filesAt('main') ?? []);
        next.set(path, text);
        head = addCommit(next, body.message, head ? [head] : []);
        return json(201, { content: { path } });
      }
    }
    return json(404, { message: `Fake GitHub: no route for ${method} ${rest}` });
  }

  /** A fetch() implementation backed by this fake. */
  async function fetchImpl(input, init = {}) {
    const r = handle(init.method ?? 'GET', String(input), init.body, init.headers ?? {});
    return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.contentType } });
  }

  return {
    handle,
    fetch: fetchImpl,
    file: (path) => filesAt('main')?.get(path) ?? null,
    paths: () => [...(filesAt('main')?.keys() ?? [])],
    /** Simulate an edit made on github.com or another device. */
    write(path, content, message = `edit ${path}`) {
      const next = new Map(filesAt('main') ?? []);
      next.set(path, content);
      head = addCommit(next, message, head ? [head] : []);
    },
    failNextRefUpdate: (times = 1) => {
      failNextRefUpdate = times;
    },
    commitMessages: () => {
      const out = [];
      for (let c = head; c; c = commits.get(c).parents[0]) out.push(commits.get(c).message);
      return out;
    },
  };
}
