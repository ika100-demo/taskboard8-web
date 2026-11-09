import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Loaded through a variable so tsc does not check the page's current shape.
const target: string = "@/app/page";

async function loadPage() {
  return await import(/* @vite-ignore */ target);
}

async function renderPage() {
  const { default: HomePage } = await loadPage();
  render(await HomePage());
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

describe("HomePage", () => {
  it("AC-001.1 is rendered on every request, never prerendered or cached", async () => {
    const page = await loadPage();
    expect(page.dynamic).toBe("force-dynamic");
  });

  it("AC-001.1 lists the tasks in API order with title and due date strings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json([
          { id: "1", title: "Zebra", due_date: "2026-03-09" },
          { id: "2", title: "Apple", due_date: null },
          { id: "3", title: "Mango", due_date: "2025-12-31" },
        ]),
      ),
    );
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Tasks" });
    const items = within(list).getAllByTestId("task");
    expect(items.map((li) => within(li).getByTestId("task-title").textContent)).toEqual(["Zebra", "Apple", "Mango"]);
    expect(items.map((li) => within(li).getByTestId("task-due").textContent)).toEqual(["2026-03-09", "No due date", "2025-12-31"]);
  });

  it("AC-001.2 shows the empty state and the form, no list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    await renderPage();
    expect(screen.getByText("No tasks yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Add a task" });
    expect(within(form).getByLabelText("Title")).toBeInTheDocument();
    expect(within(form).getByLabelText("Due date")).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Add task" })).toBeInTheDocument();
  });

  it("AC-001.5 shows the load error and the form when the Task API fails or is unset", async () => {
    const scenarios: (() => void)[] = [
      () => vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed"))),
      () => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "x" }, 500))),
      () => vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError"))),
      () => vi.stubEnv("TASK_API_URL", ""),
    ];
    for (const setup of scenarios) {
      setup();
      await renderPage();
      expect(screen.getByRole("alert")).toHaveTextContent("Tasks could not be loaded. Please try again later.");
      expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
      expect(screen.queryByText("No tasks yet.")).not.toBeInTheDocument();
      expect(screen.getByRole("form", { name: "Add a task" })).toBeInTheDocument();
      document.body.innerHTML = "";
    }
  });

  it("AC-001.7 shows a markup-like title literally", async () => {
    const title = "<script>alert(1)</script> & <b>bold</b>";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([{ id: "1", title, due_date: null }])));
    await renderPage();
    const item = screen.getByTestId("task");
    expect(within(item).getByTestId("task-title").textContent).toBe(title);
    expect(item.querySelector("b, script")).toBeNull();
  });
});
