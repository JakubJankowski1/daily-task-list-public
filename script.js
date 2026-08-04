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
const MAX_TIMEOUT_DELAY = 2_147_483_647;

const taskForm = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const taskDueAt = document.querySelector("#task-due-at");
const taskPriority = document.querySelector("#task-priority");
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

let tasks = loadTasks();
let currentFilter = "all";
let editingTaskId = null;
let searchQuery = "";
let overdueTimerId = null;

saveTasks();

function showStorageWarning() {
  storageNote.textContent = "Nie można zapisywać zadań w tej przeglądarce. Zmiany pozostaną tylko do zamknięcia strony.";
  storageNote.classList.add("storage-note-warning");
}

function showStorageReady() {
  storageNote.textContent = "Zadania są zapisywane w tej przeglądarce.";
  storageNote.classList.remove("storage-note-warning");
}

function normalizeDueAt(dueAt) {
  if (typeof dueAt !== "string" || dueAt === "") return null;
  return Number.isNaN(new Date(dueAt).getTime()) ? null : dueAt;
}

function normalizeTask(task) {
  return {
    id: typeof task.id === "string" ? task.id : crypto.randomUUID(),
    text: typeof task.text === "string" ? task.text : "",
    completed: Boolean(task.completed),
    priority: PRIORITIES.includes(task.priority) ? task.priority : "normal",
    dueAt: normalizeDueAt(task.dueAt),
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

function formatTaskCount(count) {
  if (count === 1) return "1 zadanie do wykonania";

  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  const usesZadania = lastDigit >= 2 && lastDigit <= 4
    && (lastTwoDigits < 12 || lastTwoDigits > 14);

  return `${count} ${usesZadania ? "zadania" : "zadań"} do wykonania`;
}

function formatDueAt(dueAt) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dueAt));
}

function createTask(text, priority, dueAt) {
  return {
    id: crypto.randomUUID(),
    text,
    completed: false,
    priority: PRIORITIES.includes(priority) ? priority : "normal",
    dueAt: normalizeDueAt(dueAt),
  };
}

function isOverdue(task, now = Date.now()) {
  if (task.completed || !task.dueAt) return false;
  return new Date(task.dueAt).getTime() < now;
}

function scheduleOverdueRefresh() {
  if (overdueTimerId !== null) clearTimeout(overdueTimerId);

  const now = Date.now();
  const nextDueAt = tasks.reduce((nearest, task) => {
    if (task.completed || !task.dueAt) return nearest;

    const timestamp = new Date(task.dueAt).getTime();
    return timestamp >= now ? Math.min(nearest, timestamp) : nearest;
  }, Number.POSITIVE_INFINITY);

  if (nextDueAt === Number.POSITIVE_INFINITY) {
    overdueTimerId = null;
    return;
  }

  const delay = Math.min(nextDueAt - now + 1, MAX_TIMEOUT_DELAY);
  overdueTimerId = setTimeout(() => {
    overdueTimerId = null;
    if (editingTaskId === null) renderTasks();
  }, delay);
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
    ? indexedTasks.filter(({ task }) => (
      task.text.toLocaleLowerCase("pl-PL").includes(normalizedQuery)
    ))
    : indexedTasks;
  const completedTasks = matchingTasks.filter(({ task }) => task.completed);
  const now = Date.now();
  const activeTasks = matchingTasks
    .filter(({ task }) => !task.completed)
    .sort((first, second) => compareActiveTasks(first, second, now));

  if (currentFilter === "active") {
    return activeTasks.map(({ task }) => task);
  }

  if (currentFilter === "completed") {
    return completedTasks.map(({ task }) => task);
  }

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
  const remainingCount = tasks.filter((task) => !task.completed).length;
  const completedCount = tasks.length - remainingCount;

  taskCount.textContent = tasks.length === 0
    ? "Brak zadań"
    : formatTaskCount(remainingCount);
  clearCompletedButton.hidden = completedCount === 0;
}

function createPriorityBadge(task) {
  const badge = document.createElement("span");
  badge.className = `priority-badge priority-${task.priority}`;
  badge.textContent = `Priorytet: ${PRIORITY_LABELS[task.priority]}`;
  return badge;
}

function createDueBadge(task) {
  if (!task.dueAt) return null;

  const badge = document.createElement("span");
  badge.className = "due-badge";
  badge.textContent = `Termin: ${formatDueAt(task.dueAt)}`;
  return badge;
}

