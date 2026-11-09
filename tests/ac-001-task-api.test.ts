import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TASKS = [
  { id: "1", title: "First", due_date: "2026-01-02" },
  { id: "2", title: "Second", due_date: null },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Loaded through a variable so tsc (and next build) do not need the module to exist yet.
const target: string = "@/app/_lib/task-api";

async function load() {
  return await import(/* @vite-ignore */ target);
}

beforeEach(() => {
  vi.stubEnv("TASK_API_URL", "http://task-api:8000");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("listTasks", () => {
  it("AC-001.1 fetches GET /tasks uncached and returns the tasks in the order received", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(TASKS));
    vi.stubGlobal("fetch", fetchMock);
    const { listTasks } = await load();
    const result = await listTasks();
    expect(result).toEqual({ ok: true, tasks: TASKS });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://task-api:8000/tasks");
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("AC-001.1 strips trailing slashes from TASK_API_URL", async () => {
    vi.stubEnv("TASK_API_URL", "http://task-api:8000//");
    const fetchMock = vi.fn().mockResolvedValue(json([]));
    vi.stubGlobal("fetch", fetchMock);
    const { listTasks } = await load();
    await listTasks();
    expect(fetchMock.mock.calls[0][0]).toBe("http://task-api:8000/tasks");
  });

  it("AC-001.5 fails without calling fetch when TASK_API_URL is unset or empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { listTasks } = await load();
    vi.stubEnv("TASK_API_URL", "");
    expect(await listTasks()).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-001.5 fails when the API is unreachable, times out or answers 5xx", async () => {
    const { listTasks } = await load();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await listTasks()).toEqual({ ok: false });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    expect(await listTasks()).toEqual({ ok: false });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "x" }, 503)));
    expect(await listTasks()).toEqual({ ok: false });
  });

  it("AC-001.5 fails on a malformed body", async () => {
    const { listTasks } = await load();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ tasks: [] })));
    expect(await listTasks()).toEqual({ ok: false });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([{ id: "1", title: 5, due_date: null }])));
    expect(await listTasks()).toEqual({ ok: false });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 200 })));
    expect(await listTasks()).toEqual({ ok: false });
  });
});

describe("createTask", () => {
  it("AC-001.3 POSTs the title and due date as JSON and returns the created task", async () => {
    const created = { id: "9", title: "Buy milk", due_date: "2026-05-01" };
    const fetchMock = vi.fn().mockResolvedValue(json(created, 201));
    vi.stubGlobal("fetch", fetchMock);
    const { createTask } = await load();
    const result = await createTask({ title: "Buy milk", due_date: "2026-05-01" });
    expect(result).toEqual({ ok: true, task: created });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://task-api:8000/tasks");
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(JSON.parse(init.body)).toEqual({ title: "Buy milk", due_date: "2026-05-01" });
  });

  it("AC-001.3 always sends due_date, null when there is none", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: "9", title: "x", due_date: null }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const { createTask } = await load();
    await createTask({ title: "x", due_date: null });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: "x", due_date: null });
  });

  it("AC-001.6 fails on anything but 201, unreachable API, timeout or unset URL", async () => {
    const { createTask } = await load();
    const input = { title: "x", due_date: null };
    for (const status of [200, 422, 500]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ id: "9", title: "x", due_date: null }, status)));
      expect(await createTask(input)).toEqual({ ok: false });
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await createTask(input)).toEqual({ ok: false });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    expect(await createTask(input)).toEqual({ ok: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TASK_API_URL", "");
    expect(await createTask(input)).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
