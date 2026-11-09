---
spec_id: 001-task-board-at-the-root-url-that-lists
title: Task board at the root URL that lists all tasks and adds new ones
status: building
priority: P1
shape: web-nextjs
parent: ika100-demo/taskboard8-gitops:001-persistent-tasks-and-web-task-board
---

# 001 — Task board at the root URL that lists all tasks and adds new ones

## Problem

The taskboard8 Task API keeps tasks in its own memory, so every restart or new rollout wipes the list, and two running instances would each show a different list. Nobody can rely on a task still being there tomorrow. On top of that, the only way to see or record a task is to call the API by hand: the web app still shows the template's starter page. This spec makes tasks durable in a Postgres database that the system declares, and turns the web app into a task board where people can see all tasks and add new ones.

## System context

Slice of the system plan `001-persistent-tasks-and-web-task-board` in `ika100-demo/taskboard8-gitops` for `taskboard8-web` (web-nextjs). The system criteria and the contract below are binding: every criterion of this spec implements one of them and names it: `(system AC-<NNN>.<n>)`.

### System criteria

- **AC-001.4** Given tasks exist, when a person opens the web app's root URL, then the page shows one entry per task, oldest first, each with its title and its due date as `YYYY-MM-DD`, or the text `No due date` when the task has none, matching what `GET /tasks` of the Task API returns at that moment.
- **AC-001.5** Given no task exists, when a person opens the web app's root URL, then instead of a list the page shows the text `No tasks yet.` together with the form to add a task.
- **AC-001.6** Given the task board is open, when a person enters the title `Buy milk`, optionally picks a due date, and submits the form, then without reloading the page the new task appears as the last entry of the list with that title and due date (or `No due date`), the form fields are emptied, and the task is also returned by `GET /tasks` of the Task API and is still listed after the page is reloaded.
- **AC-001.7** Given the task board is open, when a person submits the form with a title that is empty, only whitespace, or longer than 200 characters after trimming, then no task is created, the form keeps what the person entered, and the page shows `Enter a title.` (empty or whitespace) or `The title can be at most 200 characters.` (too long) next to the title field.
- **AC-001.8** Given the Task API is unreachable or answers with a `5xx` status, when a person opens the web app's root URL, then the page still loads with status `200` and shows `Tasks could not be loaded. Please try again later.` instead of the list; and when a person submits a valid task in that state, then the page shows `The task could not be saved. Please try again.` and the form keeps what the person entered.
- **AC-001.9** Given a task whose title is `<script>alert(1)</script> & <b>bold</b>`, when a person opens the task board, then the title is shown literally as those characters, no script runs and no text is rendered bold.

### Contract

### Task API (taskboard8-api), unchanged from taskboard8-api spec 001

Base URL inside the environment: `http://taskboard8-api` (Service port 80 -> container 8080), given to the web app as
`TASK_API_URL` (no trailing slash). All bodies `application/json`; no authentication.

- `GET /tasks` -> `200`, a JSON array of tasks, oldest first (creation order), `[]` when none. A task is exactly
  `{"id": string, "title": string, "due_date": "YYYY-MM-DD" | null}`; `id` is an opaque non-empty string (do not parse),
  `title` is already trimmed, 1 to 200 characters.
- `POST /tasks` with `{"title": string, "due_date": "YYYY-MM-DD" | null}` (`due_date` may be omitted) -> `201` with the
  created task (same shape). The API trims `title`; the trimmed value must be 1 to 200 characters. Unknown fields are
  ignored.
  - `422` invalid body (FastAPI's standard `{"detail": [...]}`); nothing is stored.
  - `503` the database is unreachable (only for a valid body; validation runs first, so an invalid body still gets
    `422`); nothing is stored.
- `GET /ready` -> `200` when a `SELECT 1` on the database succeeds within 500 ms, else `503`. `GET /health` -> `200`
  whenever the process runs, never touches the database.
- Persistence: tasks are kept in the system's Postgres database (`DATABASE_URL`); order is the order of creation
  across all instances.

### Web app internal route (taskboard8-web, used only by its own browser code)

- `POST /api/tasks` with `{"title": string, "due_date": "YYYY-MM-DD" | null}`. The route trims the title and rejects
  an empty or over-200-character title itself with `422` (the browser has already checked; this guards direct calls)
  without calling the Task API; otherwise it forwards to the Task API's `POST /tasks`.
  - `201` with the Task API's task, unchanged.
  - `502` `{"error": "task_api_unavailable"}` for anything else from the Task API (unreachable, timeout, `5xx`, `422`
    or any unlisted status); the page then shows `The task could not be saved. Please try again.`
- Title length is counted in Unicode code points after `String.prototype.trim()` (Python counts the same way); the
  Task API's rule is authoritative.
- Due date input: an `<input type="date">`; empty means `null`. Display strings are exactly those of the spec:
  `No due date`, `No tasks yet.`, `Enter a title.`, `The title can be at most 200 characters.`,
  `Tasks could not be loaded. Please try again later.`, `The task could not be saved. Please try again.`

### Errors

- Task API error format: `422` is FastAPI's `{"detail": [ ... ]}`; `503` has a JSON body `{"detail": "database
  unavailable"}`, but callers and tests assert only the status, never the body (spec A4).
- The web app treats the Task API's answers as follows. `GET /tasks`: only `200` with a JSON array is success;
  anything else (connection error, timeout, any non-`200` status, a body that is not an array) shows
  `Tasks could not be loaded. Please try again later.` with page status `200`. `POST /tasks`: only `201` is success;
  everything else, `422` included, is "could not be saved" and the form keeps its input.
- The web app's own route answers only `201`, `422` or `502` as listed above; its browser code treats any other
  status or a network error like `502`.
- No retries anywhere: a person retries by reloading or submitting again (no live refresh, A8).

### Timeouts

- Web server -> Task API, `GET /tasks` and `POST /tasks`: 5 seconds total each (`AbortSignal.timeout(5000)`); on
  expiry the call counts as unavailable (messages above). The page is rendered on each request, so a slow API delays
  the page by at most 5 seconds before it shows the load error.
- Browser -> web `POST /api/tasks`: 10 seconds; on expiry the page shows the save error and keeps the form input.
- Task API -> Postgres: connect timeout 2 seconds, statement timeout 3 seconds, so a task request answers `503`
  within 5 seconds when the database is down or hanging; `/ready`'s check is bounded to 500 ms (the kubelet probe
  times out after 1 second). Broken connections are dropped and a new one is opened on the next request, so after
  the database is back the API serves again on its next request and `/ready` turns `200` at the next 5-second probe.
