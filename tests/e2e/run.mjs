// End-to-end check: builds nothing, serves dist/ with `vite preview`, and drives
// the app in Chromium at phone size against an in-memory fake GitHub.
// Usage: npm run build && npm run e2e   (SHOTS=dir to save screenshots)

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createFakeGitHub } from '../fake-github.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const PORT = 4179;
const URL = `http://localhost:${PORT}/`;
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve());
  server.on('exit', (c) => reject(new Error(`preview exited ${c}`)));
  setTimeout(() => reject(new Error('preview did not start')), 20000);
});

const fake = createFakeGitHub();
const browser = await chromium.launch();
const errors = [];
let failures = 0;

function check(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.log(`  ✕ ${msg}`);
  }
}

async function newPage(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  // A 404 is how GitHub says "no entry for this day yet", so the browser logs those; they're expected.
  page.on('console', (m) => m.type() === 'error' && !/status of 404/.test(m.text()) && errors.push(m.text()));
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const r = fake.handle(req.method(), req.url(), req.postData(), await req.allHeaders());
    await route.fulfill({ status: r.status, body: r.body, contentType: r.contentType, headers: cors });
  });
  return { ctx, page };
}

async function shot(page, name) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(over <= 0, `${name}: no sideways scrolling`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

const today = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();
const dir = `daily/${today.slice(0, 4)}/${today.slice(5, 7)}/${today}`;

try {
  const { ctx, page } = await newPage({ ...devices['Pixel 7'] });

  console.log('Connect');
  await page.goto(URL);
  await shot(page, '01-connect');
  await page.fill('#repo', 'https://github.com/me/myjournal-data');
  await page.fill('#token', 'github_pat_test');
  await page.click('button:has-text("Connect")');
  await page.waitForSelector('text=Full check-in');
  check(fake.file('.journal/config.json') !== null, 'created .journal/config.json');
  check(fake.file('.journal/index.json') !== null, 'created .journal/index.json');
  await shot(page, '02-today-home');

  console.log('Full check-in');
  await page.click('button:has-text("Start")');
  check(await page.waitForSelector('nav.tabbar', { state: 'hidden', timeout: 2000 }).then(() => true, () => false), 'tab bar hidden while answering');
  await page.click('button.mood:has-text("good")');
  await page.click('[aria-label="Energy"] button:has-text("3")');
  await shot(page, '03-flow-mood');
  await page.click('button:has-text("Next")');
  await page.fill('#gratitude-g1', 'A long call with Mum. She sounded happy.');
  await shot(page, '04-flow-gratitude');
  await page.click('button:has-text("Next")');
  await page.fill('#gratitude-g2', 'Slept 8 hours.');
  await page.click('button:has-text("Next")');
  const before = await page.textContent('h1.q');
  await page.click('button:has-text("Another prompt")');
  const after = await page.textContent('h1.q');
  check(before !== after && after.length > 5, `↻ swaps the prompt ("${before}" → "${after}")`);
  await page.fill('#gratitude-g3', 'Sam, without being asked.');
  await page.click('button:has-text("Next")');
  await page.click('[aria-label="Me"] button:has-text("4")');
  await page.fill('#notes-me', 'Gym in the morning.');
  await page.click('button:has-text("Next")');
  await page.fill('#add-person', 'Mum');
  await page.click('button:has-text("Add")');
  await page.click('[aria-label="Relationships"] button:has-text("3")');
  await shot(page, '05-flow-people');
  await page.click('button:has-text("Next")');
  await page.click('button:has-text("Skip")'); // work
  await page.fill('#notes-tomorrow', 'Reply to Priya before 10.');
  check(await page.isChecked('#remind-tomorrow'), '"ask me tomorrow" is on by default');
  await page.click('button:has-text("Next")');
  await page.waitForSelector('text=Looks good?');
  await shot(page, '06-flow-review');
  await page.click('button:has-text("Save to GitHub")');
  await page.waitForSelector('text=day streak');
  check(await page.isVisible("text=I'll ask you about"), 'done screen lists the new follow-up');
  await shot(page, '07-done');
  const fu0 = JSON.parse(fake.file('.journal/followups.json') ?? '{"items":[]}').items;
  check(fu0.length === 1 && fu0[0].id === `${today}-tomorrow` && fu0[0].due > today && fu0[0].text === 'Reply to Priya before 10.', 'tomorrow line saved as a follow-up');
  check((fake.file('followups.md') ?? '').includes('- [ ] Reply to Priya before 10.'), 'followups.md written');
  const g = fake.file(`${dir}/gratitude.md`) ?? '';
  const l = fake.file(`${dir}/life.md`) ?? '';
  check(g.includes('1. A long call with Mum. She sounded happy.') && g.includes('3. Sam, without being asked.'), 'gratitude.md written');
  check(/mood: 4/.test(l) && /people: \[Mum\]/.test(l) && l.includes('## Tomorrow\nReply to Priya before 10.'), 'life.md written');
  check(/^gratitude \+ life \+ follow-ups: /.test(fake.commitMessages()[0]), `saved as one commit ("${fake.commitMessages()[0]}")`);
  check(JSON.parse(fake.file('.journal/index.json')).days[today]?.mood === 4, 'index.json updated');

  console.log('History');
  await page.click('nav a:has-text("History")');
  await page.waitForSelector('.entry >> text=A long call with Mum');
  check(await page.isVisible(`.cal button[aria-pressed="true"] .dot-g`), 'calendar shows a gratitude dot today');
  await shot(page, '08-history');
  await page.click('.entry button:has-text("Life")');
  check(await page.isVisible('.entry >> text=Gym in the morning.'), 'life tab shows notes');
  await page.fill('#search', 'slept');
  check(await page.isVisible('.results >> text=Slept 8 hours.'), 'search finds gratitude');
  await page.fill('#search', '');

  console.log('Weekly check-in');
  await page.click('nav a:has-text("Check-in")');
  await page.waitForSelector('#weekly-0');
  check(await page.isVisible('text=A long call with Mum. She sounded happy.'), 'week summary lists gratitude');
  await page.fill('#weekly-0', 'The call with Mum.');
  await page.fill('#weekly-2', 'Plan a weekend trip with Priya');
  check(await page.isChecked('#weekly-remind-2'), 'relationship plan gets a follow-up by default');
  const q1 = await page.textContent('label[for="weekly-5"]');
  await page.click('button:has-text("↻ Another")');
  const q2 = await page.textContent('label[for="weekly-5"]');
  check(q1 !== q2, `↻ swaps the weekly question ("${q1}" → "${q2}")`);
  await page.fill('#weekly-5', 'Avoided the budget talk.');
  await shot(page, '09-checkin');
  await page.click('button:has-text("Save check-in")');
  await page.waitForSelector('.toast');
  const weekFu = JSON.parse(fake.file('.journal/followups.json')).items.find((f) => f.id.endsWith('a-relationship-to-invest-in-next-week'));
  check(!!weekFu && weekFu.text === 'Plan a weekend trip with Priya' && weekFu.due > today, `weekly plan saved as a follow-up (due ${weekFu?.due})`);
  const weeklyFile = fake.paths().find((p) => p.startsWith('checkins/weekly/'));
  check(!!weeklyFile && fake.file(weeklyFile).includes('## Best moment of the week\nThe call with Mum.'), 'weekly check-in written');
  check(fake.file(weeklyFile).includes(`question: ${q2}`) || fake.file(weeklyFile).includes(`question: "${q2}"`) || fake.file(weeklyFile).includes(`question: '${q2}'`), 'weekly question stored in the file');

  console.log('Reload keeps you connected');
  await page.goto(URL + '#today');
  await page.waitForSelector('text=Saved for today');
  check(true, 'today shows the saved entry after reload');

  console.log('Draft survives closing the app');
  await page.click('button:has-text("Edit gratitude")');
  await page.fill('#gratitude-g1', 'Changed my mind about this one.');
  await page.click('[aria-label="Close and keep draft"]');
  await page.reload();
  await page.waitForSelector('text=Continue where you left off');
  check(true, 'draft offered after reload');

  console.log('Edited elsewhere');
  fake.write(`${dir}/gratitude.md`, '1. Edited on github.com\n');
  await page.click('button:has-text("Continue")');
  for (let i = 0; i < 3; i++) await page.click('button:has-text("Next")');
  await page.click('button:has-text("Save to GitHub")');
  await page.waitForSelector('text=changed on GitHub or another device');
  check(fake.file(`${dir}/gratitude.md`) === '1. Edited on github.com\n', 'did not overwrite the other edit');
  await shot(page, '10-conflict');
  await page.click('button:has-text("Save mine anyway")');
  await page.waitForSelector('text=day streak');
  check(fake.file(`${dir}/gratitude.md`).includes('1. Changed my mind about this one.'), 'saved after choosing to overwrite');

  console.log('A follow-up comes due');
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  })();
  const items = JSON.parse(fake.file('.journal/followups.json')).items;
  items.push({ id: 'due-1', text: 'Call Priya about the trip', people: ['Priya'], created: yesterday, due: today, status: 'open' });
  fake.write('.journal/followups.json', JSON.stringify({ version: 1, items }));
  await page.goto(URL + '#today');
  await page.reload(); // a fresh open, like coming back the next day
  await page.waitForSelector('text=A follow-up is due');
  check(await page.isVisible('nav .badge'), 'Today tab shows a dot');
  await page.click('.followup:has-text("Call Priya about the trip") button.chip:has-text("Done")');
  await page.fill('textarea[aria-label^="What happened"]', 'Called her, trip is on for December.');
  await shot(page, '16-followup-due');
  await page.click('button:has-text("Save follow-ups")');
  await page.waitForSelector('text=Follow-ups saved');
  const done1 = JSON.parse(fake.file('.journal/followups.json')).items.find((f) => f.id === 'due-1');
  check(done1?.status === 'done' && done1.outcome === 'Called her, trip is on for December.', 'answer saved with what happened');
  check(!(await page.isVisible('nav .badge')), 'dot clears once answered');

  console.log('Follow-up as the first step of the check-in');
  const items2 = JSON.parse(fake.file('.journal/followups.json')).items;
  items2.push({ id: 'due-2', text: 'Go to bed by 11', people: [], created: yesterday, due: today, status: 'open' });
  fake.write('.journal/followups.json', JSON.stringify({ version: 1, items: items2 }));
  await page.goto(URL + '#today');
  await page.reload(); // a fresh open, like coming back the next day
  await page.waitForSelector('text=A follow-up is due');
  await page.click('button:has-text("Edit check-in")');
  await page.waitForSelector('text=How did it go?');
  await page.click('button.chip:has-text("Not yet")');
  await page.click('button.chip:has-text("Ask end of next week")');
  for (let i = 0; i < 20 && !(await page.isVisible('text=Looks good?')); i++) await page.click('.flow-foot button:has-text("Next")');
  check(await page.isVisible('text=1 follow-up answered'), 'review mentions the follow-up');
  await page.click('button:has-text("Save to GitHub")');
  await page.waitForSelector('text=day streak');
  const snoozed = JSON.parse(fake.file('.journal/followups.json')).items.find((f) => f.id === 'due-2');
  check(snoozed?.status === 'open' && snoozed.due > today && snoozed.snoozed === 1, `"Not yet" moves it later (now ${snoozed?.due})`);

  console.log('Follow-ups screen');
  await page.goto(URL + '#followups');
  await page.waitForSelector('text=Coming up');
  check(await page.isVisible('text=Plan a weekend trip with Priya'), 'lists coming-up follow-ups');
  check(await page.isVisible('text=Called her, trip is on for December.'), 'shows what happened with closed ones');
  await shot(page, '17-followups');

  console.log('Settings');
  await page.click('nav a:has-text("Settings")');
  await page.click('button:has-text("Rebuild from entries")');
  await page.waitForSelector('text=Index rebuilt from 1 day of entries');
  await shot(page, '11-settings');
  await ctx.close();

  console.log('Dark mode and wide screen');
  const dark = await newPage({ ...devices['Pixel 7'], colorScheme: 'dark' });
  await dark.page.addInitScript(() =>
    localStorage.setItem('myjournal.settings', JSON.stringify({ owner: 'me', repo: 'myjournal-data', token: 't', branch: 'main' })),
  );
  await dark.page.goto(URL + '#history');
  await dark.page.waitForSelector('.entry >> text=Changed my mind');
  await shot(dark.page, '12-history-dark');
  await dark.page.goto(URL + '#today');
  await dark.page.waitForSelector('text=Saved for today');
  await shot(dark.page, '13-today-dark');
  await dark.ctx.close();

  const wide = await newPage({ viewport: { width: 1280, height: 860 } });
  await wide.page.addInitScript(() =>
    localStorage.setItem('myjournal.settings', JSON.stringify({ owner: 'me', repo: 'myjournal-data', token: 't', branch: 'main' })),
  );
  await wide.page.goto(URL + '#history');
  await wide.page.waitForSelector('.entry >> text=Changed my mind');
  await shot(wide.page, '14-history-wide');
  await wide.page.goto(URL + '#checkin');
  await wide.page.waitForSelector('#weekly-0');
  await shot(wide.page, '15-checkin-wide');
  await wide.ctx.close();
} catch (e) {
  failures++;
  console.error(e);
} finally {
  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await browser.close();
  server.kill();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
