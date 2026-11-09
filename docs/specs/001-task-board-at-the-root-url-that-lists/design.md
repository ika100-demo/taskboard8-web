# Design — 001 Task board at the root URL that lists all tasks and adds new ones

The Task API contract and the web app's `POST /api/tasks` route are fixed by the spec (system contract). This design
adds what the testers and coders need beyond it: the module boundaries, the exact signatures the unit tests mock
against, the DOM contract the component and e2e tests select on, and the stub Task API the e2e tests drive.

## Decisions

- **Server-rendered list, client-side append.** `app/page.tsx` stays a Server Component that fetches `GET /tasks` on
  every request (`export const dynamic = "force-dynamic"` plus `fetch(..., { cache: "no-store" })`, AC-001.1) and
  hands the result to one Client Component, `TaskBoard`, which owns the list state and the form. A successful create
  appends the task the API returned to local state; no `router.refresh()`, no Server Action. Reason: the spec demands
  "without a page reload" and a same-origin JSON route (A9); appending keeps it one request and makes the failure
  path ("list is unchanged", AC-001.6) trivial.
- **One shared validation function** (`validateTitle`) used by the browser form and the route, so "empty",
  "whitespace" and "over 200 code points after trim" are decided by the same code (AC-001.4). The browser form uses
  `noValidate` and no `required`/`maxLength` attributes: native validation would block the submit before our message
  can be shown, and `maxLength` would make a 201-character title impossible to type.
- **The Task API client never throws.** It returns a discriminated result (`ok: true | false`); every failure mode in
  the spec (unset `TASK_API_URL`, connection error, 5 s timeout, wrong status, malformed body) collapses into
  `{ ok: false }`. The page and the route then have exactly one error branch each (AC-001.5, AC-001.6).
- **Library code lives under `app/_lib/`**, next to the existing `app/_components/`: the coverage gate only measures
  `app/**`, and the underscore keeps it out of routing.
- **Text only.** Titles and due dates are rendered as React text children; `dangerouslySetInnerHTML` appears nowhere
  (AC-001.7). `due_date` is displayed as the string the API sent, never parsed into a `Date`.
- **e2e against a stub Task API** started by Playwright as a second `webServer`, with control endpoints to switch it to
  down / error / slow and to inspect what it received. Local e2e runs with `workers: 1` because the stub's state is
  shared. Smoke mode (`SMOKE_BASE_URL` set) starts neither the app nor the stub, as today.

No ADR: every choice here is local to this feature; the cross-service decisions (proxy route, no browser call to the
Task API) are the system plan's.

## Modules

| Module | Responsibility | New / changed |
|---|---|---|
| `app/_lib/messages.ts` | the six display strings of the contract, exported as constants | new |
| `app/_lib/title.ts` | `validateTitle` (trim, code-point length, error kind) | new |
| `app/_lib/task-api.ts` | `Task` type, `listTasks`, `createTask`: server-only calls to `TASK_API_URL` | new |
| `app/api/tasks/route.ts` | `POST /api/tasks`: validates, forwards, maps to `201` / `422` / `502` | new |
| `app/_components/task-board.tsx` | `"use client"`: list, empty state, load error, form, save error, append | new |
| `app/page.tsx` | async Server Component: `listTasks()` then `<TaskBoard>` | rewritten (starter page removed) |
| `app/_components/feature-card.tsx`, `app/_components/icons.tsx` | starter-page only | deleted |
| `app/globals.css` | board styles (list, form, error text) | changed |
| `e2e/support/task-api-stub.mjs` | stub Task API for e2e | new |
| `e2e/support/stub-client.ts` | typed helpers the e2e tests call to drive the stub | new |
| `playwright.config.ts` | start the stub, point `TASK_API_URL` at it, `workers: 1` locally | changed |
| `docs/env-vars.md` | documents `TASK_API_URL` | changed |

`app/api/health` and `app/api/ready` are unchanged and must stay independent of the Task API.

## Contract

### Display strings (`app/_lib/messages.ts`)

```ts
export const MESSAGES = {
  noDueDate: "No due date",
  noTasks: "No tasks yet.",
  titleEmpty: "Enter a title.",
  titleTooLong: "The title can be at most 200 characters.",
  loadFailed: "Tasks could not be loaded. Please try again later.",
  saveFailed: "The task could not be saved. Please try again.",
} as const;
```

