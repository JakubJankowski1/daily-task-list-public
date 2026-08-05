const STORAGE_KEY = "daily-tasks";
const PRIORITIES = ["low", "normal", "high"];
const PRIORITY_LABELS = {
  low: "Niski",
  normal: "Normalny",
  high: "Wysoki",
};
const PRIORITY_ORDER = {
  high: 0,
  normal: 1,
  low: 2,
};
const MONTH_LABELS = ["Sty", "Lut", "Mar", "Kwi", "Maj", "Cze", "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru"];
const DAY_MS = 86_400_000;

const taskForm = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const taskStartAt = document.querySelector("#task-start-at");
const taskDueAt = document.querySelector("#task-due-at");
const taskPriority = document.querySelector("#task-priority");
const taskDateError = document.querySelector("#task-date-error");
const taskList = document.querySelector("#task-list");
const taskCount = document.querySelector("#task-count");
const emptyState = document.querySelector("#empty-state");
const emptyTitle = document.querySelector("#empty-title");
const emptyDescription = document.querySelector("#empty-description");
const clearCompletedButton = document.querySelector("#clear-completed");
const taskFilters = document.querySelector(".task-filters");
const filterButtons = document.querySelectorAll(".filter-button");
const taskSearch = document.querySelector("#task-search");
const clearSearchButton = document.querySelector("#clear-search");
const storageNote = document.querySelector("#storage-note");
const appShell = document.querySelector(".app-shell");
const listPanel = document.querySelector("#list-panel");
const timelinePanel = document.querySelector("#timeline-panel");
const viewTabs = document.querySelector(".view-tabs");
const tabButtons = document.querySelectorAll(".view-tab");
const timeline = document.querySelector("#timeline");
const timelineEmpty = document.querySelector("#timeline-empty");
const timelineSkipped = document.querySelector("#timeline-skipped");
const timelineYear = document.querySelector("#timeline-year");
const previousYearButton = document.querySelector("#previous-year");
const nextYearButton = document.querySelector("#next-year");

let tasks = loadTasks();
let currentFilter = "all";
let currentView = "list";
let editingTaskId = null;
let searchQuery = "";
let refreshTimerId = null;
let temporalRefreshPending = false;
let renderedDayOrdinal = getToday().ordinal;
let selectedYear = new Date().getFullYear();

timelineYear.value = selectedYear;
saveTasks();

function showStorageWarning() {
  storageNote.textContent = "Nie można zapisywać zadań w tej przeglądarce. Zmiany pozostaną tylko do zamknięcia strony.";
  storageNote.classList.add("storage-note-warning");
}

function showStorageReady() {
  storageNote.textContent = "Zadania są zapisywane w tej przeglądarce.";
  storageNote.classList.remove("storage-note-warning");
}

