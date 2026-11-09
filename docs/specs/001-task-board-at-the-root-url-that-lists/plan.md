---
spec_id: 001-task-board-at-the-root-url-that-lists
shape: web-nextjs
spec_hash: 9e409e9708f9
summary: Server-rendered task board at / with a client form that adds tasks through the POST /api/tasks proxy to the Task API
tasks:
  - id: t1
    title: Task API client, title validation and display strings
    files: [app/_lib/task-api.ts, app/_lib/title.ts, app/_lib/messages.ts, docs/env-vars.md]
    covers: [AC-001.1, AC-001.3, AC-001.4, AC-001.5, AC-001.6]
    parallel_safe: true
    depends_on: []
    done: true
  - id: t2
    title: E2E harness - stub Task API and Playwright wiring
    files: [e2e/support/task-api-stub.mjs, e2e/support/stub-client.ts, playwright.config.ts]
    covers: [AC-001.1, AC-001.3, AC-001.5, AC-001.6]
    parallel_safe: true
    depends_on: []
    done: true
  - id: t3
    title: POST /api/tasks proxy route
    files: [app/api/tasks/route.ts]
    covers: [AC-001.3, AC-001.4, AC-001.6]
    parallel_safe: true
    depends_on: [t1]
    done: true
  - id: t4
    title: TaskBoard client component (list, empty state, form, errors, append)
    files: [app/_components/task-board.tsx, app/globals.css]
    covers: [AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.6, AC-001.7]
    parallel_safe: true
    depends_on: [t1]
    done: true
  - id: t5
    title: Root page renders the board; remove the starter page; smoke tests
    files: [app/page.tsx, app/_components/feature-card.tsx, app/_components/icons.tsx, tests/page.test.tsx, e2e/home.spec.ts, e2e/smoke.spec.ts]
    covers: [AC-001.1, AC-001.2, AC-001.5, AC-001.7]
    parallel_safe: true
    depends_on: [t1, t4]
    done: true
---

# Plan — 001 Task board at the root URL that lists all tasks and adds new ones

Levels: t1, t2 → t3, t4 → t5. All signatures, the DOM contract and the stub's control API are in
[design.md](design.md); follow them exactly, the acceptance tests are written against them. `TASK_API_URL` is wired
by the system's gitops plan (no gitops task here). `/api/health` and `/api/ready` stay untouched.

## t1 — Task API client, title validation and display strings

**Files:** app/_lib/task-api.ts, app/_lib/title.ts, app/_lib/messages.ts, docs/env-vars.md
**Covers:** AC-001.1, AC-001.3, AC-001.4, AC-001.5, AC-001.6
**Goal:** the building blocks every other task imports: the six display strings, `validateTitle`, and a server-side
Task API client that never throws and collapses every failure into `{ ok: false }`.

**Implementation notes:**
- `messages.ts`: export `MESSAGES` exactly as in design.md.
- `title.ts`: `validateTitle(raw)` trims with `String.prototype.trim`, counts code points (`[...s].length`), returns
  `empty` / `too_long` / `ok` with the trimmed title; export `MAX_TITLE_LENGTH = 200`. No Node or browser APIs: both
  the route and the client component import it.
- `task-api.ts`: `Task`, `NewTask`, `listTasks()`, `createTask()` per design.md. Read `process.env.TASK_API_URL` at
  call time; unset/empty → `{ ok: false }` with no fetch; strip trailing slashes.
- Both calls: `cache: "no-store"`, `signal: AbortSignal.timeout(5000)`; catch every throw (network, abort, JSON).
- `listTasks` success = `200` + array of well-shaped tasks, order preserved; `createTask` success = `201` + a
  well-shaped task, returned unchanged; always send `due_date` (`null` when none).
- One structured `console.error` line per failure (`task_api_failed`, `op`, `reason`); never log titles.
- No new dependency (no `server-only` package); client code imports only the `Task` type (`import type`).
- `docs/env-vars.md`: new "Task API" section: `TASK_API_URL`, no default (unset → the board shows the load error),
  base URL of the Task API without trailing slash, e.g. `http://taskboard8-api`; server-only, never `NEXT_PUBLIC_`.

**Done when:** the unit acceptance tests for `validateTitle` and the Task API client (mocked `fetch`, `vi.stubEnv`)
pass, including unset URL, timeout, non-200/201 status and malformed bodies; `devbox run quality` is clean.

## t2 — E2E harness: stub Task API and Playwright wiring

**Files:** e2e/support/task-api-stub.mjs, e2e/support/stub-client.ts, playwright.config.ts
**Covers:** AC-001.1, AC-001.3, AC-001.5, AC-001.6
**Goal:** the e2e acceptance tests can run the real app against a controllable stub of the Task API.

**Implementation notes:**
- `task-api-stub.mjs`: `node:http` only; implements `GET/POST /tasks` of the contract (trim, 1–200 code points else
  `422 {"detail": [...]}`, `201` with a `crypto.randomUUID()` id) plus modes `normal | down | error | slow` and the
  `/__stub/*` control endpoints exactly as in design.md. `down` destroys the socket; `slow` waits 6000 ms.
