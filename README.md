# Daily Task List

Prosta, responsywna aplikacja do zarządzania codziennymi zadaniami. Powstała
w czystym HTML, CSS i JavaScript, bez frameworków.

## Funkcje

- dodawanie, edytowanie i usuwanie zadań,
- oznaczanie zadań jako wykonane,
- filtry: Wszystkie, Aktywne i Wykonane,
- wyszukiwanie zadań podczas wpisywania,
- opcjonalne rozpoczęcie i zakończenie z datą oraz godziną,
- czas trwania i liczba dni pozostałych do terminu,
- roczny harmonogram z paskami zakresów i przełączaniem lat,
- priorytety: Niski, Normalny i Wysoki,
- oznaczanie zadań zaległych,
- inteligentne sortowanie,
- usuwanie wszystkich wykonanych zadań,
- zapis danych w `localStorage`,
- układ dostosowany do komputera i telefonu.

## Uruchamianie

Aplikacja nie wymaga instalowania zależności ani uruchamiania serwera.

1. Pobierz lub sklonuj repozytorium.
2. Otwórz plik `index.html` w przeglądarce.

W PowerShellu można użyć:

```powershell
Start-Process .\index.html
```

## Testy

Testy przeglądarkowe korzystają z Playwrighta i Chrome. Sprawdzają między
innymi dodawanie, filtrowanie, wyszukiwanie, edycję, sortowanie, `localStorage`,
walidację zakresów, obliczenia kalendarzowe, harmonogram oraz układ mobilny.

Po zainstalowaniu Node.js i pnpm:

```powershell
pnpm install
pnpm test
```

Po zainstalowaniu zależności testy można uruchomić również za pomocą skryptu PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\run-tests.ps1
```

## Dane

Zadania są przechowywane lokalnie w przeglądarce pod kluczem `daily-tasks`.
Aplikacja nie wysyła danych na serwer i nie synchronizuje ich między
urządzeniami ani przeglądarkami.

Starsze zadania bez daty rozpoczęcia są automatycznie uzupełniane o
`startAt: null`. Istniejące terminy `dueAt`, w tym ich godziny, pozostają
zachowane. Godzina decyduje o dokładnym momencie zaległości, natomiast liczba
dni i położenie na harmonogramie wynikają wyłącznie z dat kalendarzowych.

## Struktura projektu

```text
index.html            interfejs aplikacji
style.css             wygląd i układ responsywny
script.js             logika zadań i localStorage
playwright.config.js  konfiguracja testów
tests/                testy i lokalny serwer testowy
```

## Technologie

- HTML5
- CSS3
- JavaScript
- Playwright
- Git i GitHub