function normalizeDateTime(value) {
  if (typeof value !== "string" || value === "") return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

function parseCalendarDate(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ordinal = Date.UTC(year, month - 1, day) / DAY_MS;
  const checkedDate = new Date(ordinal * DAY_MS);
  if (
    checkedDate.getUTCFullYear() !== year
    || checkedDate.getUTCMonth() !== month - 1
    || checkedDate.getUTCDate() !== day
  ) return null;

  return { year, month, day, ordinal };
}

function normalizeTask(task) {
  return {
    id: typeof task.id === "string" ? task.id : crypto.randomUUID(),
    text: typeof task.text === "string" ? task.text : "",
    completed: Boolean(task.completed),
    priority: PRIORITIES.includes(task.priority) ? task.priority : "normal",
    startAt: normalizeDateTime(task.startAt),
    dueAt: normalizeDateTime(task.dueAt),
  };
}

function loadTasks() {
  try {
    const storedTasks = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(storedTasks)) return [];

    return storedTasks
      .filter((task) => task && typeof task === "object")
      .map(normalizeTask)
      .filter((task) => task.text.trim() !== "");
  } catch (error) {
    if (!(error instanceof SyntaxError)) showStorageWarning();
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    showStorageReady();
    return true;
  } catch {
    showStorageWarning();
    return false;
  }
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatShortDate(value) {
  const date = parseCalendarDate(value);
  return date ? `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}` : "";
}

function getToday(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return {
    year,
    month,
    day,
    ordinal: Date.UTC(year, month - 1, day) / DAY_MS,
  };
}

function dayWord(value) {
  return Math.abs(value) === 1 ? "dzień" : "dni";
}

function getDayDifference(startAt, dueAt) {
  const start = parseCalendarDate(startAt);
  const due = parseCalendarDate(dueAt);
  return start && due ? due.ordinal - start.ordinal : null;
}

function isDateRangeValid(startAt, dueAt) {
  if (!startAt || !dueAt) return true;
  return new Date(startAt).getTime() <= new Date(dueAt).getTime();
}

function createTask(text, priority, startAt, dueAt) {
  return {
    id: crypto.randomUUID(),
    text,
    completed: false,
    priority: PRIORITIES.includes(priority) ? priority : "normal",
    startAt: normalizeDateTime(startAt),
    dueAt: normalizeDateTime(dueAt),
  };
}

function isOverdue(task, now = Date.now()) {
  if (task.completed || !task.dueAt) return false;
  return new Date(task.dueAt).getTime() < now;
}

function scheduleTemporalRefresh() {
  if (refreshTimerId !== null) clearTimeout(refreshTimerId);

  const now = new Date();
  const nowTimestamp = now.getTime();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  let nextTimestamp = nextMidnight.getTime();

  for (const task of tasks) {
    if (task.completed || !task.dueAt) continue;
    const dueTimestamp = new Date(task.dueAt).getTime();
    if (dueTimestamp >= nowTimestamp && dueTimestamp < nextTimestamp) {
      nextTimestamp = dueTimestamp;
    }
  }

  const delay = Math.max(1, nextTimestamp - nowTimestamp + 1);
  refreshTimerId = setTimeout(handleTemporalRefresh, delay);
}

function handleTemporalRefresh() {
  refreshTimerId = null;
  const today = getToday();
  const dayChanged = today.ordinal !== renderedDayOrdinal;

  if (editingTaskId !== null) {
    temporalRefreshPending = true;
  } else {
    const visibleTasks = getVisibleTasks();
    renderTaskList(visibleTasks);
    if (dayChanged) renderTimeline(visibleTasks);
    updateSummary();
    renderedDayOrdinal = today.ordinal;
  }

  scheduleTemporalRefresh();
}

function compareActiveTasks(first, second, now) {
  const firstTimestamp = first.task.dueAt
    ? new Date(first.task.dueAt).getTime()
    : Number.POSITIVE_INFINITY;
  const secondTimestamp = second.task.dueAt
    ? new Date(second.task.dueAt).getTime()
    : Number.POSITIVE_INFINITY;
  const firstGroup = firstTimestamp === Number.POSITIVE_INFINITY
    ? 2
    : firstTimestamp < now ? 0 : 1;
  const secondGroup = secondTimestamp === Number.POSITIVE_INFINITY
    ? 2
    : secondTimestamp < now ? 0 : 1;

  return firstGroup - secondGroup
    || firstTimestamp - secondTimestamp
    || PRIORITY_ORDER[first.task.priority] - PRIORITY_ORDER[second.task.priority]
    || first.index - second.index;
}

function getVisibleTasks() {
  const indexedTasks = tasks.map((task, index) => ({ task, index }));
  const normalizedQuery = searchQuery.toLocaleLowerCase("pl-PL");
  const matchingTasks = normalizedQuery
    ? indexedTasks.filter(({ task }) => task.text.toLocaleLowerCase("pl-PL").includes(normalizedQuery))
    : indexedTasks;
  const completedTasks = matchingTasks.filter(({ task }) => task.completed);
  const now = Date.now();
  const activeTasks = matchingTasks
    .filter(({ task }) => !task.completed)
    .sort((first, second) => compareActiveTasks(first, second, now));

  if (currentFilter === "active") return activeTasks.map(({ task }) => task);
  if (currentFilter === "completed") return completedTasks.map(({ task }) => task);
  return [...activeTasks, ...completedTasks].map(({ task }) => task);
}

function updateEmptyState(visibleTaskCount) {
  emptyState.hidden = visibleTaskCount > 0;

  if (tasks.length === 0) {
    emptyTitle.textContent = "Lista jest pusta";
    emptyDescription.textContent = "Dodaj pierwsze zadanie powyżej.";
  } else if (searchQuery) {
    emptyTitle.textContent = "Brak wyników";
    emptyDescription.textContent = "Spróbuj wpisać inne słowa.";
  } else if (currentFilter === "active") {
    emptyTitle.textContent = "Brak aktywnych zadań";
    emptyDescription.textContent = "Wszystkie zadania są już wykonane.";
  } else if (currentFilter === "completed") {
    emptyTitle.textContent = "Brak wykonanych zadań";
    emptyDescription.textContent = "Wykonane zadania pojawią się tutaj.";
  }
}

function updateSummary() {
  const activeCount = tasks.filter((task) => !task.completed).length;
  const completedCount = tasks.length - activeCount;
  taskCount.textContent = `Aktywne: ${activeCount} • Wykonane: ${completedCount}`;
  clearCompletedButton.hidden = completedCount === 0;
}

function createBadge(text, className) {
  const badge = document.createElement("span");
  badge.className = className;
  badge.textContent = text;
  return badge;
}

function createTimeBadges(task) {
  const badges = [];
  const start = parseCalendarDate(task.startAt);
  const due = parseCalendarDate(task.dueAt);
  const today = getToday();

  if (task.startAt) badges.push(createBadge(`Start: ${formatDateTime(task.startAt)}`, "date-badge"));
  if (task.dueAt) badges.push(createBadge(`Termin: ${formatDateTime(task.dueAt)}`, "due-badge"));

  const rangeValid = isDateRangeValid(task.startAt, task.dueAt);
  const duration = rangeValid ? getDayDifference(task.startAt, task.dueAt) : null;
  if (duration !== null) {
    badges.push(createBadge(`Czas trwania: ${duration} ${dayWord(duration)}`, "time-badge"));
  }
  if (task.completed) return badges;

  if (start && start.ordinal > today.ordinal) {
    const untilStart = start.ordinal - today.ordinal;
    badges.push(createBadge(`Start za: ${untilStart} ${dayWord(untilStart)}`, "time-badge"));
    if (due) {
      const untilEnd = due.ordinal - today.ordinal;
      badges.push(createBadge(`Do końca: ${untilEnd} ${dayWord(untilEnd)}`, "time-badge"));
    }
  } else if (due) {
    const remaining = due.ordinal - today.ordinal;
    const text = remaining < 0
      ? `Po terminie: ${Math.abs(remaining)} ${dayWord(remaining)}`
      : `Pozostało: ${remaining} ${dayWord(remaining)}`;
    badges.push(createBadge(text, "time-badge"));
  }

  if (isOverdue(task)) badges.push(createBadge("Po terminie", "overdue-badge"));
  return badges;
}

function createTaskItem(task) {
  const item = document.createElement("li");
  item.className = `task-item${task.completed ? " completed" : ""}${isOverdue(task) ? " overdue" : ""}`;
  item.dataset.taskId = task.id;

  const checkbox = document.createElement("input");
  checkbox.className = "task-checkbox";
  checkbox.type = "checkbox";
  checkbox.checked = task.completed;
  checkbox.setAttribute("aria-label", `Oznacz zadanie: ${task.text}`);

  const content = document.createElement("div");
  content.className = "task-content";
  const text = document.createElement("span");
  text.className = "task-text";
  text.textContent = task.text;
  const metadata = document.createElement("div");
  metadata.className = "task-metadata";
  metadata.append(createBadge(`Priorytet: ${PRIORITY_LABELS[task.priority]}`, `priority-badge priority-${task.priority}`));
  metadata.append(...createTimeBadges(task));

  const actions = document.createElement("div");
  actions.className = "task-actions";
  const editButton = document.createElement("button");
  editButton.className = "edit-button";
  editButton.type = "button";
  editButton.textContent = "Edytuj";
  editButton.setAttribute("aria-label", `Edytuj zadanie: ${task.text}`);
  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "×";
  deleteButton.setAttribute("aria-label", `Usuń zadanie: ${task.text}`);
  deleteButton.title = "Usuń zadanie";

  content.append(text, metadata);
  actions.append(editButton, deleteButton);
  item.append(checkbox, content, actions);
  return item;
}

function createInputField(labelText, name, value, errorId) {
  const label = document.createElement("label");
  label.className = "form-field";
  const labelSpan = document.createElement("span");
  labelSpan.textContent = labelText;
  const input = document.createElement("input");
  input.name = name;
  input.type = "datetime-local";
  input.value = value ?? "";
  input.setAttribute("aria-describedby", errorId);
  label.append(labelSpan, input);
  return { label, input };
}

function createEditItem(task) {
  const item = document.createElement("li");
  item.className = "task-item task-item-editing";
  item.dataset.taskId = task.id;
  const form = document.createElement("form");
  form.className = "task-edit-form";
  form.noValidate = true;

  const textLabel = document.createElement("label");
  textLabel.className = "form-field edit-text-field";
  const textLabelSpan = document.createElement("span");
  textLabelSpan.textContent = "Treść zadania";
  const textInput = document.createElement("input");
  textInput.className = "edit-task-text";
  textInput.name = "text";
  textInput.type = "text";
  textInput.maxLength = 120;
  textInput.required = true;
  textInput.value = task.text;
  textLabel.append(textLabelSpan, textInput);

  const errorId = `edit-date-error-${task.id}`;
  const fields = document.createElement("div");
  fields.className = "edit-fields";
  const startField = createInputField("Rozpoczęcie (opcjonalnie)", "startAt", task.startAt, errorId);
  const dueField = createInputField("Zakończenie (opcjonalnie)", "dueAt", task.dueAt, errorId);
  const priorityLabel = document.createElement("label");
  priorityLabel.className = "form-field priority-field";
  const priorityTitle = document.createElement("span");
  priorityTitle.textContent = "Priorytet";
  const prioritySelect = document.createElement("select");
  prioritySelect.name = "priority";
  for (const priority of PRIORITIES) {
    const option = document.createElement("option");
    option.value = priority;
    option.textContent = PRIORITY_LABELS[priority];
    option.selected = priority === task.priority;
    prioritySelect.append(option);
  }
  priorityLabel.append(priorityTitle, prioritySelect);
  fields.append(startField.label, dueField.label, priorityLabel);

  const error = document.createElement("p");
  error.id = errorId;
  error.className = "form-error";
  error.setAttribute("role", "alert");
  error.hidden = true;

  const actions = document.createElement("div");
  actions.className = "edit-form-actions";
  const saveButton = document.createElement("button");
  saveButton.className = "save-edit-button";
  saveButton.type = "submit";
  saveButton.textContent = "Zapisz";
  const cancelButton = document.createElement("button");
  cancelButton.className = "cancel-edit-button";
  cancelButton.type = "button";
  cancelButton.textContent = "Anuluj";
  actions.append(saveButton, cancelButton);

  form.append(textLabel, fields, error, actions);
  item.append(form);
  return item;
}

function setDateError(form, errorElement, message) {
  errorElement.textContent = message;
  errorElement.hidden = message === "";
  for (const name of ["startAt", "dueAt"]) {
    form.elements[name].setAttribute("aria-invalid", String(message !== ""));
  }
}

function renderTaskList(visibleTasks) {
  taskList.replaceChildren();
  for (const task of visibleTasks) {
    taskList.append(task.id === editingTaskId ? createEditItem(task) : createTaskItem(task));
  }
  updateEmptyState(visibleTasks.length);
}

function getYearAxis(year) {
  const start = Date.UTC(year, 0, 1) / DAY_MS;
  const endExclusive = Date.UTC(year + 1, 0, 1) / DAY_MS;
  return { start, endExclusive, span: endExclusive - start };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function addMonthSegments(container, year, showLabels = false) {
  const axis = getYearAxis(year);
  for (let month = 0; month < 12; month += 1) {
    const segment = document.createElement("span");
    const monthStart = Date.UTC(year, month, 1) / DAY_MS;
    const monthEnd = Date.UTC(year, month + 1, 1) / DAY_MS;
    segment.style.width = `${((monthEnd - monthStart) / axis.span) * 100}%`;
    segment.textContent = showLabels ? MONTH_LABELS[month] : "";
    if (!showLabels) segment.setAttribute("aria-hidden", "true");
    container.append(segment);
  }
}

function addTodayMarker(container, year) {
  const today = getToday();
  if (today.year !== year) return;
  const axis = getYearAxis(year);
  const marker = document.createElement("span");
  marker.className = "today-marker";
  marker.style.left = `${clamp(((today.ordinal - axis.start) / axis.span) * 100, 0, 100)}%`;
  marker.setAttribute("aria-hidden", "true");
  container.append(marker);
}

function getTimelineEntry(task, year) {
  const start = parseCalendarDate(task.startAt);
  const due = parseCalendarDate(task.dueAt);
  if (!start && !due) return null;
  const axis = getYearAxis(year);

  if (start && due) {
    if (!isDateRangeValid(task.startAt, task.dueAt)) return null;
    if (due.ordinal < axis.start || start.ordinal >= axis.endExclusive) return null;
    const clippedStart = clamp(start.ordinal, axis.start, axis.endExclusive);
    const clippedEnd = clamp(due.ordinal, axis.start, axis.endExclusive);
    const left = clamp(((clippedStart - axis.start) / axis.span) * 100, 0, 100);
    const width = clamp(((clippedEnd - clippedStart) / axis.span) * 100, 0, 100 - left);
    return {
      type: start.ordinal === due.ordinal ? "single" : "range",
      left,
      width,
      continuesBefore: start.ordinal < axis.start,
      continuesAfter: due.ordinal > axis.endExclusive,
      label: `${formatShortDate(task.startAt)}–${formatShortDate(task.dueAt)}`,
    };
  }

  const point = start || due;
  if (point.ordinal < axis.start || point.ordinal >= axis.endExclusive) return null;
  return {
    type: start ? "start" : "due",
    left: clamp(((point.ordinal - axis.start) / axis.span) * 100, 0, 100),
    width: 0,
    continuesBefore: false,
    continuesAfter: false,
    label: `${start ? "Start" : "Koniec"}: ${formatShortDate(start ? task.startAt : task.dueAt)}`,
  };
}

function createTimelineRow(task, entry, year) {
  const row = document.createElement("div");
  row.className = `timeline-row${task.completed ? " completed" : ""}`;
  const name = document.createElement("div");
  name.className = "timeline-task-name";
  name.textContent = task.text;
  name.title = task.text;

  const track = document.createElement("div");
  track.className = "timeline-track";
  const grid = document.createElement("div");
  grid.className = "timeline-grid";
  addMonthSegments(grid, year);
  track.append(grid);
  addTodayMarker(track, year);

  const bar = document.createElement("div");
  bar.className = `timeline-bar timeline-${entry.type} priority-${task.priority}`;
  if (entry.continuesBefore) bar.classList.add("continues-before");
  if (entry.continuesAfter) bar.classList.add("continues-after");
  bar.style.left = `${entry.left}%`;
  bar.style.width = `${entry.width}%`;
  bar.dataset.left = String(entry.left);
  bar.dataset.width = String(entry.width);
  if (["single", "start", "due"].includes(entry.type)) {
    const pointLabel = document.createElement("span");
    pointLabel.className = "timeline-point-label";
    pointLabel.textContent = entry.label;
    bar.append(pointLabel);
    if (entry.left > 85) bar.classList.add("near-end");
  } else {
    bar.textContent = entry.label;
  }
  const kind = entry.type === "range" || entry.type === "single"
    ? "Zakres"
    : entry.type === "start" ? "Rozpoczęcie" : "Zakończenie";
  bar.setAttribute("aria-label", `${task.text}. ${kind}: ${entry.label}`);
  track.append(bar);
  row.append(name, track);
  return row;
}

function renderTimeline(visibleTasks) {
  timeline.replaceChildren();
  const noDateCount = visibleTasks.filter((task) => !task.startAt && !task.dueAt).length;
  timelineSkipped.textContent = noDateCount
    ? `${noDateCount} ${noDateCount === 1 ? "zadanie bez dat nie jest pokazane" : "zadania bez dat nie są pokazane"}.`
    : "";

  const header = document.createElement("div");
  header.className = "timeline-header";
  const nameHeader = document.createElement("div");
  nameHeader.className = "timeline-name-header";
  nameHeader.textContent = "Zadanie";
  const months = document.createElement("div");
  months.className = "timeline-months";
  addMonthSegments(months, selectedYear, true);
  addTodayMarker(months, selectedYear);
  header.append(nameHeader, months);
  timeline.append(header);

  let entryCount = 0;
  for (const task of visibleTasks) {
    const entry = getTimelineEntry(task, selectedYear);
    if (!entry) continue;
    timeline.append(createTimelineRow(task, entry, selectedYear));
    entryCount += 1;
  }

  timeline.hidden = entryCount === 0;
  timelineEmpty.hidden = entryCount > 0;
}

function renderApp() {
  const visibleTasks = getVisibleTasks();
  renderTaskList(visibleTasks);
  renderTimeline(visibleTasks);
  updateSummary();
  renderedDayOrdinal = getToday().ordinal;
  temporalRefreshPending = false;
  scheduleTemporalRefresh();
}

function selectView(view, focus = false) {
  currentView = view;
  const timelineActive = view === "timeline";
  listPanel.hidden = timelineActive;
  timelinePanel.hidden = !timelineActive;
  appShell.classList.toggle("timeline-view", timelineActive);

  for (const tab of tabButtons) {
    const active = tab.id === `${view}-tab`;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
  }
  if (timelineActive) renderTimeline(getVisibleTasks());
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const taskText = taskInput.value.trim();
  if (!taskText) {
    taskInput.focus();
    return;
  }

  const startAt = normalizeDateTime(taskStartAt.value);
  const dueAt = normalizeDateTime(taskDueAt.value);
  if (!isDateRangeValid(startAt, dueAt)) {
    setDateError(taskForm, taskDateError, "Zakończenie nie może być wcześniejsze od rozpoczęcia.");
    taskDueAt.focus();
    return;
  }

  setDateError(taskForm, taskDateError, "");
  tasks.unshift(createTask(taskText, taskPriority.value, startAt, dueAt));
  saveTasks();
  taskForm.reset();
  taskPriority.value = "normal";
  renderApp();
  taskInput.focus();
});

taskList.addEventListener("change", (event) => {
  if (!event.target.matches(".task-checkbox")) return;
  const item = event.target.closest(".task-item");
  const task = tasks.find((currentTask) => currentTask.id === item.dataset.taskId);
  if (!task) return;
  task.completed = event.target.checked;
  saveTasks();
  renderApp();
});

taskList.addEventListener("submit", (event) => {
  if (!event.target.matches(".task-edit-form")) return;
  event.preventDefault();
  const form = event.target;
  const item = form.closest(".task-item");
  const task = tasks.find((currentTask) => currentTask.id === item.dataset.taskId);
  if (!task) return;

  const taskText = form.elements.text.value.trim();
  if (!taskText) {
    form.elements.text.focus();
    return;
  }
  const startAt = normalizeDateTime(form.elements.startAt.value);
  const dueAt = normalizeDateTime(form.elements.dueAt.value);
  const error = form.querySelector(".form-error");
  if (!isDateRangeValid(startAt, dueAt)) {
    setDateError(form, error, "Zakończenie nie może być wcześniejsze od rozpoczęcia.");
    form.elements.dueAt.focus();
    return;
  }

  task.text = taskText;
  task.priority = PRIORITIES.includes(form.elements.priority.value)
    ? form.elements.priority.value
    : "normal";
  task.startAt = startAt;
  task.dueAt = dueAt;
  editingTaskId = null;
  saveTasks();
  renderApp();
});

taskList.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !event.target.closest(".task-edit-form")) return;
  editingTaskId = null;
  renderApp();
});

