const { test, expect } = require("playwright/test");

const STORAGE_KEY = "daily-tasks";

async function openCleanApp(page) {
  await page.goto("/");
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();
}

async function addTask(page, text, { startAt, dueAt, priority } = {}) {
  await page.locator("#task-input").fill(text);
  if (startAt) await page.locator("#task-start-at").fill(startAt);
  if (dueAt) await page.locator("#task-due-at").fill(dueAt);
  if (priority) await page.locator("#task-priority").selectOption(priority);
  await page.locator("#task-form").getByRole("button", { name: "Dodaj" }).click();
}

async function storedTasks(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
}

function formatDateTimeLocal(date) {
  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

test.beforeEach(async ({ page }) => {
  await openCleanApp(page);
});

test("dodaje zadanie z wartościami domyślnymi i zachowuje je po odświeżeniu", async ({ page }) => {
  await addTask(page, "Kupić pieczywo");

  const item = page.locator(".task-item", { hasText: "Kupić pieczywo" });
  await expect(item).toContainText("Priorytet: Normalny");

  const tasks = await storedTasks(page);
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toMatchObject({
    text: "Kupić pieczywo",
    completed: false,
    priority: "normal",
    startAt: null,
    dueAt: null,
  });

  await page.reload();
  await expect(page.locator(".task-item", { hasText: "Kupić pieczywo" })).toBeVisible();
});

test("działa w pamięci i ostrzega, gdy localStorage odrzuca zapis", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Zapis zablokowany", "QuotaExceededError");
    };
  });
  await page.reload();

  await expect(page.getByRole("status")).toContainText("Nie można zapisywać zadań");
  await addTask(page, "Zadanie tylko w pamięci");

  const item = page.locator(".task-item", { hasText: "Zadanie tylko w pamięci" });
  await expect(item).toBeVisible();
  await item.locator(".task-checkbox").check();
  await expect(item.locator(".task-checkbox")).toBeChecked();
  expect(errors).toEqual([]);
});

test("filtry pokazują zadania bez usuwania ich z pamięci", async ({ page }) => {
  await addTask(page, "Zadanie aktywne");
  await addTask(page, "Zadanie wykonane");

  const completedItem = page.locator(".task-item", { hasText: "Zadanie wykonane" });
  await completedItem.locator(".task-checkbox").check();

  await page.getByRole("button", { name: "Aktywne", exact: true }).click();
  await expect(page.locator(".task-item")).toHaveCount(1);
  await expect(page.locator(".task-item")).toContainText("Zadanie aktywne");

  await page.getByRole("button", { name: "Wykonane", exact: true }).click();
  await expect(page.locator(".task-item")).toHaveCount(1);
  await expect(page.locator(".task-item")).toContainText("Zadanie wykonane");

  expect(await storedTasks(page)).toHaveLength(2);
});

test("licznik pokazuje aktywne i wykonane zadania", async ({ page }) => {
  const counter = page.locator("#task-count");

  await expect(counter).toHaveText("Aktywne: 0 • Wykonane: 0");
  await addTask(page, "Pierwsze zadanie");
  await addTask(page, "Drugie zadanie");
  await expect(counter).toHaveText("Aktywne: 2 • Wykonane: 0");

  await page.locator(".task-item", { hasText: "Pierwsze zadanie" })
    .locator(".task-checkbox")
    .check();
  await expect(counter).toHaveText("Aktywne: 1 • Wykonane: 1");

  await page.getByRole("button", { name: "Aktywne", exact: true }).click();
  await expect(counter).toHaveText("Aktywne: 1 • Wykonane: 1");

  await page.getByRole("button", { name: "Usuń wykonane" }).click();
  await expect(counter).toHaveText("Aktywne: 1 • Wykonane: 0");
});

test("wyszukiwanie współpracuje z filtrami i nie zmienia localStorage", async ({ page }) => {
  await addTask(page, "Napisać raport");
  await addTask(page, "Zrobić zakupy");
  await addTask(page, "Wysłać raport");
  await page.locator(".task-item", { hasText: "Wysłać raport" })
    .locator(".task-checkbox")
    .check();

  const tasksBeforeSearch = await storedTasks(page);
  await page.locator("#task-search").fill("RAPORT");

  await expect(page.locator(".task-item")).toHaveCount(2);
  await expect(page.locator(".task-item")).toContainText([
    "Napisać raport",
    "Wysłać raport",
  ]);

  await page.getByRole("button", { name: "Aktywne", exact: true }).click();
  await expect(page.locator(".task-item")).toHaveCount(1);
  await expect(page.locator(".task-item")).toContainText("Napisać raport");

  await page.getByRole("button", { name: "Wykonane", exact: true }).click();
  await expect(page.locator(".task-item")).toHaveCount(1);
  await expect(page.locator(".task-item")).toContainText("Wysłać raport");
  expect(await storedTasks(page)).toEqual(tasksBeforeSearch);

  await page.getByRole("button", { name: "Wyczyść wyszukiwanie" }).click();
  await expect(page.locator("#task-search")).toHaveValue("");
  await expect(page.locator(".task-item")).toHaveCount(1);
});

