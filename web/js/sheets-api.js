// The only file that talks to Google. Returns plain data, never touches the DOM.

import { getToken, clearToken } from "./auth.js";

const BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";

export class AuthExpiredError extends Error {}

// deleteDimension needs the numeric sheet id, not the tab name. Ids never
// change while the page is open, so keep them keyed by spreadsheet and tab.
const sheetIdCache = new Map();

function cacheKey(spreadsheetId, tabName) {
  return `${spreadsheetId}::${tabName}`;
}

// A1 notation treats spaces and apostrophes as syntax. Quoting always is
// valid, so there is no need to test whether this particular name needs it.
function quoteSheetName(tabName) {
  return `'${tabName.replace(/'/g, "''")}'`;
}

function encodeRange(tabName, suffix = "") {
  return encodeURIComponent(`${quoteSheetName(tabName)}${suffix}`);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 401) {
    clearToken();
    throw new AuthExpiredError("Session expired. Sign in again.");
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google API ${response.status}: ${body.slice(0, 200)}`);
  }

  return response.json();
}

export async function fetchSpreadsheetInfo(spreadsheetId) {
  const url = `${BASE_URL}/${spreadsheetId}?fields=properties.title,sheets.properties`;
  const result = await requestJson(url);

  result.sheets.forEach((sheet) => {
    const { title, sheetId } = sheet.properties;
    sheetIdCache.set(cacheKey(spreadsheetId, title), sheetId);
  });

  return {
    title: result.properties.title,
    tabs: result.sheets.map((sheet) => sheet.properties.title),
  };
}

async function getSheetId(spreadsheetId, tabName) {
  const key = cacheKey(spreadsheetId, tabName);
  if (!sheetIdCache.has(key)) {
    await fetchSpreadsheetInfo(spreadsheetId);
  }
  const sheetId = sheetIdCache.get(key);
  if (sheetId === undefined) {
    throw new Error(`Tab "${tabName}" no longer exists in this sheet.`);
  }
  return sheetId;
}

// FORMULA rendering returns the raw cell contents instead of the displayed
// text, which is the only way to tell a generated column from a typed one.
export async function fetchComputedColumns(spreadsheetId, tabName) {
  const url =
    `${BASE_URL}/${spreadsheetId}/values/${encodeRange(tabName)}` +
    "?valueRenderOption=FORMULA";
  const result = await requestJson(url);

  const computedColumns = new Set();
  (result.values ?? []).forEach((row) => {
    row.forEach((cell, columnIndex) => {
      if (typeof cell === "string" && cell.startsWith("=")) {
        computedColumns.add(columnIndex);
      }
    });
  });

  return [...computedColumns].sort((first, second) => first - second);
}

export async function readRows(spreadsheetId, tabName) {
  const url = `${BASE_URL}/${spreadsheetId}/values/${encodeRange(tabName)}`;
  const result = await requestJson(url);
  return result.values ?? [];
}

export async function appendRow(spreadsheetId, tabName, values) {
  const url =
    `${BASE_URL}/${spreadsheetId}/values/${encodeRange(tabName)}:append` +
    "?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS";
  return requestJson(url, {
    method: "POST",
    body: JSON.stringify({ values: [values] }),
  });
}

function columnLetter(columnIndex) {
  let letter = "";
  let remaining = columnIndex;
  do {
    letter = String.fromCharCode(65 + (remaining % 26)) + letter;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return letter;
}

// Only the edited cells are sent. Writing a whole row would overwrite the
// formulas in cells the user never touched with their displayed text.
export async function updateCells(spreadsheetId, tabName, rowNumber, cells) {
  const url = `${BASE_URL}/${spreadsheetId}/values:batchUpdate`;
  return requestJson(url, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: cells.map(({ columnIndex, value }) => ({
        range: `${quoteSheetName(tabName)}!${columnLetter(columnIndex)}${rowNumber}`,
        values: [[value]],
      })),
    }),
  });
}

export async function deleteRow(spreadsheetId, tabName, rowNumber) {
  const sheetId = await getSheetId(spreadsheetId, tabName);
  const url = `${BASE_URL}/${spreadsheetId}:batchUpdate`;
  return requestJson(url, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    }),
  });
}
