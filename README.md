# Keel

A personal life OS. Money, work, habits, health, tasks and notes in one
place — so they can be looked at *together* rather than in six separate apps
that never talk to each other.

Everything runs in the browser on your own device. No account, no server, no
analytics, no network calls. It works with the aeroplane mode on.

**Open `index.html`.** That's the whole app.

---

## Why this exists

The useful thing about keeping all of it in one place isn't the tracking. It's
that once money, sleep, habits, work and mood live in the same file, you can
ask questions no single-purpose app can answer:

> You complete 66% of your habits after 7h or more sleep, against 24% after
> less. 90 days compared.

> eBay / reselling covers 40% of your outgoings. Averaging £555 a month across
> 3 months.

> Your jobs take a median of 1.5× your estimate, over 4 finished jobs.
> Quoting that multiple would leave you whole.

Those are real outputs. They're also the whole point.

## Ground rules it holds itself to

These are enforced in the code and in the tests, not just aspirations:

- **It never claims a pattern without saying how much data it's from.** Every
  observation carries its sample size.
- **It never says "because".** Sleep and energy *move together*; nothing here
  claims one causes the other.
- **Silence over guessing.** Below the minimum sample it says nothing at all.
  An empty insights list is an honest answer; a confident one built on four
  data points is not.
- **A day you didn't log is not a day you scored zero.** Missing data is
  missing, everywhere — in averages, in weekly scores, in the charts.
- **You're measured against yourself.** Weekly scores compare this week to
  *your* recent weeks, not to a target someone else invented.

## What's in it

### Today
One screen for the morning. Your one thing for the day, habit ticks, what's
due, a ten-second check-in, quick money entry, and the two or three things
Keel thinks are actually worth your attention.

### Money
Cash, and **runway** — how many months you've got at your current rate, and
roughly when it runs out. It uses your logged transactions once there are
enough, and your list of regular items before that; it always tells you
which. Plus goals with honest projections, month-by-month history, and a
breakdown of which income stream is actually carrying the month.

### Work
Job applications and freelance jobs in one pipeline, because they're the same
question: where is money going to come from. Applications that have gone quiet
get surfaced for a nudge. Delivered-but-unpaid work gets surfaced loudly. Your
realised hourly rate and how far your quotes drift from reality both get
worked out from finished jobs.

### Life
- **Habits** — streaks, a 12-week heatmap, per-day editing. The day in
  progress never breaks a streak: not having done it *yet* today isn't a
  failure at 9am.
- **Body** — sleep, energy, mood, movement, water, weight, and the patterns
  between them.
- **Journal** — a daily entry, plus a win, a gratitude and a lesson.

### Tasks
Projects, priorities, due dates, a someday shelf, and a nudge about work
that's been sitting open for a month (usually those want deleting, not doing).

### Review
The weekly one. Every domain in one digest, scored where there's data and left
blank where there isn't, with the cross-domain observations and space to write
what the numbers can't tell you.

## Your data is yours

- **Backup** — one JSON file, restorable, in Settings.
- **Obsidian** — exports a folder of Markdown notes with YAML frontmatter:
  `Keel/Daily/2026-09-10.md`, `Keel/Weekly/2026-W37.md`, plus an overview.
  Unzip into your vault.
- **Spreadsheets** — transactions as CSV for the **UK tax year** (6 April to
  5 April, correctly), plus check-ins and habits.

Nothing here is a lock-in. If you stop using Keel tomorrow, you keep
everything in formats other tools already read.

### Where it's stored, and how to not lose it

Your data lives in this browser's `localStorage`, on this device only. That's
what makes it private, and it's also the catch: **clearing site data wipes
it**, and it doesn't sync between devices. Take a backup now and then. If the
saved data is ever unreadable, Keel keeps the unreadable copy aside rather
than quietly starting fresh.

## Running it

Open `index.html` in any browser. That's genuinely it — the CSS and all
twenty-five modules are inlined into that one file, so it works from a USB
stick with no internet.

For the full app experience — installable, offline via service worker — serve
it over HTTP:

```bash
npm start          # builds, then serves on http://localhost:8080
```

Then **Add to Home Screen** on your phone. It opens fullscreen like a native
app. (Browsers block `localStorage` on `file://` URLs, so if you want your
data to actually save, use the server.)

## Working on it

No dependencies. Node 20+ for the build and tests, nothing else.

```bash
npm run build      # regenerate index.html, icons, manifest and sw.js
npm test           # the full suite
npm run test:core  # just the logic, no browser needed
```

### How it's put together

```
src/core/     pure logic — no DOM, runs in Node, covered by tests
src/ui/       everything that touches the page
src/styles.css
build.mjs     inlines it all into index.html; generates the PNG icons,
              manifest and service worker. Node built-ins only.
test/         121 tests, 8 of them driving a real browser
```

The split matters: `src/core/` never touches `document`, which is why the
money maths, streak logic, statistics and insight rules can all be tested
directly rather than through a browser. `build.mjs` concatenates core, then
UI, then boot, into a single `<script>`.

Builds are reproducible — the service worker's cache version is a hash of the
content, not a timestamp — so CI can check the committed `index.html` actually
matches the source.

### Some things worth knowing before you change it

- **Money is integer pence, everywhere.** Summing a year of float pounds
  drifts.
- **Dates are local `YYYY-MM-DD` strings** and never round-trip through UTC.
  A British user in BST would otherwise watch their day flip an hour early.
  Day arithmetic compares at UTC noon so a DST boundary can't shift it.
- **`normalise()` must survive anything.** Corrupt storage, a hand-edited
  backup, an older schema — it always returns a state the UI can render, and
  drops keys that aren't real dates so nothing bad reaches a date loop.
- **Cadences use 52 weeks and 26 fortnights a year**, not 4 a month. That gap
  is about a month of rent over a working life.
- **Adding an insight?** Give it a minimum sample size, state that sample in
  the text, and phrase it as an association. There's a test that greps for
  causal language.

## Licence

Personal project. Do what you like with it.
