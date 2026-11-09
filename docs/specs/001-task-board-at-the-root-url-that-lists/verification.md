# Verification — 001 Task board at the root URL that lists all tasks and adds new ones

**Result:** pass
**Commit:** 9be13b4 · **Base:** f163807 · **Trace:** 7/7 criteria named by tests

| Criterion | Verdict | Tests | Implementation | Notes |
|---|---|---|---|---|
| AC-001.1 | met | `tests/ac-001-page.test.tsx` "AC-001.1 lists the tasks in API order…" and "AC-001.1 is rendered on every request…"; `tests/ac-001-task-api.test.ts` "AC-001.1 fetches GET /tasks uncached…"; `e2e/task-board.spec.ts` "AC-001.1 lists the tasks in API order…" | `app/page.tsx:4` (`force-dynamic`), `app/page.tsx:7-8`; `app/_lib/task-api.ts:39-48` (`cache: "no-store"`, order kept); `app/_components/task-board.tsx:78-86` (`due_date ?? "No due date"`, no Date parsing) | Non-alphabetical order (Zebra, Apple, Mango) proves API order; e2e changes the stub and reloads, proving a fresh fetch per request. |
| AC-001.2 | met | `tests/ac-001-page.test.tsx` "AC-001.2 shows the empty state and the form, no list"; `e2e/task-board.spec.ts` "AC-001.2 shows No tasks yet. …" | `app/_components/task-board.tsx:75-76`, form `:90` | Asserts the text, absence of the list and presence of the form with both fields and the button. |
| AC-001.3 | met | `tests/ac-001-task-board.test.tsx` both "AC-001.3 …" tests; `tests/ac-001-route.test.ts` both "AC-001.3 …" tests; `tests/ac-001-task-api.test.ts` both "AC-001.3 …" tests; `tests/ac-001-title.test.ts` "AC-001.3 returns the trimmed title"; `e2e/task-board.spec.ts` both "AC-001.3 …" tests | `app/_components/task-board.tsx:35-59` (trim, `due \|\| null`, append, clear); `app/api/tasks/route.ts:20-28`; `app/_lib/task-api.ts:60-70` | e2e reads the stub's request log: one POST with `{"title":"Buy milk","due_date":"2026-05-01"}` (trimmed), and `null` without a date; new task is last, fields empty, still listed after reload. |
| AC-001.4 | met | `tests/ac-001-task-board.test.tsx` both "AC-001.4 …" tests; `tests/ac-001-title.test.ts` "AC-001.4 …" (empty, whitespace, 200/201, code points); `tests/ac-001-route.test.ts` "AC-001.4 answers 422…"; `e2e/task-board.spec.ts` both "AC-001.4 …" tests | `app/_lib/title.ts:7-12`; `app/_components/task-board.tsx:35-39`, `:102-106`; `app/api/tasks/route.ts:19-21` | No request: `fetch` not called (unit) and no POST in the stub log (e2e). Position next to the field asserted via `id="task-title-error"` + `aria-invalid` for the blank case; the too-long message uses the same element (`task-board.tsx:102`). Observation: the plain empty title `""` is tested at `validateTitle` and route level, not through the form (same code path). |
| AC-001.5 | met | `tests/ac-001-page.test.tsx` "AC-001.5 shows the load error and the form when the Task API fails or is unset" (network, 500, timeout, unset); `tests/ac-001-task-api.test.ts` "AC-001.5 …" (unset, `AbortSignal.timeout(5000)`, unreachable/timeout/5xx, malformed body); `tests/ac-001-task-board.test.tsx` "AC-001.5 …"; `e2e/task-board.spec.ts` three "AC-001.5 …" tests (down, 503, slow 6 s) asserting status `200` | `app/_lib/task-api.ts:23-28` (unset), `:42` (5000 ms), `:45-51`; `app/page.tsx:7-8` (never throws); `app/_components/task-board.tsx:70-76` | The 5 s bound is asserted exactly (spy on `AbortSignal.timeout`, signal passed to fetch) and end to end (stub slow at 6 s shows the error, not the empty state). Unset URL is unit-only; the page renders without throwing, so it answers 200. |
| AC-001.6 | met | `tests/ac-001-task-board.test.tsx` "AC-001.6 …" (502, network, timeout); `tests/ac-001-route.test.ts` both "AC-001.6 …" tests; `tests/ac-001-task-api.test.ts` "AC-001.6 limits POST /tasks to 5 seconds…" and "AC-001.6 fails on anything but 201…" (200, 422, 500, network, timeout, unset); `e2e/task-board.spec.ts` three "AC-001.6 …" tests (500, down, slow) | `app/_lib/task-api.ts:63-72`; `app/api/tasks/route.ts:24-27`; `app/_components/task-board.tsx:48-61`, `:118-122` | Each test asserts the save message inside the form, the list unchanged and both fields kept. |
| AC-001.7 | met | `tests/ac-001-page.test.tsx` "AC-001.7 shows a markup-like title literally"; `tests/ac-001-task-board.test.tsx` "AC-001.7 shows a just-added markup-like title literally"; `e2e/task-board.spec.ts` "AC-001.7 … on load and after adding" | `app/_components/task-board.tsx:80-82` (React text child); no `dangerouslySetInnerHTML` anywhere under `app/` | `textContent` equals the exact string and no `b`/`script` element exists inside the task, both on load and after adding, in jsdom and in Chromium. |

## Non-goals

The spec lists none. No feature beyond the criteria was added (no edit/delete, no live refresh, no retries: `task-api.ts` has a single fetch per call). Template-owned layout is untouched: `app/layout.tsx`, `app/api/health` and `app/api/ready` have no diff; `e2e/home.spec.ts` still asserts banner, main and contentinfo. Every e2e acceptance assertion is scoped to `getByRole("main")`, so none of them depends on the header or footer (#478). The removed CSS (`.hero`, `.eyebrow`, `.dot`, `.hero-title`, `.grid`, `.card*`, `.steps`, the `rise` animation) belonged only to the starter page, as plan t4 says; header and footer rules are unchanged. ✔

## Deviations from the plan

- `tests/ac-001-*.test.ts[x]` and `e2e/task-board.spec.ts` are in no task's `files`: these are the tester's acceptance tests (design "Test file layout"). Acceptable.
- `docs/backlog.md` and the spec's `spec.md`, `design.md`, `plan.md` are in no task's `files`: these are the generated index and the spec artifacts. Acceptable. Minor: the backlog row still says `approved` while `spec.md` says `building`; `cplat spec index` regenerates it.
- All tasks t1–t5 are `done: true`.

## Contract

Matches `design.md` (messages, `validateTitle`, `listTasks`/`createTask` with `no-store` and `AbortSignal.timeout(5000)`, the route's `201`/`422`/`502` with `invalid_title`/`task_api_unavailable`, the DOM contract, browser timeout 10 s at `task-board.tsx:46`, the stub's modes and control endpoints, `workers: 1` and the stub `webServer` in local mode only), with two minor differences, both acceptable:

- `app/api/tasks/route.ts:23` turns a `due_date` that is not a string (e.g. a number) into `null`. The design says to forward "any other value as given", so the Task API's `422` would become `502`. The browser only ever sends a string or `null`, so a person never sees the difference. Only a direct call to the route behaves differently, and `NewTask.due_date` is typed `string | null`.
- `TaskBoard` also checks the shape of the `201` body (`task-board.tsx:52-56`) and shows the save error for a malformed one. This is consistent with design step 5 ("unparseable body").

## Mutation check (report only)

Skipped: no mutation check for shape web-nextjs yet.
