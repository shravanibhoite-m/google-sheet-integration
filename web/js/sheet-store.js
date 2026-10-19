// The only file that touches localStorage. Never calls Google, never touches
// the DOM. A stored sheet is { id, title, tabs, selectedTab }.

const STORAGE_KEY = "sheet-integration.sheets";
const SPREADSHEET_URL_PATTERN = /\/spreadsheets\/d\/([A-Za-z0-9-_]+)/;
const BARE_ID_PATTERN = /^[A-Za-z0-9-_]{20,}$/;

export function extractSpreadsheetId(urlOrId) {
  const trimmed = urlOrId.trim();
  const fromUrl = trimmed.match(SPREADSHEET_URL_PATTERN);
  if (fromUrl) {
    return fromUrl[1];
  }
  return BARE_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function loadSheets() {
  // Private mode and cleared site data both make this throw or return junk.
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function persist(sheets) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sheets));
  return sheets;
}

export function saveSheet(sheet) {
  const others = loadSheets().filter((saved) => saved.id !== sheet.id);
  return persist([...others, sheet]);
}

export function removeSheet(spreadsheetId) {
  return persist(loadSheets().filter((saved) => saved.id !== spreadsheetId));
}

export function setSelectedTab(spreadsheetId, tabName) {
  const updated = loadSheets().map((saved) =>
    saved.id === spreadsheetId ? { ...saved, selectedTab: tabName } : saved,
  );
  return persist(updated);
}
