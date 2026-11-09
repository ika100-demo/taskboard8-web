import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const SAVE_FAILED = "The task could not be saved. Please try again.";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function renderBoard(props: { initialTasks?: { id: string; title: string; due_date: string | null }[]; loadFailed?: boolean } = {}) {
  const { TaskBoard } = await import("@/app/_components/task-board");
  render(<TaskBoard initialTasks={props.initialTasks ?? []} loadFailed={props.loadFailed ?? false} />);
}

function fill(title: string, due = "") {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: title } });
  fireEvent.change(screen.getByLabelText("Due date"), { target: { value: due } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Add task" }));
}

function titles() {
  return screen.queryAllByTestId("task-title").map((el) => el.textContent);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TaskBoard", () => {
  it("AC-001.3 posts the trimmed title and due date, appends the returned task and empties the fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: "9", title: "Buy milk", due_date: "2026-05-01" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    await renderBoard({ initialTasks: [{ id: "1", title: "Old", due_date: null }] });
    fill("  Buy milk  ", "2026-05-01");
    submit();
    await waitFor(() => expect(titles()).toEqual(["Old", "Buy milk"]));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tasks");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ title: "Buy milk", due_date: "2026-05-01" });
    const last = screen.getAllByTestId("task")[1];
    expect(within(last).getByTestId("task-due")).toHaveTextContent("2026-05-01");
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText("Due date")).toHaveValue("");
  });

  it("AC-001.3 sends a null due date when none is picked and shows No due date", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: "9", title: "Buy milk", due_date: null }, 201));
    vi.stubGlobal("fetch", fetchMock);
    await renderBoard();
    fill("Buy milk");
    submit();
    await waitFor(() => expect(titles()).toEqual(["Buy milk"]));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: "Buy milk", due_date: null });
    expect(screen.getByTestId("task-due")).toHaveTextContent("No due date");
    expect(screen.queryByText("No tasks yet.")).not.toBeInTheDocument();
  });

  it("AC-001.4 shows Enter a title. for a blank title, sends nothing and keeps the input", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await renderBoard();
    fill("   ", "2026-05-01");
    submit();
    const error = await screen.findByText("Enter a title.");
    expect(error).toHaveAttribute("id", "task-title-error");
    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Title")).toHaveValue("   ");
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-05-01");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-001.4 shows the length error for a title over 200 characters", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await renderBoard();
    fill("a".repeat(201));
    submit();
    expect(await screen.findByText("The title can be at most 200 characters.")).toBeInTheDocument();
    expect(screen.queryByText("Enter a title.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("a".repeat(201));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-001.5 keeps the load error and form when the initial load failed, with no empty-state text", async () => {
    await renderBoard({ loadFailed: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Tasks could not be loaded. Please try again later.");
    expect(screen.queryByText("No tasks yet.")).not.toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Add a task" })).toBeInTheDocument();
  });

  it("AC-001.6 shows the save error and keeps list and fields on a non-201, network error or timeout", async () => {
    const failures = [
      vi.fn().mockResolvedValue(json({ error: "task_api_unavailable" }, 502)),
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
      vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")),
    ];
    for (const fetchMock of failures) {
      vi.stubGlobal("fetch", fetchMock);
      await renderBoard({ initialTasks: [{ id: "1", title: "Old", due_date: null }] });
      fill("Buy milk", "2026-05-01");
      submit();
      const form = screen.getByRole("form", { name: "Add a task" });
      expect(await within(form).findByRole("alert")).toHaveTextContent(SAVE_FAILED);
      expect(titles()).toEqual(["Old"]);
      expect(screen.getByLabelText("Title")).toHaveValue("Buy milk");
      expect(screen.getByLabelText("Due date")).toHaveValue("2026-05-01");
      document.body.innerHTML = "";
    }
  });

  it("AC-001.7 shows a just-added markup-like title literally", async () => {
    const title = "<script>alert(1)</script> & <b>bold</b>";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ id: "9", title, due_date: null }, 201)));
    await renderBoard();
    fill(title);
    submit();
    await waitFor(() => expect(titles()).toEqual([title]));
    expect(screen.getByTestId("task").querySelector("b, script")).toBeNull();
  });
});
