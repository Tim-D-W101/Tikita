# Tikita on the PC

A window that opens the published register, installed on the one PC that
keeps the records.

The app itself is **not** inside this installer. The window opens the site
published by `.github/workflows/pages.yml`, so anything changed and pushed is
on the PC the next time the window is opened — no reinstall, nothing to
re-download, no signing certificate. The service worker in the web app keeps
a copy of itself on the PC, so it still opens when the office loses its
connection.

That means this shell almost never changes. Rebuild it only when a file in
this folder changes.

## Getting the installer

**From GitHub** — Actions → *Build desktop app* → **Run workflow**. When it
finishes, download the `tikita-windows-installer` artifact and unzip it. To
keep a permanent copy instead, push a tag:

```sh
git tag desktop-v1.0.0 && git push origin desktop-v1.0.0
```

The installer is then attached to a release.

**On a Windows PC with Node installed**

```sh
cd desktop
npm install
npm run dist          # dist\Tikita Setup 1.0.0.exe
```

`npm run dist:mac` and `npm run dist:linux` are there too, and must each be
run on that operating system.

## Installing it

Run `Tikita Setup 1.0.0.exe`. It installs for the current user, so it needs no
administrator password, and puts Tikita on the desktop and in the Start menu.

The installer is not signed, so Windows shows **"Windows protected your PC"**
the first time: *More info* → *Run anyway*. Signing it would need a code
signing certificate, bought yearly — worth it if you hand the file to other
people, unnecessary for one PC you install yourself.

## First run

The window opens whatever address is built in — by default
`https://tim-d-w101.github.io/tikita/`. If the site lives somewhere else, or
it cannot be reached, a setup screen asks for the address and remembers it.
It can be changed later from **File → Change app address…**.

Then enter the company code in the app, exactly as on the phones: *the status
chip in the top bar → Connect*. The PC then holds every site, worker and
record the phones hold, and keeps holding them.

Setting `TIKITA_URL` in the environment overrides the saved address, which is
handy for pointing a test install at a local server.

## Day to day

| | |
|---|---|
| **Ctrl+R** | Reload — takes whatever was last published |
| **Ctrl+Shift+R** | Reload ignoring the saved copy, if something looks stale |
| **Ctrl+= / Ctrl+-** | Bigger or smaller, remembered between sessions |

Only one window opens at a time: two windows editing the same stored records
is a good way to lose a day's marks. The window remembers its size and
position.

## Wide screen

The register lays itself out for a monitor at 900px and wider, and a
**Records** tab appears — a month at a time, workers down the side and days
across the top, where earlier days are corrected. That is the web app's doing,
not this shell's, so the same thing happens in a browser on the same PC.

## What is in here

| File | What it does |
|---|---|
| `main.js` | Opens the window, keeps it on the published site, builds the menu |
| `preload.js` | The only bridge to the page: tells it that it is on the desktop |
| `setup.html` | Asks for the address when the site cannot be opened |
| `package.json` | Dependencies and the electron-builder settings |

The page is loaded from the web, so it is treated as untrusted: context
isolation on, Node off, sandbox on, no permissions granted, and links to
anywhere else open in the real browser instead of in the window.

## The alternative, with nothing to install

Microsoft Edge is already on the PC and can install the site as a desktop app
by itself: open the address in Edge, then **… → Apps → Install this site as an
app**. It gets its own window, its own icon and the same automatic updates.
It has no menu bar and no setup screen, but there is nothing to build and
nothing for Windows to warn about — a reasonable way to start.
