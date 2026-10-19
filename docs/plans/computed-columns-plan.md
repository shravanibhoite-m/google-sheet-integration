# Protect Computed Columns — Plan

**Date:** 2026-10-19
**Scope:** Prototype bug fix. Extends the two built plans in this folder.

## Problem

A real sheet generates some columns with formulas. In the user's sheet, `A2`
holds `=SEQUENCE(214)` and `B2` holds an `ARRAYFORMULA` of dates; both spill
down to row 215. Writing anything into that spill range blocks the formula,
collapses it to `#REF!`, and wipes all 214 generated values at once. That is
what happened when the app wrote a full row on Save.

`updateCells` already stops Save from touching cells the user did not edit. Two
holes remain:

1. The Sr No and Date boxes are still editable. Typing in one writes into the
   spill and breaks it again.
2. The Add form appends a row below the spill. On a sheet like this it produces
   an orphan row with no Sr No and no Date, because those are generated, not
   stored.

## High Level Solution

**Ask Google which columns are formulas, then make them untouchable.**

One read with `valueRenderOption=FORMULA` returns the raw cell contents instead
of displayed text. Any cell whose text starts with `=` marks its column as
computed. Computed columns render as disabled inputs, so they cannot be focused,
edited or sent. When a sheet has any computed column, the Add form is hidden —
appending to such a sheet is meaningless, since the rows already exist.

This is detection, not configuration. Nothing is hardcoded about columns A and
B; a sheet with no formulas behaves exactly as it does today.

**Rejected:** reading formulas on every poll (doubles quota for data that
changes rarely), and a hand-maintained list of protected columns in config
(users would have to know which columns are generated).

### Module contracts

| File | Export | Returns |
|---|---|---|
| `js/sheets-api.js` | `fetchComputedColumns(spreadsheetId, tabName)` **new** | `number[]` — zero-based indexes of columns containing a formula |
| `js/table.js` | `renderRows(headers, dataRows, computedColumns, handlers)` | — (signature gains one argument) |
| | `showAddForm(isVisible, note)` **new** | — |
| | `renderAddForm(headers)` | unchanged |
| `js/app.js` | — | holds `computedColumns` for the selected sheet and tab |

### Ownership

Unchanged. `sheets-api.js` is the only file that calls `fetch`, `table.js` the
only one that touches the DOM, `sheet-store.js` the only one that touches
`localStorage`.

### API calls and scope

| Action | Call | Count |
|---|---|---|
| Detect computed columns | `GET /{id}/values/{tab}?valueRenderOption=FORMULA` | 1 per sheet or tab selection |
| Everything else | unchanged | unchanged |

Scope stays `https://www.googleapis.com/auth/spreadsheets`. Polling stays at one
read per 5 seconds. The detection call does not run on poll, because a column
does not become a formula while the page sits open.

### Config

No change. `config.js` keeps `CLIENT_ID` and `POLL_INTERVAL_MS`.

### Failure modes

| Case | Behavior |
|---|---|
| Detection call fails | The error reaches the status line and the table is not rendered. Nothing is editable, so nothing can be damaged. |
| Sheet has no formulas | `computedColumns` is empty. Add form shows. Behavior identical to today. |
| Every column is computed | All inputs disabled, Add form hidden with its note. Read-only view. |
| A formula sits below row 2 only | Detected — every row is scanned, not just the first. |
| Tab switched | Detection re-runs for the new tab. Results are never reused across tabs. |

## Step by Step Approach

1. **`sheets-api.js`** — add `fetchComputedColumns`. Read the tab with
   `valueRenderOption=FORMULA`, scan every cell, collect the index of any column
   where a cell's text starts with `=`.
   > Scan all rows. Row 2 alone would miss a per-row formula in a column whose
   > first cell is blank.

2. **`table.js`** — `buildDataRow` takes the computed column list and sets
   `disabled` plus a `computed` class on those inputs. `readChangedCells` skips
   them. Add `showAddForm(isVisible, note)`.
   > `disabled`, not `readOnly`: a disabled input cannot be focused, so it can
   > never be typed into and never pauses the poll.

3. **`index.html`** — a note element under the Add form heading.

4. **`css/styles.css`** — muted styling for `.computed` inputs so it is obvious
   they are generated, not broken.

5. **`app.js`** — fetch computed columns when a sheet or tab is selected, store
   them, pass them to `renderRows`, and hide the Add form when the list is not
   empty.

6. **`README.md`** — document that generated columns are detected and locked.

7. **Verify** — `node --check` on every module, the import-graph check, the DOM
   id check, and all files serving 200.

## Cut for the Prototype

| Cut | When you need it back |
|---|---|
| Re-detecting formulas during polling | Someone edits formulas in the sheet while the page is open |
| Appending to the first editable column instead of hiding the Add form | A sheet has computed columns *and* genuinely needs new rows |
| Jumping to today's row on load | The 214-row sheet makes scrolling tedious |

No tests, consistent with the parent plans.
