# Sheet Integration

A web page that shows one Google Sheet and lets you add, edit and delete rows.
Changes made by hand in the Sheet appear on the page within about 5 seconds.

**There is no backend.** The page is plain HTML and JavaScript. It signs you in
with your own Google account and calls the Google Sheets API straight from the
browser. Python is here only to serve the static files.

## Folder structure

```
web/                      the entire app
  index.html              markup only - no inline JS, no inline CSS
  css/
    styles.css
  js/
    config.example.js     committed template
    config.js             your client ID - gitignored
    auth.js               Google sign-in and the access token
    sheets-api.js         every Sheets API call
    sheet-store.js        the saved sheet list, in localStorage
    table.js              renders the UI, reads the forms
    app.js                entry point - poll loop and wiring

docs/plans/               design plans
.claude/commands/         /architect and /do-it
```

**The rule:** `sheets-api.js` is the only file that calls Google, `table.js` is
the only file that touches the DOM, `sheet-store.js` is the only file that
touches `localStorage`, and `app.js` wires them together. Only `app.js` is
loaded by `index.html` - everything else is an ES module import.

## Using it

Sign in, then paste a Google Sheets link into **Your sheets** in the sidebar.
The app reads the sheet's real title and tab names from Google, which also
proves you have access, and saves it to the list. Click a saved sheet to open
it. Sheets with more than one tab show a tab dropdown.

The list lives in `localStorage`, so it is **per browser and per device**. It
survives a refresh but does not follow you to another machine.

## Setup

**1. Google Cloud Console**

| Step | Where |
| --- | --- |
| Enable the Google Sheets API | APIs & Services → Library |
| Create an OAuth client, type **Web application** | APIs & Services → Credentials |
| Add `http://localhost:8000` to Authorized JavaScript origins | same screen |
| Add your Google account as a test user | OAuth consent screen → Audience |

Desktop-type clients do not work in a browser. The origin must have no trailing
slash.

**2. Local config**

```bash
cp web/js/config.example.js web/js/config.js
```

Fill in `CLIENT_ID`. That is the only value you need - sheets are added from
the UI, not from config. `config.js` is gitignored.

**3. Your sheets**

Row 1 of each tab must hold the column headers. The Add form is built from them.

## Run

```bash
uv run python -m http.server 8000 --directory web
```

Open http://localhost:8000 and click **Sign in with Google**.

Opening `index.html` from disk does not work. Google rejects `file://` as an
OAuth origin, and ES modules are blocked there too. The file server is required.

## How it works

| Action | Sheets API call |
| --- | --- |
| Add a sheet to the list | `GET /{id}?fields=properties.title,sheets.properties` |
| Read everything | `GET values/{range}` |
| Add a row | `POST values/{range}:append` |
| Detect generated columns | `GET values/{range}?valueRenderOption=FORMULA` |
| Edit a row | `POST values:batchUpdate` — only the cells you changed |
| Delete a row | `POST :batchUpdate` with `deleteDimension` |

Scope: `https://www.googleapis.com/auth/spreadsheets`.

The page re-reads the sheet every 5 seconds. Polling pauses when the tab is
hidden or when you are typing in a field, so a refresh never wipes your input.
That is 12 reads per minute against a 60/minute per-user limit.

## Generated columns

Columns produced by a formula - an `ARRAYFORMULA`, a `SEQUENCE`, anything
starting with `=` - are detected when you open a sheet and locked in the UI.
They show greyed out and cannot be edited, and the Add form is hidden.

This is not cosmetic. An open-ended array formula owns its whole column, and
writing a single value into that range blocks the formula and collapses every
generated value to `#REF!`. The app never writes to those cells.

## Prototype limits

This is a prototype on a dummy sheet. Before anyone else uses it, see
`docs/plans/sheet-ui-bidirectional-plan.md` - it lists what was deliberately cut
and when each piece needs adding back:

- Rows are addressed by position, so a concurrent delete can misdirect an edit.
- No retry or backoff on `429` and `5xx`.
- No silent token refresh. After about an hour you sign in again.
- Delete has no confirmation step.