test("zapisuje edycję, a anulowanie pozostawia dane bez zmian", async ({ page }) => {
  await addTask(page, "Wersja początkowa");
  const item = page.locator(".task-item", { hasText: "Wersja początkowa" });

  await item.getByRole("button", { name: /Edytuj zadanie/ }).click();
  await page.locator(".edit-task-text").fill("Zmiana anulowana");
  await page.getByRole("button", { name: "Anuluj" }).click();
  await expect(page.locator(".task-item")).toContainText("Wersja początkowa");

  await page.getByRole("button", { name: /Edytuj zadanie/ }).click();
  await page.locator(".edit-task-text").fill("Wersja poprawiona");
  await page.locator(".task-edit-form select[name='priority']").selectOption("high");
  await page.locator(".task-edit-form input[name='startAt']").fill("2030-06-10T09:15");
  await page.locator(".task-edit-form input[name='dueAt']").fill("2030-06-15T18:30");
  await page.getByRole("button", { name: "Zapisz" }).click();

  await expect(page.locator(".task-item")).toContainText("Wersja poprawiona");
  await expect(page.locator(".task-item")).toContainText("Priorytet: Wysoki");
  expect((await storedTasks(page))[0]).toMatchObject({
    text: "Wersja poprawiona",
    priority: "high",
    startAt: "2030-06-10T09:15",
    dueAt: "2030-06-15T18:30",
  });
});

test("migruje stare dane oraz sortuje zadania aktywne", async ({ page }) => {
  const now = Date.now();
  const past = formatDateTimeLocal(new Date(now - 60 * 60 * 1000));
  const future = formatDateTimeLocal(new Date(now + 60 * 60 * 1000));
  const seededTasks = [
    { id: "legacy", text: "Stare zadanie", completed: false },
    { id: "none", text: "Bez terminu", completed: false, priority: "high", dueAt: null },
    { id: "future", text: "Nadchodzące", completed: false, priority: "low", dueAt: future },
    { id: "past", text: "Zaległe", completed: false, priority: "normal", dueAt: past },
    { id: "done", text: "Wykonane", completed: true, priority: "high", dueAt: past },
  ];

  await page.evaluate(
    ({ key, tasks }) => localStorage.setItem(key, JSON.stringify(tasks)),
    { key: STORAGE_KEY, tasks: seededTasks },
  );
  await page.reload();

  await expect(page.locator(".task-text")).toHaveText([
    "Zaległe",
    "Nadchodzące",
    "Bez terminu",
    "Stare zadanie",
    "Wykonane",
  ]);
  await expect(page.locator(".task-item", { hasText: "Zaległe" })).toContainText("Po terminie");
  await expect(page.locator(".task-item", { hasText: "Nadchodzące" })).not.toContainText("Po terminie");
  await expect(page.locator(".task-item", { hasText: "Wykonane" })).not.toContainText("Po terminie");

  const migrated = (await storedTasks(page)).find((task) => task.id === "legacy");
  expect(migrated).toMatchObject({ priority: "normal", startAt: null, dueAt: null });
});

test("dodaje zakres i liczy pełne doby na podstawie dat kalendarzowych", async ({ page }) => {
  await addTask(page, "Projekt kwartalny", {
    startAt: "2030-01-06T08:00",
    dueAt: "2030-04-15T18:00",
    priority: "high",
  });

  const item = page.locator(".task-item", { hasText: "Projekt kwartalny" });
  await expect(item).toContainText("Start:");
  await expect(item).toContainText("Termin:");
  await expect(item).toContainText("Czas trwania: 99 dni");
  expect((await storedTasks(page))[0]).toMatchObject({
    startAt: "2030-01-06T08:00",
    dueAt: "2030-04-15T18:00",
  });
});

