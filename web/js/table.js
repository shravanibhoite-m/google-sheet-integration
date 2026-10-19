// The only file that touches the DOM. Never calls Google.

const statusElement = document.getElementById("status");
const signInButton = document.getElementById("sign-in-button");
const workspace = document.getElementById("workspace");
const addSheetForm = document.getElementById("add-sheet-form");
const sheetUrlInput = document.getElementById("sheet-url-input");
const sheetList = document.getElementById("sheet-list");
const noSheetsMessage = document.getElementById("no-sheets-message");
const tabPickerRow = document.getElementById("tab-picker-row");
const tabPicker = document.getElementById("tab-picker");
const addSection = document.getElementById("add-section");
const addFormNote = document.getElementById("add-form-note");
const addForm = document.getElementById("add-form");
const addFields = document.getElementById("add-fields");
const tableSection = document.getElementById("table-section");
const tableHead = document.querySelector("#sheet-table thead");
const tableBody = document.querySelector("#sheet-table tbody");
const emptyMessage = document.getElementById("empty-message");

// Row 1 of the sheet holds the headers, so data row 0 is sheet row 2.
const FIRST_DATA_ROW_NUMBER = 2;

export function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

export function showSignInButton(isVisible) {
  signInButton.hidden = !isVisible;
}

export function showWorkspace(isVisible) {
  workspace.hidden = !isVisible;
}

export function showContent(isVisible) {
  tableSection.hidden = !isVisible;
  if (!isVisible) {
    addSection.hidden = true;
    addFormNote.hidden = true;
  }
}

export function showAddForm(isVisible, note = "") {
  addSection.hidden = !isVisible;
  addFormNote.textContent = note;
  addFormNote.hidden = note === "";
}

export function onSignInClick(callback) {
  signInButton.addEventListener("click", callback);
}

export function onAddSheet(callback) {
  addSheetForm.addEventListener("submit", (event) => {
    event.preventDefault();
    callback(sheetUrlInput.value);
  });
}

export function clearSheetInput() {
  sheetUrlInput.value = "";
}

export function onSelectTab(callback) {
  tabPicker.addEventListener("change", () => callback(tabPicker.value));
}

export function onAddSubmit(callback) {
  addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    callback(readAddForm());
  });
}

// Polling must not redraw a field the user is typing in.
export function isAnyFieldFocused() {
  return document.activeElement?.tagName === "INPUT";
}

function buildSheetListItem(sheet, isSelected, handlers) {
  const item = document.createElement("li");
  item.className = isSelected ? "sheet-item selected" : "sheet-item";

  const selectButton = document.createElement("button");
  selectButton.type = "button";
  selectButton.className = "sheet-name";
  selectButton.textContent = sheet.title;
  selectButton.addEventListener("click", () => handlers.onSelect(sheet.id));

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "danger";
  removeButton.textContent = "×";
  removeButton.setAttribute("aria-label", `Remove ${sheet.title}`);
  removeButton.addEventListener("click", () => handlers.onRemove(sheet.id));

  item.append(selectButton, removeButton);
  return item;
}

export function renderSheetList(sheets, selectedId, handlers) {
  const items = sheets.map((sheet) =>
    buildSheetListItem(sheet, sheet.id === selectedId, handlers),
  );
  sheetList.replaceChildren(...items);
  noSheetsMessage.hidden = sheets.length > 0;
}

export function renderTabPicker(tabs, selectedTab) {
  // A single-tab sheet has nothing to choose, so the control stays hidden.
  tabPickerRow.hidden = tabs.length < 2;

  const options = tabs.map((tabName) => {
    const option = document.createElement("option");
    option.value = tabName;
    option.textContent = tabName;
    option.selected = tabName === selectedTab;
    return option;
  });
  tabPicker.replaceChildren(...options);
}

export function renderAddForm(headers) {
  if (addFields.children.length === headers.length) {
    return;
  }
  addFields.replaceChildren();
  headers.forEach((header) => {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = header;
    input.setAttribute("aria-label", header);
    addFields.append(input);
  });
}

function readAddForm() {
  return [...addFields.querySelectorAll("input")].map((input) => input.value);
}

export function clearAddForm() {
  addFields.querySelectorAll("input").forEach((input) => {
    input.value = "";
  });
}

function buildHeaderRow(headers) {
  const row = document.createElement("tr");
  [...headers, "Actions"].forEach((label) => {
    const cell = document.createElement("th");
    cell.textContent = label;
    row.append(cell);
  });
  return row;
}

function buildActionsCell(rowNumber, readChangedCells, handlers) {
  const cell = document.createElement("td");

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save";
  saveButton.addEventListener("click", () =>
    handlers.onSave(rowNumber, readChangedCells()),
  );

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => handlers.onDelete(rowNumber));

  cell.append(saveButton, deleteButton);
  return cell;
}

function buildDataRow(values, columnCount, rowNumber, computedColumns, handlers) {
  const row = document.createElement("tr");
  const inputs = [];

  for (let column = 0; column < columnCount; column += 1) {
    const cell = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.value = values[column] ?? "";
    // Remembering what Google sent lets Save skip untouched cells, so a
    // formula the user never edited is never overwritten with its own text.
    input.dataset.originalValue = input.value;
    if (computedColumns.includes(column)) {
      // Disabled, not read-only: it cannot be focused, so it can never be
      // typed into and never pauses the poll.
      input.disabled = true;
      input.className = "computed";
    }
    inputs.push(input);
    cell.append(input);
    row.append(cell);
  }

  const readChangedCells = () =>
    inputs
      .map((input, columnIndex) => ({ columnIndex, value: input.value }))
      .filter(
        (cell) =>
          !computedColumns.includes(cell.columnIndex) &&
          cell.value !== inputs[cell.columnIndex].dataset.originalValue,
      );

  row.append(buildActionsCell(rowNumber, readChangedCells, handlers));
  return row;
}

export function renderRows(headers, dataRows, computedColumns, handlers) {
  tableHead.replaceChildren(buildHeaderRow(headers));

  const rows = dataRows.map((values, index) =>
    buildDataRow(
      values,
      headers.length,
      index + FIRST_DATA_ROW_NUMBER,
      computedColumns,
      handlers,
    ),
  );
  tableBody.replaceChildren(...rows);

  emptyMessage.hidden = dataRows.length > 0;
}
