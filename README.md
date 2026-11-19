# myjournal

A phone-first journal with a daily **gratitude** entry and a **life check-in** (me, relationships, work), plus a **weekly check-in**. Every entry is saved as a Markdown file in your own private GitHub repo. There's no server and no database.

- **Today:** a guided entry, one question per screen (prototype B). Choose the full check-in (about 4 min) or just gratitude (about 1 min).
- **History:** a month calendar with an entry viewer beside it, plus streaks and search (prototype A).
- **Check-in:** your week's scores and gratitude lines next to five reflection prompts (prototype A).

- **Follow-ups:** when you say you'll do something, the app asks how it went on that day. This covers your "tomorrow" line, the next-week plans in the weekly check-in, and any reminder you add while writing. Due ones show on Today (a dot on the tab) and at the start of your next check-in. See them all from History → Follow-ups, and add them to Google Calendar if you want a phone reminder.
- **Prompts:** the third gratitude question and one deeper weekly question rotate daily and weekly from a built-in library of about 65 prompts (`src/lib/prompts.ts`), mixed with your own from `.journal/config.json`. Tap ↻ for a different one.

Background: [PLAN.md](PLAN.md) and the clickable wireframes in [`prototypes/`](prototypes/index.html).

## What gets saved

Your entries live in a **separate private repo** (e.g. `myjournal-data`). The app creates this layout:

```
daily/2026/11/2026-11-18/gratitude.md
daily/2026/11/2026-11-18/life.md
checkins/weekly/2026/2026-W47.md
.journal/config.json      your prompts (edit on GitHub to change them)
.journal/index.json       summary for streaks, search and the weekly view
followups.md              things you said you'd do, and what happened (readable)
.journal/followups.json   the same follow-ups, as data for the app
```

### Your own prompts

Edit `.journal/config.json` in your journal repo (Settings → Edit prompts):

```json
{
  "builtInPrompts": true,
  "gratitudePrompts": ["What did my dog teach me today?"],
  "weeklyPrompts": ["Best moment of the week", "A relationship to invest in next week"],
  "weeklyQuestions": ["What would future me thank me for this week?"],
  "people": ["Mum", "Priya"]
}
```

- `gratitudePrompts` and `weeklyQuestions` are mixed into the built-in lists. Set `builtInPrompts` to `false` to use only yours.
- `weeklyPrompts` are the fixed questions on every weekly check-in. Any prompt that mentions "next week" gets a follow-up by default.
- Use straight quotes `"`, not curly ones, and a comma after every item except the last. If the file can't be read, the app uses its defaults.

Each save is one commit. Unsaved drafts stay on your device until you save.

## Using it

1. Create a **private** repo for your entries at https://github.com/new (for example `myjournal-data`). It can be empty.
2. Create a fine-grained token at https://github.com/settings/personal-access-tokens/new:
   - Repository access: **Only select repositories** → your journal repo
   - Permissions → Repository → **Contents: Read and write**
3. Open the app, paste `your-username/myjournal-data` and the token, and tap **Connect**.
4. On your phone, use the browser's **Add to Home Screen** to get an app icon.

The token is stored only in that browser. Settings → **Disconnect this device** removes it.

## Hosting the app

The app is static files (`npm run build` → `dist/`). Two free options:

- **GitHub Pages.** Repo Settings → Pages → Source: **GitHub Actions**, then merge to `main`. `.github/workflows/deploy-pages.yml` publishes it to `https://<username>.github.io/myjournal/`. GitHub Pages only serves *private* repos on a paid plan, so on the free plan this repo has to be public. That's safe because the code holds no entries or secrets; your journal stays in the private data repo.
- **Cloudflare Pages.** Keeps this repo private. Create a Pages project → connect GitHub → pick this repo, with build command `npm run build` and output directory `dist`.

## Developing

```
npm install
npm run dev          # local dev server
npm test             # unit tests (file formats, dates, streaks, saving against a fake GitHub)
npm run build        # type-check + production build
npm run e2e          # after build: drives the app in Chromium at phone size against a fake GitHub
```

Code map:

| Path | What's there |
|------|--------------|
| `src/lib/entries.ts` | Entry types and their Markdown format, and the folder paths |
| `src/lib/github.ts` | GitHub API client; one commit per save using the Git Data API |
| `src/lib/journal.ts` | Load/save days and check-ins, first-run setup, conflict detection |
| `src/lib/prompts.ts` | Built-in prompt library and the daily/weekly rotation |
| `src/lib/followups.ts` | Follow-up data, due dates, `followups.md` |
| `src/lib/journalIndex.ts` | Streaks, weekly summary and search over `.journal/index.json` |
| `src/screens/` | Connect, Today, History, Check-in, Settings |
| `tests/fake-github.mjs` | In-memory GitHub used by both test suites |
