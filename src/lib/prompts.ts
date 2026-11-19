// Built-in prompt library. Your own prompts from .journal/config.json are
// mixed in with these (set "builtInPrompts": false there to use only yours).
// Each day gets one prompt; the order is shuffled once per year so nothing
// repeats until the whole list has been used. ↻ in the app moves to the next one.

import type { JournalConfig } from './config';
import { dayOfYear } from './dates';

/** Third gratitude question, one per day. */
export const GRATITUDE_LIBRARY: string[] = [
  // people
  'Who made today easier?',
  'Who shaped who you are, and have you ever told them?',
  'What did someone do recently that you would like to repay?',
  'Who would you call first with good news, and why them?',
  'What kindness from a stranger do you still remember?',
  'Who challenged you in a way that ended up helping?',
  'Who in your life is easiest to take for granted?',
  'Who are you glad is in your life, and why?',
  // small moments and senses
  'What small moment do you want to remember?',
  'What did you see, hear or taste today that was quietly good?',
  'What ordinary thing would you miss most if it disappeared tomorrow?',
  'What made you laugh or smile?',
  'Where did you feel calm today, even for a minute?',
  // yourself
  'What did your body let you do today?',
  'What quality in yourself are you glad you have?',
  'What did you do today that your younger self would be proud of?',
  'What habit is quietly paying off?',
  'What did you handle better than you would have a year ago?',
  // difficulty, seen differently
  'What difficulty are you secretly grateful for?',
  'What problem turned out smaller than you feared?',
  'What has a recent mistake taught you?',
  'What is hard right now that is also helping you grow?',
  'What ending made room for something better?',
  // learning
  'What did you learn today, about anything?',
  'What idea or conversation is still on your mind?',
  'Which book, song or film changed something in you?',
  'What can you do now that once felt impossible?',
  // work
  'What part of your work would you do even if nobody paid you?',
  'Who at work made your day better?',
  'What went better than you expected?',
  'What progress did you make that nobody saw?',
  // what you have
  'What about where you live are you glad for?',
  'What do you have now that you once wished for?',
  'What freedom do you have that others might not?',
  "What's something you usually take for granted?",
  // past and future
  'What memory always makes you feel warm?',
  'What decision from years ago are you glad you made?',
  'What did someone teach you that you still use?',
  'What are you looking forward to, and why?',
  'What possibility excites you right now?',
  'What door is open to you right now that wasn’t before?',
];

/** One deeper question added to each weekly check-in. */
export const WEEKLY_LIBRARY: string[] = [
  'What did I avoid this week, and why?',
  'When did I feel most like myself?',
  'What am I putting up with that I shouldn’t be?',
  'If I could relive this week, what would I do differently?',
  'Where did my time actually go, and is that what I wanted?',
  'What did I say yes to that I wish I’d said no to?',
  'What conversation do I need to have, and with whom?',
  'What am I proud of that nobody noticed?',
  'What story am I telling myself that might not be true?',
  'Who did I learn from this week?',
  'What would make next week 10% better?',
  'What am I worried about, and which part of it is in my control?',
  'If a friend had lived my week, what would I tell them?',
  'What did I learn about what I actually want?',
  'What am I postponing, and what is waiting costing me?',
  'Which small win deserves more credit than I gave it?',
  'Where was I rushing, and what did it cost?',
  'What surprised me this week?',
  'Which boundary did I keep, and which did I let slide?',
  'What do I want more of next week, and less of?',
  'What did I do purely for joy?',
  'What belief of mine shifted, even slightly?',
  'What feedback did I get, and what part of it is true?',
  'How did I look after my body and mind?',
  'What would I regret not doing if this pace continued for a year?',
];

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((p) => {
    const k = p.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Small seeded shuffle so the order is stable for a whole year on every device.
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list: string[], seed: number): string[] {
  const out = [...list];
  const rnd = seeded(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function gratitudePool(config: JournalConfig): string[] {
  const pool = dedupe([...config.gratitudePrompts, ...(config.builtInPrompts ? GRATITUDE_LIBRARY : [])]);
  return pool.length ? pool : GRATITUDE_LIBRARY;
}

export function weeklyPool(config: JournalConfig): string[] {
  const pool = dedupe([...config.weeklyQuestions, ...(config.builtInPrompts ? WEEKLY_LIBRARY : [])]);
  return pool.length ? pool : WEEKLY_LIBRARY;
}

/** The gratitude prompt for a day. `skip` moves forward through the list (the ↻ button). */
export function gratitudePromptFor(config: JournalConfig, date: string, skip = 0): string {
  const order = shuffled(gratitudePool(config), Number(date.slice(0, 4)));
  return order[(dayOfYear(date) + skip) % order.length];
}

/** The deeper weekly question for an ISO week like "2026-W47". */
export function weeklyQuestionFor(config: JournalConfig, week: string, skip = 0): string {
  const year = Number(week.slice(0, 4));
  const n = Number(week.slice(6));
  const order = shuffled(weeklyPool(config), year * 7 + 1);
  return order[(n - 1 + skip) % order.length];
}