- Listen on `127.0.0.1:${TASK_API_STUB_PORT}`; log one line on start; exit cleanly on SIGTERM.
- `stub-client.ts`: `resetStub`, `setStubMode`, `stubRequests` against `process.env.TASK_API_URL`.
- `playwright.config.ts`, local mode only: choose `TASK_API_STUB_PORT` (env, else `freePort()`), set
  `process.env.TASK_API_URL` before `defineConfig`, `webServer` becomes `[stub, app]` (stub command
  `"${process.execPath}" e2e/support/task-api-stub.mjs`, url `/__stub/health`, `reuseExistingServer: false`), and
  `workers: 1`. Smoke mode (`SMOKE_BASE_URL`) stays exactly as today.

**Done when:** `devbox run e2e` starts both servers and `e2e/task-board.spec.ts` can drive the stub (its tests fail
only on missing app behaviour until t5 lands); `devbox run quality` is clean.

## t3 — POST /api/tasks proxy route

**Files:** app/api/tasks/route.ts
**Covers:** AC-001.3, AC-001.4, AC-001.6
**Goal:** the browser's only way to create a task: validate, forward to the Task API, answer `201`, `422` or `502`.

**Implementation notes:**
- `export const dynamic = "force-dynamic"`; `export async function POST(request: Request)`.
- Parse JSON defensively; non-object body, non-string `title` or a failing `validateTitle` → `422
  {"error": "invalid_title"}` without calling `createTask`.
- Normalise `due_date`: omitted / `null` / `""` → `null`; else forward as given.
- `createTask({ title: trimmed, due_date })`: `ok` → `201` with the task unchanged; else `502
  {"error": "task_api_unavailable"}`.

**Done when:** the route acceptance tests (mocked `fetch`) pass: `201` passthrough, `422` without a Task API call for
empty / whitespace / 201-code-point titles, `502` for unreachable, timeout, `5xx`, `422` and unlisted statuses.

## t4 — TaskBoard client component

**Files:** app/_components/task-board.tsx, app/globals.css
**Covers:** AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.6, AC-001.7
**Goal:** the interactive board: renders the heading, the list / empty state / load error and the add form,
validates in the browser, posts to `/api/tasks`, appends the created task or shows the save error.

**Implementation notes:**
- `"use client"`; `TaskBoard({ initialTasks, loadFailed })`; `import type { Task }` from `app/_lib/task-api`.
- Markup exactly per the DOM contract in design.md, including the `<h1>Tasks</h1>` (rendered by the board, so it is
  present in every state), roles, labels, `data-testid`s and ids.
- Form `noValidate`, controlled title and date inputs, no `required` / `maxLength`.
- Submit flow per design.md steps 1–5; `AbortSignal.timeout(10000)`; button disabled while in flight.
- Titles and due dates as React text only; no `dangerouslySetInnerHTML`; never parse `due_date`.
- Empty-state text only when `!loadFailed && tasks.length === 0`; list whenever `tasks.length > 0`.
- `globals.css`: board styles reusing the existing tokens (list rows, form layout, error text colour); remove the
  starter-only rules (`.hero`, `.grid`, `.card*`, `.steps`, `.actions`, `.eyebrow` and similar) that t5 makes unused.

**Done when:** the component acceptance tests (Testing Library, mocked `fetch`) pass: list order and due-date text,
empty state, validation messages without a request, append and cleared fields on `201`, save error with unchanged
list and kept input on failure/timeout, literal rendering of `<script>alert(1)</script> & <b>bold</b>`.

## t5 — Root page renders the board; remove the starter page; smoke tests

**Files:** app/page.tsx, app/_components/feature-card.tsx, app/_components/icons.tsx, tests/page.test.tsx, e2e/home.spec.ts, e2e/smoke.spec.ts
**Covers:** AC-001.1, AC-001.2, AC-001.5, AC-001.7
**Goal:** `/` is the task board, fetched on every request, always answering `200`.

**Implementation notes:**
- `app/page.tsx`: `export const dynamic = "force-dynamic"`; async default export calls `listTasks()` once and
  renders `<TaskBoard initialTasks={...} loadFailed={...} />`; never throws on Task API failure.
- Delete `app/_components/feature-card.tsx` and `app/_components/icons.tsx` (starter-only) and
  `tests/page.test.tsx` (starter tests; the acceptance tests replace it).
- `e2e/home.spec.ts`: keep the landmark, 404 and phone-width checks; expect `h1` `Tasks`; replace the "Check health"
  link test with a plain `request.get("/api/health")` check (the header's Health link stays).
- `e2e/smoke.spec.ts`: keep the existing read-only test; add read-only `@smoke` "root page loads 200 and shows a list
  or `No tasks yet.`" and `@smoke @writes` that adds `smoke-<uuid>` through the form and sees it after reload.
  Smoke tests use only the base URL, never the stub.

**Done when:** the page acceptance tests (`render(await HomePage())`, mocked `fetch`) and `e2e/task-board.spec.ts`
pass (with t2 and t3 merged); `devbox run ci` is green including the 80% coverage gate.