### Title validation (`app/_lib/title.ts`)

```ts
export const MAX_TITLE_LENGTH = 200;
export type TitleCheck =
  | { ok: true; title: string }              // title = raw.trim()
  | { ok: false; error: "empty" | "too_long" };
export function validateTitle(raw: string): TitleCheck;
```

- `raw.trim()` (`String.prototype.trim`); length counted in Unicode code points (`[...trimmed].length`).
- `""` after trim → `empty`; more than 200 code points → `too_long`; else `ok` with the trimmed title.
- Exactly 200 code points (also 200 astral characters, i.e. 400 UTF-16 units) is valid.

### Task API client (`app/_lib/task-api.ts`, server-only)

```ts
export type Task = { id: string; title: string; due_date: string | null };
export type NewTask = { title: string; due_date: string | null };

export function listTasks(): Promise<{ ok: true; tasks: Task[] } | { ok: false }>;
export function createTask(input: NewTask): Promise<{ ok: true; task: Task } | { ok: false }>;
```

- Reads `process.env.TASK_API_URL` **at call time** (tests use `vi.stubEnv`). Unset or empty → `{ ok: false }`
  without calling `fetch`. Trailing slashes are stripped before appending the path.
- `listTasks`: `fetch(`${base}/tasks`, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(5000),
  headers: { accept: "application/json" } })`. Success only for status `200` and a JSON array whose every element
  has a string `id`, a string `title` and a `due_date` that is a string or `null`; the array is returned in the
  order received. Anything else (throw, abort, other status, non-JSON, non-array, malformed element) → `{ ok: false }`.
- `createTask`: `fetch(`${base}/tasks`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(5000),
  headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ title,
  due_date }) })`. `due_date` is always sent (`null` when none). Success only for status `201` with a body of the task
  shape above → `{ ok: true, task }` (the parsed body, unchanged). Anything else, `422` included → `{ ok: false }`.
- No retries, no logging of titles. A failure is logged once as a structured line
  (`console.error(JSON.stringify({ msg: "task_api_failed", op: "list"|"create", reason }))`, reason is
  `"unset" | "network" | "timeout" | "status:<n>" | "body"`).

### Web route `POST /api/tasks` (`app/api/tasks/route.ts`)

`export async function POST(request: Request): Promise<Response>`; `export const dynamic = "force-dynamic"`.

| Request | Response |
|---|---|
| Body not JSON, not an object, `title` not a string, or `validateTitle(title)` fails | `422` `{"error": "invalid_title"}`; the Task API is **not** called |
| Valid title; `createTask({ title: <trimmed>, due_date })` returns `ok` | `201` with the Task API's task, unchanged |
| Valid title; `createTask` returns `{ ok: false }` | `502` `{"error": "task_api_unavailable"}` |

`due_date`: omitted, `null` or `""` is forwarded as `null`; any other value is forwarded as given (the Task API
is authoritative; its `422` becomes `502`). Unknown fields are dropped. All responses are `application/json`.

### Page and `TaskBoard` (`app/page.tsx`, `app/_components/task-board.tsx`)

```ts
// app/page.tsx
export const dynamic = "force-dynamic";
export default async function HomePage(): Promise<JSX.Element>; // unit tests: render(await HomePage())

// app/_components/task-board.tsx  ("use client")
export function TaskBoard(props: { initialTasks: Task[]; loadFailed: boolean }): JSX.Element;
```

`HomePage` calls `listTasks()` once and renders `<TaskBoard initialTasks={tasks or []} loadFailed={!ok} />`. The
page always answers `200` (it never throws on Task API failure; AC-001.5).

DOM contract (tests select on these; keep them exact):

| Element | Markup | Shown when |
|---|---|---|
| Page heading | `<h1>Tasks</h1>` (the only `h1`) | always |
| Load error | `<p role="alert">Tasks could not be loaded. Please try again later.</p>` | `loadFailed` |
| Empty state | `<p>No tasks yet.</p>` | not `loadFailed` and no tasks |
| Task list | `<ul aria-label="Tasks">`, one `<li data-testid="task">` per task in state order | at least one task in state |
| Task title | `<span data-testid="task-title">{title}</span>` inside the `li` | per task |
| Task due date | `<span data-testid="task-due">{due_date ?? "No due date"}</span>` inside the `li` | per task |
| Form | `<form aria-label="Add a task" noValidate>` | always (also on load error and empty state) |
| Title field | `<input id="task-title" name="title" type="text">` labelled `Title`; `aria-invalid="true"` and `aria-describedby="task-title-error"` while a title error shows | always |
| Title error | `<p id="task-title-error">` with `Enter a title.` or `The title can be at most 200 characters.`, directly after the title field | after a submit with an invalid title, until the next submit |
| Due date field | `<input id="task-due" name="due_date" type="date">` labelled `Due date` | always |
| Submit | `<button type="submit">Add task</button>`, `disabled` while a request is in flight | always |
| Save error | `<p role="alert">The task could not be saved. Please try again.</p>` inside the form | after a failed save, until the next submit |

