// Entry point. Owns the selected sheet, the poll timer and the wiring.

import { POLL_INTERVAL_MS } from "./config.js";
import { initAuth, signIn, isSignedIn } from "./auth.js";
import {
  AuthExpiredError,
  appendRow,
  deleteRow,
  fetchComputedColumns,
  fetchSpreadsheetInfo,
  readRows,
  updateCells,
} from "./sheets-api.js";
import {
  extractSpreadsheetId,
  loadSheets,
  removeSheet,
  saveSheet,
  setSelectedTab,
} from "./sheet-store.js";
import {
  clearAddForm,
  clearSheetInput,
  isAnyFieldFocused,
  onAddSheet,
  onAddSubmit,
  onSelectTab,
  onSignInClick,
  renderAddForm,
  renderRows,
  renderSheetList,
  renderTabPicker,
  setStatus,
  showAddForm,
  showContent,
  showSignInButton,
  showWorkspace,
} from "./table.js";

const GENERATED_COLUMNS_NOTE =
  "This sheet generates some columns with formulas. Fill an existing row " +
  "instead of adding one — a new row would sit outside those formulas.";

let savedSheets = [];
let selectedSheetId = null;
let computedColumns = [];
let pollTimerId = null;
let lastRenderedSnapshot = "";

function getSelectedSheet() {
  return savedSheets.find((sheet) => sheet.id === selectedSheetId) ?? null;
}

function formatTime(date) {
  return date.toLocaleTimeString();
}

function stopPolling() {
  if (pollTimerId !== null) {
    clearInterval(pollTimerId);
    pollTimerId = null;
  }
}

function handleError(error) {
  if (error instanceof AuthExpiredError) {
    stopPolling();
    showWorkspace(false);
    showSignInButton(true);
    setStatus(error.message, true);
    return;
  }
  setStatus(error.message, true);
}

function drawSheetList() {
  renderSheetList(savedSheets, selectedSheetId, {
    onSelect: selectSheet,
    onRemove: forgetSheet,
  });
}

async function loadSheet() {
  const sheet = getSelectedSheet();
  if (!sheet) {
    showContent(false);
    setStatus("Add a sheet to get started.");
    return;
  }

  renderTabPicker(sheet.tabs, sheet.selectedTab);
  const rows = await readRows(sheet.id, sheet.selectedTab);

  if (rows.length === 0) {
    showContent(false);
    setStatus(`"${sheet.selectedTab}" is empty. Add a header row first.`, true);
    return;
  }

  const [headers, ...dataRows] = rows;

  // Redrawing identical data would throw away the user's cursor position.
  const snapshot = JSON.stringify(rows);
  if (snapshot !== lastRenderedSnapshot) {
    renderAddForm(headers);
    renderRows(headers, dataRows, computedColumns, {
      onSave: saveRow,
      onDelete: removeRow,
    });
    lastRenderedSnapshot = snapshot;
  }

  showContent(true);
  const hasComputedColumns = computedColumns.length > 0;
  showAddForm(!hasComputedColumns, hasComputedColumns ? GENERATED_COLUMNS_NOTE : "");
  setStatus(
    `${sheet.title} · ${dataRows.length} rows · synced ${formatTime(new Date())}`,
  );
}

async function refresh() {
  try {
    await loadSheet();
  } catch (error) {
    handleError(error);
  }
}

// Which columns are generated only changes when the sheet or tab changes, so
// this runs on selection and never on the poll.
async function reloadSelection() {
  showContent(false);
  lastRenderedSnapshot = "";
  try {
    const sheet = getSelectedSheet();
    computedColumns = sheet
      ? await fetchComputedColumns(sheet.id, sheet.selectedTab)
      : [];
    await loadSheet();
  } catch (error) {
    handleError(error);
  }
}

function pollSheet() {
  if (document.hidden || isAnyFieldFocused() || !isSignedIn()) {
    return;
  }
  refresh();
}

async function addSheet(pastedText) {
  const spreadsheetId = extractSpreadsheetId(pastedText);
  if (!spreadsheetId) {
    setStatus("That does not look like a Google Sheets link.", true);
    return;
  }

  if (savedSheets.some((sheet) => sheet.id === spreadsheetId)) {
    clearSheetInput();
    await selectSheet(spreadsheetId);
    return;
  }

  try {
    setStatus("Checking the sheet…");
    const { title, tabs } = await fetchSpreadsheetInfo(spreadsheetId);
    savedSheets = saveSheet({
      id: spreadsheetId,
      title,
      tabs,
      selectedTab: tabs[0],
    });
    clearSheetInput();
    await selectSheet(spreadsheetId);
  } catch (error) {
    handleError(error);
  }
}

async function selectSheet(spreadsheetId) {
  selectedSheetId = spreadsheetId;
  drawSheetList();
  await reloadSelection();
}

async function forgetSheet(spreadsheetId) {
  savedSheets = removeSheet(spreadsheetId);
  if (selectedSheetId === spreadsheetId) {
    selectedSheetId = savedSheets[0]?.id ?? null;
    lastRenderedSnapshot = "";
  }
  drawSheetList();
  await reloadSelection();
}

async function selectTab(tabName) {
  savedSheets = setSelectedTab(selectedSheetId, tabName);
  await reloadSelection();
}

async function addRow(values) {
  const sheet = getSelectedSheet();
  try {
    setStatus("Adding…");
    await appendRow(sheet.id, sheet.selectedTab, values);
    clearAddForm();
    await loadSheet();
  } catch (error) {
    handleError(error);
  }
}

async function saveRow(rowNumber, changedCells) {
  if (changedCells.length === 0) {
    setStatus(`Row ${rowNumber} has no changes.`);
    return;
  }

  const sheet = getSelectedSheet();
  try {
    setStatus(`Saving ${changedCells.length} cell(s) in row ${rowNumber}…`);
    await updateCells(sheet.id, sheet.selectedTab, rowNumber, changedCells);
    lastRenderedSnapshot = "";
    await loadSheet();
  } catch (error) {
    handleError(error);
  }
}

async function removeRow(rowNumber) {
  const sheet = getSelectedSheet();
  try {
    setStatus(`Deleting row ${rowNumber}…`);
    await deleteRow(sheet.id, sheet.selectedTab, rowNumber);
    lastRenderedSnapshot = "";
    await loadSheet();
  } catch (error) {
    handleError(error);
  }
}

async function startSession() {
  try {
    setStatus("Signing in…");
    await signIn();
    showSignInButton(false);
    showWorkspace(true);

    savedSheets = loadSheets();
    selectedSheetId = savedSheets[0]?.id ?? null;
    drawSheetList();
    await reloadSelection();

    stopPolling();
    pollTimerId = setInterval(pollSheet, POLL_INTERVAL_MS);
  } catch (error) {
    showSignInButton(true);
    handleError(error);
  }
}

async function start() {
  onSignInClick(startSession);
  onAddSheet(addSheet);
  onSelectTab(selectTab);
  onAddSubmit(addRow);

  try {
    await initAuth();
    showSignInButton(true);
    setStatus("Ready. Sign in to load your sheets.");
  } catch (error) {
    showSignInButton(false);
    setStatus(error.message, true);
  }
}

start();
