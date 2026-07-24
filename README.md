# 🎮 FlipTracker

A fast, offline-first toolkit for a **UK eBay reseller** — built around retro gaming
(PS1, PS2, Mega Drive, Nintendo, handhelds) but happy with general job lots too.

Everything runs in the browser. No backend, no sign-in, no data leaves your device.
All money is in **GBP**. Designed for a phone in one hand at a car boot: dark theme,
big tap targets, big readable numbers.

## Just want to use it?

Open **`index.html`** in any browser — that's the whole app. It is completely
self-contained (React, styling and app code are all inlined), so it works with
**no internet connection**. On a phone, open it once and use *Add to Home Screen*
for one-tap access.

Your data is saved in the browser's `localStorage` on that device. Use
**Settings → Export backup** to save a JSON file, and *Import backup* to restore it
(or move it to another phone). Clearing your browser data will wipe it, so back up now and then.

## What's inside

1. **Deal Calculator** — enter what you'd pay, expected resale, postage and packaging.
   It works out the eBay final value fee (default 13% of sale + postage, plus the fixed
   order fee), your **net profit**, **profit margin %** and **ROI**, and gives a plain
   **GO / NO GO** verdict against your minimum-margin threshold (default 30%, configurable).
   A toggle switches between *buyer pays postage* and *free postage (you absorb it)*.
   One tap saves the item straight into your inventory as unsold stock.

2. **Inventory Tracker** — log each item (category, purchase price/date, source, status,
   listing/sale price and date). Live totals show **capital tied up in unsold stock**,
   **profit realised**, **average margin** and **average days-to-sell**.

3. **Listing Generator** — enter the item and condition notes; get a keyword-optimised
   eBay **title (≤ 80 chars)** and a full **description** with condition disclosure,
   postage info and a returns policy. One-tap copy for each.

4. **Dashboard** — this month's profit, items in stock, and best / worst performing
   category, plus all-time realised profit.

## Fees & assumptions

- eBay final value fee: **13%** of the total the buyer pays (sale price + any postage
  they pay), plus a **£0.30** fixed order fee. Both are editable in **Settings**.
- Margin is net profit ÷ what the buyer pays. ROI is net profit ÷ your buy price.
- These are sensible defaults, not official figures — tweak them to match your own
  eBay category/account in Settings.

## Rebuilding from source (optional — for developers)

The app you run is the generated `index.html`. To regenerate it after editing the source:

```bash
npm install
npm run build
```

- Source lives in **`src/app.jsx`** (React + hooks) and **`src/styles.css`** (Tailwind).
- **`build.mjs`** compiles Tailwind, transpiles the JSX with Babel, and inlines React,
  the CSS and the app into a single self-contained `index.html`.
- Styling is **Tailwind CSS**, dark theme, mobile-first.