Behaviour on submit (AC-001.3, AC-001.4, AC-001.6):

1. Clear any previous title error and save error.
2. `validateTitle(titleField)`; on failure show the matching title error, keep both fields, send nothing.
3. `fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body:
   JSON.stringify({ title: <trimmed>, due_date: dueField || null }), signal: AbortSignal.timeout(10000) })`.
4. Status `201`: append the response body (the task) to the list state, empty both fields.
5. Anything else (any other status, network error, timeout, unparseable body): show the save error, leave the list
   and both fields unchanged.

When the initial load failed and a later save succeeds, the load error stays and the list appears below it with the
tasks added in this session (the empty-state text is never shown while `loadFailed`).

### Stub Task API for e2e (`e2e/support/task-api-stub.mjs`)

Plain Node ESM (`node:http`, no dependency), started by Playwright, listening on `127.0.0.1:$TASK_API_STUB_PORT`.
In-memory, mode `normal` at start.

- `GET /tasks`, `POST /tasks`: the Task API contract (trim, 1–200 code points else `422 {"detail": [...]}`;
  `201` with `{ id: <uuid>, title, due_date }`; `due_date` omitted → `null`; list in creation order).
- Modes, applied to `/tasks` only: `normal`; `down` (destroy the socket without answering → connection error at the
  caller); `error` (answer `status`, default `500`, body `{"detail": "stub error"}`, store nothing); `slow` (wait
  6000 ms, then behave as `normal`).
- Control (never affected by the mode): `GET /__stub/health` → `200`; `POST /__stub/reset` body
  `{"tasks"?: Task[]}` → `204`, replaces the store with the given tasks (or empty), mode `normal`, clears the request
  log; `POST /__stub/mode` body `{"mode": "normal"|"down"|"error"|"slow", "status"?: number}` → `204`;
  `GET /__stub/requests` → `200` array of `{ "method": string, "path": string, "body": unknown | null }` for every
  `/tasks` request since the last reset, in arrival order.

Helpers (`e2e/support/stub-client.ts`), reading the stub base from `process.env.TASK_API_URL`:

```ts
export type StubTask = { id: string; title: string; due_date: string | null };
export function resetStub(tasks?: StubTask[]): Promise<void>;
export function setStubMode(mode: "normal" | "down" | "error" | "slow", status?: number): Promise<void>;
export function stubRequests(): Promise<{ method: string; path: string; body: unknown }[]>;
```

`playwright.config.ts`, local mode only (no `SMOKE_BASE_URL`): pick `TASK_API_STUB_PORT` like `E2E_PORT` (env, else
a free port), set `process.env.TASK_API_URL = http://127.0.0.1:<stub port>` before the servers start (the app's
`next start` and the workers inherit it), make `webServer` an array (stub first, `url` its `/__stub/health`; then the
existing app entry), and set `workers: 1`. Smoke mode is unchanged.

### Test file layout

Acceptance tests (testers): unit/component tests in `tests/ac-001-*.test.ts[x]`, e2e in `e2e/task-board.spec.ts`.
Coders own and may edit the existing `tests/page.test.tsx` (starter tests, deleted), `e2e/home.spec.ts` (updated to
the board) and `e2e/smoke.spec.ts` (gains the two smoke tests of the spec's notes).

## Risks

- `playwright.config.ts` may be a template skeleton file that `/platform:update` overwrites; the change is additive
  and confined to local mode, but if an update drops it, the e2e tests lose the stub. Re-apply it or propose the
  stub hook upstream (`/issue:report`).
- A slow Task API delays the page by up to 5 s (contract); the e2e `slow` tests need a per-test timeout above
  that (e.g. `test.setTimeout(20_000)`).
