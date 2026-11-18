# myjournal: a daily journal that saves every entry to your own private GitHub repo

## In short

- **What:** a small website you open once a day to write two things: a **gratitude journal** (three things you're grateful for) and a **life check-in** covering *me*, *relationships* and *work*. Every week (and month) it also gives you a short **review** that pulls those entries together.
- **Where your data lives:** every entry is a Markdown file committed to a **private GitHub repo** (`myjournal-data`), sorted into folders by date, with separate folders for check-ins. No database and no server. Git history gives you version history for free.
- **How:** a static web app (this repo, `myjournal`) that talks straight to the GitHub API from your browser using a token scoped to that one private repo.
- **Cost:** free. GitHub's free plan covers private repos, and the hosting options below have free tiers.
- **When:** built in phases, and each phase has to pass a test before the next one starts. Phase 1 (the daily entry) is small enough to vibe-code in one or two sessions.

## Decisions needed

| # | Decision | Recommendation | Why |
|---|----------|----------------|-----|
| 1 | Which UI direction to build (see `prototypes/`) | **A (Notebook) as the base, with B's guided flow as the mobile layout** | A is the fastest to build and reads like a journal. B fits a two-minute phone check-in better. They can share one data model. |
| 2 | How you log in | **Phase 1: a fine-grained GitHub token. Phase 5: "Sign in with GitHub"** | A token needs no backend and can be limited to one repo. Real OAuth needs a small token-exchange server, which is extra work for a single-user app. |
| 3 | Where the app is hosted | **Cloudflare Pages** (or GitHub Pages if this repo is public) | GitHub Pages only serves *private* repos on paid plans. The app code holds no secrets, so it can be public either way. |
| 4 | Whether to encrypt entries before they're committed | **Off for now; revisit in Phase 5** | Plain Markdown stays readable on GitHub and in any editor. Encryption protects against GitHub itself reading your entries, but you lose that readability. |
| 5 | Folder layout (date first vs. type first) | **Date first** (`daily/2026/11/2026-11-18/…`) | Opening one folder shows everything about a day. The app handles "all gratitude entries" views on its own. |

---

## The app is a static website that reads and writes Markdown files in your private repo

```
 ┌──────────────────────────┐        GitHub REST API (HTTPS)       ┌──────────────────────────────┐
 │  myjournal (this repo)   │  ──── read / commit entries ───────▶ │  myjournal-data  (PRIVATE)   │
 │  static site in browser  │                                      │  Markdown + YAML frontmatter │
 │  React + Vite            │  ◀──── file list, contents ───────── │  one commit per save         │
 └──────────────────────────┘                                      └──────────────────────────────┘
        ▲   token kept in this browser only (localStorage), scoped to myjournal-data, Contents: read & write
        │   drafts autosave locally, so nothing is lost if you close the tab before saving
      You
```

- **Two repos.** `myjournal` holds the app code and can be public. `myjournal-data` holds your entries and is private. The token can only reach the data repo.
- **Saving = committing.** When you save, the app calls `PUT /repos/{you}/myjournal-data/contents/{path}` with commit messages like `gratitude: 2026-11-18`. Editing the same day again updates the file, so git keeps every version.
- **Reading history is one API call.** `GET /git/trees/main?recursive=1` returns every file path. The app builds the calendar, streaks and folder views from those paths, then fetches only the entries you open.
- **Charts come from a small index file.** On each save the app also updates `.journal/index.json` (date → mood, scores, tags), so trends load in one request instead of hundreds.

## Your data repo has dedicated folders for days, months and check-ins

```
myjournal-data/                       (private)
├── README.md                         what this repo is, written by the app on first run
├── daily/
│   └── 2026/
│       └── 11/
│           ├── 2026-11-17/
│           │   ├── gratitude.md
│           │   └── life.md
│           └── 2026-11-18/
│               ├── gratitude.md
│               └── life.md
├── checkins/
│   ├── weekly/2026/2026-W47.md        Sunday review
│   ├── monthly/2026/2026-11.md        end-of-month review
│   └── yearly/2026.md                 optional, December
└── .journal/
    ├── config.json                    your prompts, life areas, timezone, reminder time
    └── index.json                     summary per day, used for charts and streaks
```

### Each entry is a readable Markdown file with structured data at the top

`daily/2026/11/2026-11-18/gratitude.md`

```markdown
---
type: gratitude
date: 2026-11-18
created: 2026-11-18T21:42:10
updated: 2026-11-18T21:55:03
tags: [family, health]
---
# Gratitude · Wed 18 Nov 2026

1. A long call with Mum. She sounded genuinely happy.
2. Slept 8 hours for the first time this week.
3. Sam covered the client call so I could finish the deck.

**Prompt of the day:** Who made today easier? → Sam, without being asked.
```

`daily/2026/11/2026-11-18/life.md`

```markdown
---
type: life
date: 2026-11-18
mood: 4          # 1–5
energy: 3        # 1–5
scores:
  me: 4
  relationships: 3
  work: 2
people: [Mum, Sam]
tags: [deadline]
---
# Life · Wed 18 Nov 2026

## Me
Gym in the morning, felt sharp until 3pm…

## Relationships
Called Mum. Haven't replied to Priya in a week; do it tomorrow.

## Work
Deck is late. Root cause: I said yes to two side asks on Monday.

## Tomorrow
Reply to Priya before 10am. Say no to one meeting.
```

`checkins/weekly/2026/2026-W47.md` uses the same pattern: frontmatter holds the week's averages, and the body holds your answers to the review prompts.

## The app has four screens

| Screen | What you do | What gets written |
|--------|-------------|-------------------|
| **Connect** (first run only) | Paste the data repo name and token; the app tests access and creates `README.md` + `.journal/config.json` if missing | `README.md`, `.journal/config.json` |
| **Today** | Write three gratitude lines and the life check-in (mood, energy, a 1–5 score and a note for me / relationships / work, plus one line for tomorrow). Drafts autosave locally; **Save** commits. | `daily/YYYY/MM/YYYY-MM-DD/gratitude.md`, `…/life.md`, `.journal/index.json` |
| **History** | Calendar and timeline of past days, streak, search, open any entry, see its versions, open it on GitHub | read only |
| **Check-in** | Weekly (and monthly) review: the app shows that period's gratitude lines and average scores, and you answer 4–5 prompts | `checkins/weekly/YYYY/YYYY-Www.md`, `checkins/monthly/YYYY/YYYY-MM.md` |

The prototypes in `prototypes/` show all four screens in three different styles. Open `prototypes/index.html`.

## The build runs in five phases, each with a test before the next starts

| Phase | Scope | Test before moving on |
|-------|-------|-----------------------|
| **0. Setup** | Create the private `myjournal-data` repo. Create a fine-grained token (that repo only, *Contents: Read and write*, *Metadata: Read*). Scaffold Vite + React + TypeScript in this repo and deploy a hello-world page. | The deployed page can read `README.md` from the data repo. |
| **1. Daily entry (MVP)** | Connect screen, Today screen (gratitude + life), local draft autosave, save/load via the Contents API, frontmatter parsing. | You've journaled 7 days in a row without opening GitHub to fix anything. |
| **2. History** | Calendar from the git tree, streak counter, entry viewer, search across entries, "view versions" from commit history. | You can find any past entry in under 10 seconds. |
| **3. Check-ins** | Weekly and monthly review screens that summarise the period, and a Sunday nudge on the Today screen. | 4 weekly check-ins completed. |
| **4. Insights** | `index.json`, mood and score trends per life area, a gratitude word cloud and people you mention most. | The charts tell you something you didn't already know. |
| **5. Polish** | Installable PWA (home-screen icon, works offline and syncs later), reminder notification, "Sign in with GitHub" via a small Cloudflare Worker, optional client-side encryption. | Your choice. |

## What could go wrong, and how the plan handles it

- **Token leak.** The token sits in your browser's storage, so anything that can run script on the page could read it. *Mitigation:* scope it to the data repo only, give it an expiry (e.g. 1 year), keep third-party scripts to a minimum, and use a strict Content-Security-Policy. You can revoke it on GitHub in one click.
- **Losing a half-written entry.** *Mitigation:* the draft autosaves to localStorage every few seconds and is cleared only after a successful commit.
- **Editing on two devices at once.** *Mitigation:* every update sends the file's current `sha`. If GitHub rejects the update because the file changed, the app shows both versions and lets you merge them.
- **Habit drop-off.** The bigger risk is not writing at all, not a technical failure. *Mitigation:* a "just gratitude, 60 seconds" mode, the streak counter, and a reminder at a time you choose.
- **API limits.** 5,000 requests an hour per token. A daily journal uses a few dozen, so this isn't a real constraint.

## Next steps

1. Look through `prototypes/index.html` and pick a direction (Decision 1), or tell me which pieces to mix.
2. Confirm Decisions 2–5, or accept the recommendations.
3. Create the private `myjournal-data` repo and the token (Phase 0). The steps are in the appendix.
4. Start Phase 1 with the first build prompt in the appendix.

---

## Appendix

### A. Recommended stack

| Need | Choice | Why |
|------|--------|-----|
| Framework | Vite + React + TypeScript | Common, fast, and well supported by AI coding tools |
| Styling | Tailwind CSS | Quick to iterate on while vibe-coding |
| GitHub API | `@octokit/rest` (or plain `fetch`) | Typed and well documented |
| Frontmatter | `yaml` package plus a small split on `---` | `gray-matter` assumes Node; this works in the browser |
| Markdown preview | `marked` + `DOMPurify` | Renders entries safely |
| Dates | `date-fns` | ISO weeks (`2026-W47`) and formatting |
| Offline/PWA | `vite-plugin-pwa` | Phase 5 |
| Hosting | Cloudflare Pages / GitHub Pages | Free static hosting |

### B. Phase 0 setup steps

1. GitHub → **New repository** → name `myjournal-data` → **Private** → add a README.
2. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate:
   - Repository access: **Only select repositories** → `myjournal-data`
   - Permissions: **Contents: Read and write**, **Metadata: Read-only**
   - Expiration: your choice (1 year is a sensible default)
3. Keep the token somewhere safe, such as a password manager. You'll paste it into the Connect screen once per device.

### C. How a save works (Contents API)

```ts
// path = daily/2026/11/2026-11-18/gratitude.md
const existing = await gh.repos.getContent({ owner, repo, path }).catch(() => null);
await gh.repos.createOrUpdateFileContents({
  owner, repo, path,
  message: `gratitude: ${date}`,
  content: base64(utf8(markdown)),     // encode UTF-8 first; btoa alone breaks on emoji
  sha: existing?.data.sha,             // required when updating; triggers conflict detection
});
```

Later upgrade: save gratitude, life and `index.json` in **one commit** with the Git Data API (create blobs → create tree → create commit → update `refs/heads/main`).

### D. First build prompt for Phase 1

> Build Phase 1 of PLAN.md in this repo. Vite + React + TypeScript + Tailwind. Use prototype A's (`prototypes/a-notebook.html`) layout for desktop and prototype B's step flow under 640px. Implement: Connect screen (owner/repo/token, test access, write README + `.journal/config.json` if missing, store config in localStorage); Today screen writing `daily/YYYY/MM/YYYY-MM-DD/gratitude.md` and `life.md` in exactly the formats in PLAN.md; load today's files if they exist; autosave drafts to localStorage; Save commits via the Contents API with `sha` conflict handling. Keep all GitHub calls in `src/lib/github.ts` and all Markdown serialising/parsing in `src/lib/entries.ts`, with unit tests for the round-trip.

### E. Ideas parked for later

- An AI reflection on your weekly check-in: a short summary and patterns across the week, using the Claude API from the Worker in Phase 5.
- `people/` notes: one file per important person, linked from the `people:` field.
- Photo of the day, stored in `daily/…/photo.jpg`.
- Export to PDF / a printed yearbook in December.
