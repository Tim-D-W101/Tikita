# Tikita — worker attendance

A phone-first attendance register. At the end of each day you tick every worker
present or absent, add any extra hours they worked, and when you need the
records on a PC you export them as a real Excel file.

It installs to your home screen, works with no signal, and keeps all data on
your own device — there is no server and no account.

---

## Using it day to day

**Today** — the register. Pick the date (it opens on today), pick a team, or
**All teams** to see every crew on one screen.

Each team has a header with an **All present** button: one tap marks that whole
crew present. That is normally the fastest way in — tap the team, then switch
the few absentees to **A**. The header shows *"2 of 3 present"* so you can see
at a glance which crews are done. When a whole team is already present the
button turns green; tapping it then clears that team, after a confirm.

Individual workers are **P** / **A**. Tapping the choice again clears it, so a
mis-tap is easy to undo. When someone is marked present an **extra hours** field
appears under their name; leave it at 0 for a normal day, or use −/+ (half-hour
steps) or type a number for overtime.

**Fill in the rest present** marks everyone still unmarked, across whichever
teams are on screen.

**Workers** — your sites and crews. Add a site first, then add workers to it.
*Rename* changes a site or a worker's name at any time and keeps all their
records, so a crew can go in under a placeholder name and be named properly
later. *Remove* takes a worker off the daily list but keeps their past records,
and they still appear in exports; *Restore* puts them back.

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

## Several phones

Tap the status chip in the top bar to open **Share with other phones**. Type the
company code and that phone joins: same teams, same workers, same attendance
records as every other phone with that code.

The chip always says where things stand — *This phone only*, *Synced*,
*3 waiting*, *Syncing…* or *Not synced*.

Marking attendance never waits for signal. Changes are written to the phone
first and queued; they go up the moment there is a connection, and other
phones' changes come down at the same time. A phone that spends the whole day
out of range loses nothing.

Each supervisor is expected to mark their own team, so two people are not
editing the same worker. Where two phones do touch the same record, the later
change wins — the server decides which was later, so a phone with a wrong clock
cannot overwrite newer work.

Ask whoever set the app up for the code; it is deliberately not stored in this
repository. Anyone holding it can read and change your attendance records, so
treat it like a key. To move a company onto a fresh code, change `join_code` in
the `workspaces` table and re-enter the new code on each phone.

## Back up your records

Once phones are connected, the shared database is itself a backup — a lost
phone costs you nothing, because its records are on the others too.

Until then, records live only in this phone's browser storage. If you lose the
phone, or clear the browser's site data, **the records go with it.**

**Export → Backup → Save backup** writes a small `.json` file holding
everything. Send it to yourself the same way you send the Excel file, and keep
it somewhere safe. **Restore backup** loads one back — on a new phone, or after
a mishap. Restoring replaces whatever is currently on the device.

Exporting the Excel file regularly is itself a decent backup of the numbers;
the JSON backup is the one that can be loaded back into the app.

## Setting up a list of workers

Typing a large crew in on a phone is slow, so a list can be prepared as a file
and loaded in one go. **Export → Add a ready-made list → Add sites & workers**
takes a backup file and adds the sites and workers this phone does not have
yet. Unlike *Restore backup* it changes nothing else: attendance records are
ignored, and a site or worker whose name is already on this phone is skipped
rather than added twice. Loading the same file again is therefore harmless.

`roster/tikita-roster-september-2026.json` in this repository is the crew
transcribed from the September 2026 paper register — 16 sites, 102 workers, no
records. Download it on the phone and load it with that button. Five of its
sites are named `Group 1` to `Group 5` because the register's margin gives no
heading for those crews; rename them on the **Workers** screen once you know
what they are called.

---

## Hosting it

The app is plain HTML, CSS and JavaScript with no build step and no
dependencies — publish the files as they are.

Pages has to be switched on once by hand. A workflow's own token is not
allowed to switch it on, so this cannot be automated from the repository.

1. **The repository must be public**, unless the account is on a paid plan —
   on GitHub Free, a private repository cannot publish a Pages site.
   *Settings → General → Danger Zone → Change repository visibility.*
2. *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
3. Push to the default branch, or re-run the latest workflow from the
   **Actions** tab.

The workflow in `.github/workflows/pages.yml` then publishes the site, and the
run's summary shows the URL (`https://<user>.github.io/<repo>/`). Until step 2
is done, that workflow fails at "Create Pages site" — that is expected, not a
problem with the app.

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
| `sync.js` | Talks to the shared database; queues changes made offline |
| `sw.js` | Service worker — caches the app shell for offline use |
| `roster/` | Prepared worker lists, loaded through *Add sites & workers* |
| `manifest.webmanifest` | Makes it installable |

Data is one object in `localStorage` under `tikita.v1`:

```js
{
  sites:   [{ id, name }],
  workers: [{ id, siteId, name, active }],
  records: { '2026-09-15': { workerId: { s: 'P', x: 1.5 } } },  // s: 'P'|'A', x: extra hours
  sync:    { code, name, lastNow, lastSyncedAt, lastError },
  pending: { sites: {}, workers: {}, marks: {} }                // owed to the other phones
}
```

The phone is always the source of truth for its own unsent changes: a pulled
row is ignored while the same record sits in `pending`, so a sync can never
undo something you just tapped.

### The shared database

Supabase Postgres. Tables are unreachable through the API — row level security
is on with no policies — and all access goes through three `SECURITY DEFINER`
functions that check the company code first:

| Function | Does |
|---|---|
| `tikita_join(code)` | Confirms a code and returns the company name |
| `tikita_pull(code, since)` | Everything changed since that moment |
| `tikita_push(code, payload)` | Upserts this phone's changes, server-stamped |

Deletions travel as tombstones (`deleted: true`) so a removal on one phone
reaches the others instead of reappearing on the next sync. The project URL and
publishable key in `sync.js` are public by design; the company code is the
secret.

Every change is written immediately — a phone can be locked or swiped away a
moment after a tap, so nothing is deferred.

`xlsx.js` writes the spreadsheet by hand: the XML parts of an OOXML workbook
packed into an uncompressed zip. That keeps the app dependency-free and lets
the export work with no network. It is deliberately minimal — one sheet, inline
strings, a fixed style table — which is all this app needs.

### Changing the app

Edit the files and push. The deploy workflow publishes them, and an installed
phone picks the change up the next time it opens the app — no reinstall.

The service worker is network-first with a 2.5 second timeout: with signal it
always takes the newly deployed files, and without signal (or on a bad one) it
falls back to the last cached copy instead of hanging. Attendance records are
never touched by an update; they live in `localStorage`, separate from the
cache.

Bump `CACHE` in `sw.js` when you **add or remove** a file in the `ASSETS` list,
so the pre-cache matches what the app actually loads.
