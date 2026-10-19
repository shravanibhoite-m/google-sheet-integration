# Multi-Sheet Picker — Plan

**Date:** 2026-10-19
**Scope:** Prototype. Extends `sheet-ui-bidirectional-plan.md`, which is already built.

## Problem

Today one spreadsheet id is hardcoded in `config.js`. A user cannot point the app
at a different sheet without editing code, and most users do not know what a
spreadsheet id is. We want the user to paste a normal Google Sheets link in the
UI, have that sheet appear in a saved list, and switch between sheets by clicking.

## High Level Solution

A **user-managed sheet list stored in the browser**, replacing the hardcoded id.

The pattern is *paste a URL → validate it against Google → remember it locally*.
Pasting a link is the only thing we ask of the user; the app derives the id, the
title and the tab names itself. Validation and labelling are the same single API
call, so adding a sheet costs one request and proves access at the same time.

`localStorage` holds the list. It is per browser and per device, which is the
correct trade for a prototype with no backend.

**Rejected:** a hardcoded array in `config.js` (user cannot change it), and Drive
API auto-discovery (needs the Drive API enabled plus a second OAuth scope).

### Module contracts

| File | Exports | Returns |
|---|---|---|
| `js/sheet-store.js` **new** | `loadSheets()` | `[{id, title, tabs, selectedTab}]` from `localStorage` |
| | `saveSheet(sheet)` | the updated list |
| | `removeSheet(id)` | the updated list |
| | `setSelectedTab(id, tabName)` | the updated list |
| | `extractSpreadsheetId(urlOrId)` | the id string, or `null` if unrecognisable |
| `js/sheets-api.js` | `fetchSpreadsheetInfo(id)` **new** | `{title, tabs: [name]}` |
| | `readRows(id, tabName)` | `[[cell]]` |
| | `appendRow(id, tabName, values)` | Google's response |
| | `updateRow(id, tabName, rowNumber, values)` | Google's response |
| | `deleteRow(id, tabName, rowNumber)` | Google's response |
| | `quoteSheetName(name)` **new, internal** | `'My Tab'` when the name needs quoting |
| `js/table.js` | `renderSheetList(sheets, selectedId)` | — |
| | `renderTabPicker(tabs, selectedTab)` | — |
| | `onAddSheet(cb)` `onSelectSheet(cb)` `onRemoveSheet(cb)` `onSelectTab(cb)` | — |
| | existing render/status functions | unchanged, now take a tab argument where needed |
| `js/app.js` | — (entry point) | owns the selected sheet and the poll timer |

### Ownership

`sheets-api.js` is the only file that calls `fetch`. `table.js` is the only file
that touches the DOM. `sheet-store.js` is the only file that touches
`localStorage` — it never calls Google and never touches the DOM.

### API calls and scope

| Action | Call | Count |
|---|---|---|
| Add a sheet | `GET /{id}?fields=properties.title,sheets.properties` | 1, once per add |
| Read rows | `GET /{id}/values/{tab}` | 1 per poll |
| Add row | `POST /{id}/values/{tab}:append` | 1 |
| Edit row | `PUT /{id}/values/{tab}!A{n}` | 1 |
| Delete row | `POST /{id}:batchUpdate` `deleteDimension` | 1 |

Scope stays `https://www.googleapis.com/auth/spreadsheets` — one consent covers
every sheet the user can already open. Polling stays at one read per 5 seconds
for the selected sheet only; unselected sheets cost nothing.

### Config

`config.js` keeps `CLIENT_ID` and `POLL_INTERVAL_MS`. `SPREADSHEET_ID` and
`SHEET_NAME` are removed — the list replaces them. `config.example.js` is updated
to match and stays committed; `config.js` stays gitignored.

### Failure modes

| Case | Behavior |
|---|---|
| Pasted text has no id in it | Status line: "That does not look like a Google Sheets link." Nothing saved. |
| `403` or `404` when adding | Status line names the sheet as inaccessible. Nothing saved. |
| Sheet already in the list | Select it instead of adding a duplicate. |
| `401` on any call | Existing behavior: clear token, show Sign in. |
| Selected sheet removed from the list | Select the first remaining sheet, or show the empty state. |
| `localStorage` unreadable or corrupt | Start with an empty list. Never crash on load. |

## Step by Step Approach

1. **`sheet-store.js`** — the five functions above over one `localStorage` key.
   `extractSpreadsheetId` accepts a full URL or a bare id.
   > Wrap the `localStorage` read in try/catch. Corrupt JSON must not break the page.

2. **`sheets-api.js`** — add `fetchSpreadsheetInfo`, add `quoteSheetName`, and
   change the four existing functions to take `spreadsheetId` and `tabName`.
   Replace the single `cachedSheetId` with a `Map` keyed by `id + tab`.
   > Tab names with a space or apostrophe break A1 notation unless quoted.

3. **`index.html`** — add a sidebar: an Add-sheet input with a button, the saved
   sheet list, and a tab dropdown that is hidden when a sheet has one tab.

4. **`table.js`** — render the sheet list and tab picker, expose the four new
   event hooks.

5. **`app.js`** — load the list on start, select the first sheet, reload on
   switch, clear `lastRenderedSnapshot` on every switch.
   > Without the clear, switching sheets shows the previous sheet's rows.

6. **`config.js` and `config.example.js`** — drop the two dead keys.

7. **`README.md`** — document the sidebar and that the list is per browser.

8. **Verify** — `node --check` on every module, the import-graph check, and all
   files serving 200 over `http://localhost:8000`.

## Cut for the Prototype

Same cuts as the parent plan still apply. These are specific to this feature:

| Cut | When you need it back |
|---|---|
| Syncing the sheet list across devices | More than one person, or more than one machine |
| Drive API auto-discovery of the user's sheets | Users should not have to find the link themselves |
| Reordering or renaming saved sheets | The list grows past a handful |

No tests, consistent with the parent plan.