- When the Task API's only pod is not ready, its Service has no endpoints: the web app sees a connection error and
  shows its error messages; that is the intended behaviour.

### Provided by the system

The gitops part of this plan wires these for this repo; rely on them, do not ask for them again:

- env `TASK_API_URL=http://taskboard8-api`

### Notes for this repo

The browser never calls the Task API: the server renders the list and proxies the create (see the contract, A9).
`/api/health` and `/api/ready` must NOT depend on the Task API (AC-001.8 needs the page to load while it is down).
Show `due_date` as the string the API sent; never parse it into a Date (time-zone shifts). Render titles as React
text only; no dangerouslySetInnerHTML anywhere.
Tests: unit tests with a mocked fetch; Playwright e2e against a stub Task API (a small HTTP server implementing
`GET/POST /tasks` of the contract, switchable to down / 500 / slow) at `TASK_API_URL`.
Smoke: read-only `@smoke` "root page loads 200 and shows a list or `No tasks yet.`"; `@smoke @writes` adds
`smoke-<uuid>` and sees it after reload (dev only).
Document `TASK_API_URL` in docs/env-vars.md (server-only; never `NEXT_PUBLIC_`).

## Stories

<!-- As a <persona>, I want <goal>, so that <benefit>. -->

## Acceptance criteria

- **AC-001.1** Given the Task API at `TASK_API_URL` returns tasks from `GET /tasks`, when a person opens `/`, then the page shows one entry per task in the order the API returned them (oldest first), each with its title and its `due_date` shown exactly as the `YYYY-MM-DD` string the API sent, or `No due date` when it is `null`; the list is fetched on every request, never cached or prerendered (system AC-001.4)
- **AC-001.2** Given `GET /tasks` returns `[]`, when a person opens `/`, then the page shows `No tasks yet.` and no list, together with the form to add a task (system AC-001.5)
- **AC-001.3** Given the board is open, when a person enters the title `Buy milk`, optionally picks a due date, and submits, then the web app sends `POST /tasks` to the Task API with the trimmed title and the due date as `YYYY-MM-DD` or `null`, and without a page reload the task the API returned appears as the last entry with its title and due date (or `No due date`), both form fields are emptied, and after a reload the task is still listed (system AC-001.6)
- **AC-001.4** Given the board is open, when a person submits a title that is empty or only whitespace, then no request reaches the Task API, the page shows `Enter a title.` next to the title field and the form keeps what was entered; with a title longer than 200 characters after trimming it shows `The title can be at most 200 characters.` instead (system AC-001.7)
- **AC-001.5** Given the Task API is unreachable, answers a `5xx` status, does not answer within 5 seconds, or `TASK_API_URL` is unset, when a person opens `/`, then the page answers `200` and shows `Tasks could not be loaded. Please try again later.` instead of the list, with the form still shown (system AC-001.8)
- **AC-001.6** Given the Task API is unreachable, slow (over 5 seconds) or answers anything but `201` to `POST /tasks`, when a person submits a valid task, then the page shows `The task could not be saved. Please try again.`, the list is unchanged and the form keeps what was entered (system AC-001.8)
- **AC-001.7** Given a task whose title is `<script>alert(1)</script> & <b>bold</b>`, when a person opens the board or has just added that task, then the title is shown literally as those characters, no script runs and no text is bold (system AC-001.9)

## Non-goals

## Assumptions

<!-- Spec 149: decisions taken by default, approved with the spec. One bullet each: - **A1** <the decision> (other option: <…>; affects AC-…). A revised one is struck through (~~…~~), never deleted. -->

## Open questions

<!-- Only what may not be decided by default (spec 149): security or access, money, destroying or migrating data, or a request too ambiguous to build. Approval is refused while any is open. Strike answered ones (~~…~~) and fold the answer into the criteria. -->

## Changelog

- 2026-11-10 created from the system plan, with its criteria (spec 147)
- 2026-11-10 approved
- 2026-11-10 building