taskList.addEventListener("click", (event) => {
  const item = event.target.closest(".task-item");
  if (!item) return;

  if (event.target.closest(".delete-button")) {
    tasks = tasks.filter((task) => task.id !== item.dataset.taskId);
    if (editingTaskId === item.dataset.taskId) editingTaskId = null;
    saveTasks();
    renderApp();
  } else if (event.target.closest(".edit-button")) {
    editingTaskId = item.dataset.taskId;
    renderApp();
    taskList.querySelector(".edit-task-text")?.focus();
  } else if (event.target.closest(".cancel-edit-button")) {
    editingTaskId = null;
    renderApp();
  }
});

taskFilters.addEventListener("click", (event) => {
  const button = event.target.closest(".filter-button");
  if (!button) return;
  currentFilter = button.dataset.filter;
  for (const filterButton of filterButtons) {
    const active = filterButton === button;
    filterButton.classList.toggle("active", active);
    filterButton.setAttribute("aria-pressed", String(active));
  }
  editingTaskId = null;
  renderApp();
});

taskSearch.addEventListener("input", () => {
  searchQuery = taskSearch.value.trim();
  clearSearchButton.hidden = searchQuery === "";
  editingTaskId = null;
  renderApp();
});

clearSearchButton.addEventListener("click", () => {
  taskSearch.value = "";
  searchQuery = "";
  clearSearchButton.hidden = true;
  renderApp();
  taskSearch.focus();
});

clearCompletedButton.addEventListener("click", () => {
  tasks = tasks.filter((task) => !task.completed);
  editingTaskId = null;
  saveTasks();
  renderApp();
});

viewTabs.addEventListener("click", (event) => {
  const tab = event.target.closest(".view-tab");
  if (tab) selectView(tab.id === "timeline-tab" ? "timeline" : "list");
});

viewTabs.addEventListener("keydown", (event) => {
  if (!event.target.matches(".view-tab") || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  selectView(currentView === "list" ? "timeline" : "list", true);
});

function changeYear(year) {
  selectedYear = clamp(Number(year) || new Date().getFullYear(), 1, 9999);
  timelineYear.value = selectedYear;
  renderTimeline(getVisibleTasks());
}

previousYearButton.addEventListener("click", () => changeYear(selectedYear - 1));
nextYearButton.addEventListener("click", () => changeYear(selectedYear + 1));
timelineYear.addEventListener("change", () => changeYear(timelineYear.value));

renderApp();
