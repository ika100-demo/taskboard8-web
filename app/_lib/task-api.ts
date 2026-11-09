// Server-only Task API client. Never throws; every failure becomes { ok: false }.

export type Task = { id: string; title: string; due_date: string | null };
export type NewTask = { title: string; due_date: string | null };

type Op = "list" | "create";

function fail(op: Op, reason: string): { ok: false } {
  console.error(JSON.stringify({ msg: "task_api_failed", op, reason }));
  return { ok: false };
}

function isTask(v: unknown): v is Task {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.title === "string" &&
    (t.due_date === null || typeof t.due_date === "string")
  );
}

function baseUrl(): string | null {
  const raw = process.env.TASK_API_URL;
  if (!raw) return null;
  const base = raw.replace(/\/+$/, "");
  return base === "" ? null : base;
}

function failureReason(err: unknown): string {
  const name = (err as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
}

export async function listTasks(): Promise<{ ok: true; tasks: Task[] } | { ok: false }> {
  const base = baseUrl();
  if (base === null) return fail("list", "unset");
  try {
    const res = await fetch(`${base}/tasks`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: { accept: "application/json" },
    });
    if (res.status !== 200) return fail("list", `status:${res.status}`);
    const body: unknown = await res.json();
    if (!Array.isArray(body) || !body.every(isTask)) return fail("list", "body");
    return { ok: true, tasks: body };
  } catch (err) {
    return fail("list", failureReason(err));
  }
}

export async function createTask(
  input: NewTask,
): Promise<{ ok: true; task: Task } | { ok: false }> {
  const base = baseUrl();
  if (base === null) return fail("create", "unset");
  try {
    const res = await fetch(`${base}/tasks`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ title: input.title, due_date: input.due_date ?? null }),
    });
    if (res.status !== 201) return fail("create", `status:${res.status}`);
    const body: unknown = await res.json();
    if (!isTask(body)) return fail("create", "body");
    return { ok: true, task: body };
  } catch (err) {
    return fail("create", failureReason(err));
  }
}
