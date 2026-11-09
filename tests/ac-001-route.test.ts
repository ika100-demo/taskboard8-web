import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// Loaded through a variable so tsc (and next build) do not need the module to exist yet.
const target: string = "@/app/api/tasks/route";

async function load() {
  return await import(/* @vite-ignore */ target);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("TASK_API_URL", "http://task-api:8000");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/tasks", () => {
  it("AC-001.3 forwards the trimmed title and due date and returns 201 with the created task", async () => {
    const created = { id: "9", title: "Buy milk", due_date: "2026-05-01" };
    fetchMock.mockResolvedValue(json(created, 201));
    const { POST } = await load();
    const response = await POST(post({ title: "  Buy milk ", due_date: "2026-05-01", extra: 1 }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(created);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: "Buy milk", due_date: "2026-05-01" });
  });

  it("AC-001.3 forwards an omitted, null or empty due date as null", async () => {
    fetchMock.mockImplementation(async () => json({ id: "9", title: "x", due_date: null }, 201));
    const { POST } = await load();
    for (const body of [{ title: "x" }, { title: "x", due_date: null }, { title: "x", due_date: "" }]) {
      await POST(post(body));
    }
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse(call[1].body)).toEqual({ title: "x", due_date: null });
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("AC-001.4 answers 422 invalid_title without calling the Task API", async () => {
    const { POST } = await load();
    const bodies = [{ title: "" }, { title: "   " }, { title: "a".repeat(201) }, { title: 5 }, {}, "not json", "[]"];
    for (const body of bodies) {
      const response = await POST(post(body));
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "invalid_title" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-001.6 answers 502 task_api_unavailable when the Task API fails", async () => {
    const { POST } = await load();
    fetchMock.mockResolvedValue(json({ detail: "x" }, 500));
    let response = await POST(post({ title: "x" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "task_api_unavailable" });
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    response = await POST(post({ title: "x" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "task_api_unavailable" });
  });

  it("AC-001.6 answers 502 when TASK_API_URL is unset", async () => {
    vi.stubEnv("TASK_API_URL", "");
    const { POST } = await load();
    const response = await POST(post({ title: "x" }));
    expect(response.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