test("odrzuca nieprawidłowy zakres bez modyfikowania danych", async ({ page }) => {
  await page.locator("#task-input").fill("Nieprawidłowe nowe zadanie");
  await page.locator("#task-start-at").fill("2030-06-15T18:00");
  await page.locator("#task-due-at").fill("2030-06-15T17:59");
  await page.locator("#task-form").getByRole("button", { name: "Dodaj" }).click();

  await expect(page.locator("#task-date-error")).toContainText("nie może być wcześniejsze");
  expect(await storedTasks(page)).toEqual([]);

  await page.locator("#task-due-at").fill("2030-06-15T18:00");
  await page.locator("#task-form").getByRole("button", { name: "Dodaj" }).click();
  const beforeEdit = await storedTasks(page);
  await page.getByRole("button", { name: /Edytuj zadanie/ }).click();
  await page.locator(".task-edit-form input[name='dueAt']").fill("2030-06-14T18:00");
  await page.getByRole("button", { name: "Zapisz" }).click();

  await expect(page.locator(".task-edit-form .form-error")).toContainText("nie może być wcześniejsze");
  expect(await storedTasks(page)).toEqual(beforeEdit);
});

test("oddziela dokładną zaległość od kalendarzowej liczby dni", async ({ page }) => {
  await page.clock.install({ time: new Date("2030-06-15T08:00:00Z") });
  await page.reload();
  const dueAt = await page.evaluate(() => {
    const due = new Date(Date.now() + 60_000);
    const pad = (value) => String(value).padStart(2, "0");
    return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T${pad(due.getHours())}:${pad(due.getMinutes())}`;
  });
  await addTask(page, "Termin dzisiaj", { dueAt });
  const item = page.locator(".task-item", { hasText: "Termin dzisiaj" });

  await expect(item).toContainText("Pozostało: 0 dni");
  await expect(item.locator(".overdue-badge")).toHaveCount(0);
  await page.clock.fastForward(60_001);
  await expect(item.locator(".overdue-badge")).toHaveText("Po terminie");
  await expect(item).toContainText("Pozostało: 0 dni");
});

test("rysuje harmonogram według półotwartej osi roku i przycina zakresy", async ({ page }) => {
  const seededTasks = [
    { id: "full", text: "Pełny rok", completed: false, priority: "normal", startAt: "2030-01-01T00:00", dueAt: "2031-01-01T00:00" },
    { id: "one", text: "Jedna doba", completed: false, priority: "low", startAt: "2030-01-06T08:00", dueAt: "2030-01-07T18:00" },
    { id: "zero", text: "Zero dni", completed: false, priority: "normal", startAt: "2030-02-10T08:00", dueAt: "2030-02-10T18:00" },
    { id: "cross", text: "Przez granice", completed: false, priority: "high", startAt: "2029-10-01T08:00", dueAt: "2031-03-01T18:00" },
    { id: "point", text: "Punkt grudniowy", completed: false, priority: "normal", startAt: null, dueAt: "2030-12-31T12:00" },
  ];
  await page.evaluate(({ key, tasks }) => localStorage.setItem(key, JSON.stringify(tasks)), {
    key: STORAGE_KEY,
    tasks: seededTasks,
  });
  await page.reload();
  await page.getByRole("tab", { name: "Harmonogram" }).click();
  await page.locator("#timeline-year").fill("2030");
  await page.locator("#timeline-year").press("Enter");
  await page.locator("#timeline-year").blur();

  const values = await page.locator(".timeline-row").evaluateAll((rows) => Object.fromEntries(rows.map((row) => {
    const bar = row.querySelector(".timeline-bar");
    return [row.querySelector(".timeline-task-name").textContent, {
      left: Number(bar.dataset.left),
      width: Number(bar.dataset.width),
      classes: bar.className,
    }];
  })));
  expect(values["Pełny rok"].left).toBe(0);
  expect(values["Pełny rok"].width).toBe(100);
  expect(values["Jedna doba"].width).toBeCloseTo(100 / 365, 6);
  expect(values["Zero dni"].width).toBe(0);
  expect(values["Przez granice"].left).toBe(0);
  expect(values["Przez granice"].width).toBe(100);
  expect(values["Przez granice"].classes).toContain("continues-before");
  expect(values["Przez granice"].classes).toContain("continues-after");
  expect(values["Punkt grudniowy"].left).toBeGreaterThan(99);
  expect(values["Punkt grudniowy"].left).toBeLessThan(100);

  const alignment = await page.evaluate(() => {
    const months = document.querySelector(".timeline-months").getBoundingClientRect();
    const track = document.querySelector(".timeline-track").getBoundingClientRect();
    return { xDifference: Math.abs(months.x - track.x), widthDifference: Math.abs(months.width - track.width) };
  });
  expect(alignment.xDifference).toBeLessThan(1);
  expect(alignment.widthDifference).toBeLessThan(1);
});

test("harmonogram współpracuje z wyszukiwaniem i filtrami", async ({ page }) => {
  await addTask(page, "Aktywny raport", { startAt: "2030-01-01T08:00", dueAt: "2030-02-01T08:00" });
  await addTask(page, "Wykonany raport", { startAt: "2030-03-01T08:00", dueAt: "2030-04-01T08:00" });
  await page.locator(".task-item", { hasText: "Wykonany raport" }).locator(".task-checkbox").check();
  await page.getByRole("tab", { name: "Harmonogram" }).click();
  await page.locator("#timeline-year").fill("2030");
  await page.locator("#timeline-year").blur();
  await expect(page.locator(".timeline-row")).toHaveCount(2);

  await page.getByRole("button", { name: "Aktywne", exact: true }).click();
  await expect(page.locator(".timeline-row")).toHaveCount(1);
  await expect(page.locator(".timeline-row")).toContainText("Aktywny raport");
  await page.locator("#task-search").fill("brak");
  await expect(page.locator("#timeline-empty")).toBeVisible();
});

test("automatycznie oznacza zadanie po upływie terminu", async ({ page }) => {
  await page.clock.install({ time: new Date("2030-06-15T10:00:00Z") });
  await page.reload();

  const dueAt = await page.evaluate(() => {
    const dueDate = new Date(Date.now() + 60_000);
    const pad = (value) => String(value).padStart(2, "0");

    return [
      dueDate.getFullYear(),
      pad(dueDate.getMonth() + 1),
      pad(dueDate.getDate()),
    ].join("-") + `T${pad(dueDate.getHours())}:${pad(dueDate.getMinutes())}`;
  });

  await addTask(page, "Termin aktywny", { dueAt });
  await addTask(page, "Termin wykonany", { dueAt });
  await page.locator(".task-item", { hasText: "Termin wykonany" })
    .locator(".task-checkbox")
    .check();

  const activeTask = page.locator(".task-item", { hasText: "Termin aktywny" });
  const completedTask = page.locator(".task-item", { hasText: "Termin wykonany" });
  await expect(activeTask).not.toContainText("Po terminie");

  await page.clock.fastForward(60_001);

  await expect(activeTask).toContainText("Po terminie");
  await expect(completedTask).not.toContainText("Po terminie");
});

test("usuwa pojedyncze zadanie i wszystkie wykonane", async ({ page }) => {
  await addTask(page, "Do usunięcia");
  await addTask(page, "Do ukończenia");
  await addTask(page, "Ma pozostać");

  const removable = page.locator(".task-item", { hasText: "Do usunięcia" });
  await removable.getByRole("button", { name: /Usuń zadanie/ }).click();

  const completed = page.locator(".task-item", { hasText: "Do ukończenia" });
  await completed.locator(".task-checkbox").check();
  await page.getByRole("button", { name: "Usuń wykonane" }).click();

  await expect(page.locator(".task-item")).toHaveCount(1);
  await expect(page.locator(".task-item")).toContainText("Ma pozostać");
  expect(await storedTasks(page)).toHaveLength(1);
});

test("widok mobilny mieści się na ekranie i filtry aktualizują aria-pressed", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await addTask(page, "Zadanie kontrolne", {
    startAt: "2030-01-01T08:00",
    dueAt: "2030-12-01T18:00",
  });

  const activeFilter = page.getByRole("button", { name: "Aktywne", exact: true });
  await activeFilter.click();
  await expect(activeFilter).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Wszystkie", exact: true }))
    .toHaveAttribute("aria-pressed", "false");

  const timelineTab = page.getByRole("tab", { name: "Harmonogram" });
  await timelineTab.click();
  await expect(timelineTab).toHaveAttribute("aria-selected", "true");
  await page.locator("#timeline-year").fill("2030");
  await page.locator("#timeline-year").blur();
  const timelineScrolls = await page.locator("#timeline-scroll").evaluate(
    (element) => element.scrollWidth > element.clientWidth,
  );
  expect(timelineScrolls).toBe(true);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
  expect(errors).toEqual([]);
});