function createOverdueBadge(task) {
  if (!isOverdue(task)) return null;

  const badge = document.createElement("span");
  badge.className = "overdue-badge";
  badge.textContent = "Po terminie";
  return badge;
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
  metadata.append(createPriorityBadge(task));

  const dueBadge = createDueBadge(task);
  const overdueBadge = createOverdueBadge(task);
  if (dueBadge) metadata.append(dueBadge);
  if (overdueBadge) metadata.append(overdueBadge);

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

function createEditItem(task) {
  const item = document.createElement("li");
  item.className = "task-item task-item-editing";
  item.dataset.taskId = task.id;

  const form = document.createElement("form");
  form.className = "task-edit-form";

  const textLabel = document.createElement("label");
  textLabel.className = "form-field edit-text-field";
  textLabel.innerHTML = "<span>Treść zadania</span>";

  const textInput = document.createElement("input");
  textInput.className = "edit-task-text";
  textInput.name = "text";
  textInput.type = "text";
  textInput.maxLength = 120;
  textInput.required = true;
  textInput.value = task.text;
  textLabel.append(textInput);

  const fields = document.createElement("div");
  fields.className = "edit-fields";

  const dueLabel = document.createElement("label");
  dueLabel.className = "form-field";
  dueLabel.innerHTML = "<span>Termin <small>(opcjonalnie)</small></span>";

  const dueInput = document.createElement("input");
  dueInput.name = "dueAt";
  dueInput.type = "datetime-local";
  dueInput.value = task.dueAt ?? "";
  dueLabel.append(dueInput);

  const priorityLabel = document.createElement("label");
  priorityLabel.className = "form-field";
  priorityLabel.innerHTML = "<span>Priorytet</span>";

  const prioritySelect = document.createElement("select");
  prioritySelect.name = "priority";
  for (const priority of PRIORITIES) {
    const option = document.createElement("option");
    option.value = priority;
    option.textContent = PRIORITY_LABELS[priority];
    option.selected = priority === task.priority;
    prioritySelect.append(option);
  }
  priorityLabel.append(prioritySelect);
  fields.append(dueLabel, priorityLabel);

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
  form.append(textLabel, fields, actions);
  item.append(form);
  return item;
}

function renderTasks() {
  taskList.replaceChildren();
  const visibleTasks = getVisibleTasks();

  for (const task of visibleTasks) {
    const item = task.id === editingTaskId
      ? createEditItem(task)
      : createTaskItem(task);
    taskList.append(item);
  }

  updateSummary();
  updateEmptyState(visibleTasks.length);
  scheduleOverdueRefresh();
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const taskText = taskInput.value.trim();
  if (!taskText) return;

  tasks.unshift(createTask(taskText, taskPriority.value, taskDueAt.value));
  saveTasks();
  renderTasks();

  taskForm.reset();
  taskPriority.value = "normal";
  taskInput.focus();
});

taskList.addEventListener("change", (event) => {
  if (!event.target.matches(".task-checkbox")) return;

  const item = event.target.closest(".task-item");
  const task = tasks.find((currentTask) => currentTask.id === item.dataset.taskId);
  if (!task) return;

  task.completed = event.target.checked;
  saveTasks();
  renderTasks();
});

taskList.addEventListener("submit", (event) => {
  if (!event.target.matches(".task-edit-form")) return;
  event.preventDefault();

  const item = event.target.closest(".task-item");
  const task = tasks.find((currentTask) => currentTask.id === item.dataset.taskId);
  if (!task) return;

  const textInput = event.target.elements.text;
  const taskText = textInput.value.trim();
  if (!taskText) {
    textInput.focus();
    return;
  }

  task.text = taskText;
  task.priority = PRIORITIES.includes(event.target.elements.priority.value)
    ? event.target.elements.priority.value
    : "normal";
  task.dueAt = normalizeDueAt(event.target.elements.dueAt.value);
  editingTaskId = null;
  saveTasks();
  renderTasks();
});

taskList.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !event.target.closest(".task-edit-form")) return;

  editingTaskId = null;
  renderTasks();
});

taskList.addEventListener("click", (event) => {
  const item = event.target.closest(".task-item");
  if (!item) return;

  if (event.target.closest(".delete-button")) {
    tasks = tasks.filter((task) => task.id !== item.dataset.taskId);
    if (editingTaskId === item.dataset.taskId) editingTaskId = null;
    saveTasks();
    renderTasks();
    return;
  }

  if (event.target.closest(".edit-button")) {
    editingTaskId = item.dataset.taskId;
    renderTasks();
    taskList.querySelector(".edit-task-text")?.focus();
    return;
  }

  if (event.target.closest(".cancel-edit-button")) {
    editingTaskId = null;
    renderTasks();
  }
});

clearCompletedButton.addEventListener("click", () => {
  tasks = tasks.filter((task) => !task.completed);
  editingTaskId = null;
  saveTasks();
  renderTasks();
});

taskFilters.addEventListener("click", (event) => {
  const filterButton = event.target.closest(".filter-button");
  if (!filterButton) return;

  currentFilter = filterButton.dataset.filter;
  editingTaskId = null;

  for (const button of filterButtons) {
    const isActive = button === filterButton;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  renderTasks();
});

taskSearch.addEventListener("input", () => {
  searchQuery = taskSearch.value.trim();
  clearSearchButton.hidden = searchQuery === "";
  editingTaskId = null;
  renderTasks();
});

clearSearchButton.addEventListener("click", () => {
  taskSearch.value = "";
  searchQuery = "";
  clearSearchButton.hidden = true;
  editingTaskId = null;
  renderTasks();
  taskSearch.focus();
});

renderTasks();
