# Bidirectional Google Sheet UI — Prototype Plan

**Date:** 2026-10-19
**Scope:** Working prototype on a dummy sheet. Not production.

## Problem

Show a Google Sheet's rows on a local web page. Add, edit and delete rows from the page and have them land in the Sheet. Edits typed by hand in the Sheet appear on the page within about 5 seconds. No backend.

## High Level Solution

A **static page that calls the Google Sheets API directly, signed in as you.**

The pattern is *browser-side OAuth + polling read + direct write*. No server, no stored credentials. You sign in with your own Google account, so the Sheet's sharing settings are the only permission check.

**Tools:**

| Tool | Why |
| --- | --- |
| Google Identity Services (GIS) | Google's official browser sign-in. Gives an access token with no client secret and no server. |
| Sheets API v4 REST via `fetch` | Four endpoints cover everything. No SDK needed. |
| ES modules (`<script type="module">`) | Native browser imports. Real file separation with no bundler and no build step. |
| `uv run python -m http.server` | A plain file server so the page has a real `http://localhost` address. Serves files only — no logic, no secrets, not a backend. |

**Rejected:** Apps Script (better only if your users lacked Sheet access), API key (read-only, cannot write), service account (needs a secret, and a secret cannot live in a browser).

**You cannot open `index.html` straight from disk.** Google rejects `file://` as an OAuth origin, and ES modules are blocked there too. The small file server is required, not a preference.

## Folder Structure

The frontend is the whole application, so it lives at the root in its own folder. It never mixes with `src/`.

```
sheet_integration/
├── web/                         the entire app
│   ├── index.html               markup only — no inline JS, no inline CSS
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── config.example.js    committed template
│       ├── config.js            your real IDs — gitignored
│       ├── auth.js              Google sign-in and the access token
│       ├── sheets-api.js        the four Sheets API calls
│       ├── table.js             renders rows, reads the form
│       └── app.js               entry point — wires it together, owns the poll loop
├── docs/plans/                  these plans
└── src/                         existing FastAPI code — parked, unused
```

### What each file owns

The same layering the backend already uses in `README.md`, applied to the frontend.

| File | Owns | Never does |
| --- | --- | --- |
| `config.js` | The three values: client ID, spreadsheet ID, sheet range | Any logic |
| `auth.js` | Sign-in, the current token, the `401` path | Touch the Sheets API |
| `sheets-api.js` | `fetch` to Google, returns plain data | Touch the DOM |
| `table.js` | Drawing rows, reading input fields | Call Google |
| `app.js` | The poll timer and the wiring between the three | Hold business rules |

The rule is the backend's rule: **`sheets-api.js` is the only file that calls Google, `table.js` is the only file that touches the DOM.** Only `app.js` is loaded by `index.html`; everything else is imported.

### Naming rules

- Lowercase, hyphen-separated: `sheets-api.js`, not `sheetsAPI.js`.
- One job per filename. A file called `utils.js` or `helpers.js` means the job was never decided — do not create one.
- `config.example.js` is committed with placeholder values; `config.js` is gitignored. This matches the existing `.env.example` / `.env` pair.

## Four API Calls

| Action | Call |
| --- | --- |
| Read everything | `GET values/{range}` |
| Add a row | `POST values/{range}:append` with `insertDataOption=INSERT_ROWS` |
| Edit a row | `PUT values/{range}` on that row |
| Delete a row | `POST :batchUpdate` with `deleteDimension` |

Rows are addressed by their position in the sheet. Fine for one person on a dummy sheet.

## Two Details That Are Not Optional

Not scale concerns — skip them and the prototype breaks on day one.

1. **Pause polling while a field is focused.** Otherwise the 5-second refresh wipes whatever you are typing, mid-word.
2. **Handle the expired token.** Access tokens die after about an hour. On any `401`, show the Sign in button again. Three lines, and without it the page silently stops saving.

## Step by Step Approach

1. **Create the OAuth client.** Google Cloud Console → enable the Sheets API → create an OAuth **Web application** client → add `http://localhost:8000` as an authorized JavaScript origin.
   > Web application, not Desktop. Ignore the client secret; the browser never uses it.

2. **Set up the consent screen.** Add your own account as a test user.
   > Skip this and sign-in is blocked with "app not verified".

3. **Scaffold `web/`** exactly as laid out above, with empty files.

4. **Write `config.example.js`**, copy it to `config.js`, fill in your real IDs, and add `web/js/config.js` to `.gitignore`.

5. **`index.html`** — a table, an add-row form, a Sign in button, a status line. One script tag: `<script type="module" src="js/app.js">`.

6. **`auth.js`** — load GIS, call `initTokenClient` with scope `https://www.googleapis.com/auth/spreadsheets`, expose `signIn()` and `getToken()`.

7. **`sheets-api.js`** — one function per call: `readRows()`, `appendRow()`, `updateRow()`, `deleteRow()`. Each returns data or throws.

8. **`table.js`** — `renderRows()` draws the table, `readForm()` returns the new row.

9. **`app.js` read path** — sign in, read, render. Treat row 1 as headers.

10. **`app.js` poll loop** — every 5 seconds. Skip when the tab is hidden or an input is focused.

11. **Wire add, edit and delete** to their three API functions. Clear the form after an add; let the next poll confirm.

12. **Status line** — signed in or not, last synced time, any API error text. No silent failures.

13. **Run it.** `uv run python -m http.server 8000 --directory web`, then open `http://localhost:8000`.
    > Must be `localhost`, never the file path, or sign-in fails.

## Cut for the Prototype — Add Before Anyone Else Uses It

Each of these handles more than one person editing at once. On a dummy sheet with one user they earn nothing.

| Cut | Why it was there | When you need it back |
| --- | --- | --- |
| UUID `id` column, verify row before write | Sheets addresses rows by position. A delete shifts every row below, so a concurrent edit can hit the wrong row. | A second person starts editing |
| `updated_at` + check before overwrite | Stops two people silently overwriting each other | A second person starts editing |
| Retry with exponential backoff on `429`/`5xx` | Quota is 60 requests/min per user, 300/min per project | Real traffic, or more than ~25 open tabs |
| Silent token refresh before expiry | Smoother than re-clicking Sign in each hour | Anyone but you uses it |

Quota as built: 12 reads/min while the tab is open and focused, against a 60/min per-user limit. A single prototype user is comfortably clear.

Each of these lands in a file that already exists — concurrency control in `sheets-api.js`, token refresh in `auth.js`. The structure does not change when you harden it.

## Note on the Existing Code

`src/` holds a FastAPI app with routes, services and `tenacity`. A no-backend design does not use any of it. Leave it parked — no need to decide during a prototype.
