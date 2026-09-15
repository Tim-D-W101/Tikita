# Tikita — worker attendance

A phone-first attendance register. At the end of each day you tick every worker
present or absent, add any extra hours they worked, and when you need the
records on a PC you export them as a real Excel file.

It installs to your home screen, works with no signal, and keeps all data on
your own device — there is no server and no account.

---

## Using it day to day

**Today** — the register. Pick the date (it opens on today), pick the site, then
tap **P** or **A** for each worker. Tapping the choice again clears it, so a
mis-tap is easy to undo. When someone is marked present an **extra hours** field
appears under their name; leave it at 0 for a normal day, or use −/+ (half-hour
steps) or type a number for overtime.

**Mark all present** fills in everyone not yet marked, which is usually the
fastest way in: tap it, then switch the few absentees to **A**.

**Workers** — your sites and crews. Add a site first, then add workers to it.
*Remove* takes a worker off the daily list but keeps their past records, and
they still appear in exports; *Restore* puts them back.

**Export** — pick a period and a site, then **Export Excel file**. On a phone
this opens the share sheet, so you can send the file to yourself on WhatsApp,
email or Drive and open it on your PC. On a PC it downloads straight away.

## What the Excel file looks like

One sheet, laid out like a payroll timesheet: workers down the left, one column
per day across the top, grouped under a heading per site.

| | 1 | 2 | 3 | … | Present | Absent | Extra hrs |
|---|---|---|---|---|---|---|---|
| Aisha Mensah | P | A | P+1.5 | | 18 | 3 | 6.5 |

- **P** — present
- **A** — absent
- **P+1.5** — present, with 1.5 extra hours
- blank — not marked that day

Each site gets a subtotal row, and there is an all-sites total when you export
more than one. The top row and the worker column stay frozen as you scroll, and
the totals are real numbers, so you can use them in formulas.

## Back up your records

Records live in this phone's browser storage. If you lose the phone, or clear
the browser's site data, **the records go with it.**

**Export → Backup → Save backup** writes a small `.json` file holding
everything. Send it to yourself the same way you send the Excel file, and keep
it somewhere safe. **Restore backup** loads one back — on a new phone, or after
a mishap. Restoring replaces whatever is currently on the device.

Exporting the Excel file regularly is itself a decent backup of the numbers;
the JSON backup is the one that can be loaded back into the app.

---

## Hosting it

The app is plain HTML, CSS and JavaScript with no build step and no
dependencies — publish the files as they are.

Pushing to the default branch is all it takes. The workflow in
`.github/workflows/pages.yml` turns GitHub Pages on the first time it runs and
publishes the site, so there is nothing to set up in repository settings. The
run's summary shows the URL (`https://<user>.github.io/<repo>/`).

GitHub Pages needs the repository to be **public** unless the account is on a
paid plan — on GitHub Free, a private repository cannot publish a Pages site.

### Installing on the phone

Open that URL on the phone once, with signal, so the app can cache itself.

- **Android / Chrome** — tap the **Install** button in the top bar, or the
  browser menu → *Add to Home screen*.
- **iPhone / Safari** — Share → *Add to Home Screen*. (Safari only offers this
  from Safari itself, not from Chrome or an in-app browser.)

After that it opens from the home-screen icon like any other app and works
offline. It must be served over `https://` — opening the files directly from
disk (`file://`) disables installation and offline support.

## Running it locally

```sh
npx http-server -p 8000 .     # then open http://localhost:8000
```

Any static file server will do; the app needs no build.

## How it is put together

| File | What it does |
|---|---|
| `index.html` | All three screens; they are shown and hidden, not routed |
| `app.js` | State, storage, rendering, and the Excel layout |
| `xlsx.js` | A small self-contained `.xlsx` writer (no library) |
| `sw.js` | Service worker — caches the app shell for offline use |
| `manifest.webmanifest` | Makes it installable |

Data is one object in `localStorage` under `tikita.v1`:

```js
{
  sites:   [{ id, name }],
  workers: [{ id, siteId, name, active }],
  records: { '2026-09-15': { workerId: { s: 'P', x: 1.5 } } }   // s: 'P'|'A', x: extra hours
}
```

Every change is written immediately — a phone can be locked or swiped away a
moment after a tap, so nothing is deferred.

`xlsx.js` writes the spreadsheet by hand: the XML parts of an OOXML workbook
packed into an uncompressed zip. That keeps the app dependency-free and lets
the export work with no network. It is deliberately minimal — one sheet, inline
strings, a fixed style table — which is all this app needs.

### Changing the app

Edit the files and push. One thing to remember: **bump `CACHE` in `sw.js`**
whenever you change `index.html`, `app.css`, `app.js` or `xlsx.js`, otherwise
phones that already installed the app keep serving the old cached copy.
