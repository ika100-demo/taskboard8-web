import { expect, test } from "@playwright/test";

import { resetStub, setStubMode, stubRequests } from "./support/stub-client";

const LOAD_FAILED = "Tasks could not be loaded. Please try again later.";
const SAVE_FAILED = "The task could not be saved. Please try again.";

test.beforeEach(async () => {
  await resetStub();
});

test("AC-001.1 lists the tasks in API order with due dates, fetched on every request", async ({ page }) => {
  await resetStub([
    { id: "a", title: "Zebra", due_date: "2026-03-09" },
    { id: "b", title: "Apple", due_date: null },
  ]);
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const main = page.getByRole("main");
  await expect(main.getByTestId("task-title")).toHaveText(["Zebra", "Apple"]);
  await expect(main.getByTestId("task-due")).toHaveText(["2026-03-09", "No due date"]);

  await resetStub([{ id: "c", title: "Changed", due_date: "2027-01-01" }]);
  await page.reload();
  await expect(main.getByTestId("task-title")).toHaveText(["Changed"]);
});

test("AC-001.2 shows No tasks yet. and the form for an empty list", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  await expect(main.getByText("No tasks yet.")).toBeVisible();
  await expect(main.getByRole("list", { name: "Tasks" })).toHaveCount(0);
  await expect(main.getByRole("form", { name: "Add a task" })).toBeVisible();
});

test("AC-001.3 adds a task without reload, empties the form and keeps it after reload", async ({ page }) => {
  await resetStub([{ id: "a", title: "Existing", due_date: null }]);
  await page.goto("/");
  const main = page.getByRole("main");
  await main.getByLabel("Title").fill("  Buy milk  ");
  await main.getByLabel("Due date").fill("2026-05-01");
  await main.getByRole("button", { name: "Add task" }).click();
  await expect(main.getByTestId("task-title")).toHaveText(["Existing", "Buy milk"]);
  await expect(main.getByTestId("task-due")).toHaveText(["No due date", "2026-05-01"]);
  await expect(main.getByLabel("Title")).toHaveValue("");
  await expect(main.getByLabel("Due date")).toHaveValue("");

  const posts = (await stubRequests()).filter((r) => r.method === "POST");
  expect(posts).toHaveLength(1);
  expect(posts[0].body).toEqual({ title: "Buy milk", due_date: "2026-05-01" });

  await page.reload();
  await expect(main.getByTestId("task-title")).toHaveText(["Existing", "Buy milk"]);
});

test("AC-001.3 sends a null due date when none is picked", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  await main.getByLabel("Title").fill("No date");
  await main.getByRole("button", { name: "Add task" }).click();
  await expect(main.getByTestId("task-due")).toHaveText(["No due date"]);
  const posts = (await stubRequests()).filter((r) => r.method === "POST");
  expect(posts.map((p) => p.body)).toEqual([{ title: "No date", due_date: null }]);
});

test("AC-001.4 rejects a blank title without reaching the Task API", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  await main.getByLabel("Title").fill("   ");
  await main.getByLabel("Due date").fill("2026-05-01");
  await main.getByRole("button", { name: "Add task" }).click();
  await expect(main.getByText("Enter a title.")).toBeVisible();
  await expect(main.getByLabel("Title")).toHaveValue("   ");
  await expect(main.getByLabel("Due date")).toHaveValue("2026-05-01");
  expect((await stubRequests()).filter((r) => r.method === "POST")).toHaveLength(0);
});

test("AC-001.4 rejects a title over 200 characters", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  await main.getByLabel("Title").fill("a".repeat(201));
  await main.getByRole("button", { name: "Add task" }).click();
  await expect(main.getByText("The title can be at most 200 characters.")).toBeVisible();
  await expect(main.getByLabel("Title")).toHaveValue("a".repeat(201));
  expect((await stubRequests()).filter((r) => r.method === "POST")).toHaveLength(0);
});

test("AC-001.5 shows the load error with the form when the Task API is down", async ({ page }) => {
  await setStubMode("down");
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const main = page.getByRole("main");
  await expect(main.getByText(LOAD_FAILED)).toBeVisible();
  await expect(main.getByRole("form", { name: "Add a task" })).toBeVisible();
  await expect(main.getByRole("list", { name: "Tasks" })).toHaveCount(0);
});

test("AC-001.5 shows the load error when the Task API answers 5xx", async ({ page }) => {
  await setStubMode("error", 503);
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const main = page.getByRole("main");
  await expect(main.getByText(LOAD_FAILED)).toBeVisible();
  await expect(main.getByRole("form", { name: "Add a task" })).toBeVisible();
});

test("AC-001.5 shows the load error when the Task API is slower than 5 seconds", async ({ page }) => {
  test.setTimeout(20_000);
  await setStubMode("slow");
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const main = page.getByRole("main");
  await expect(main.getByText(LOAD_FAILED)).toBeVisible();
  await expect(main.getByRole("form", { name: "Add a task" })).toBeVisible();
});

test("AC-001.6 shows the save error and keeps list and form when the Task API answers 500", async ({ page }) => {
  await resetStub([{ id: "a", title: "Existing", due_date: null }]);
  await page.goto("/");
  const main = page.getByRole("main");
  await setStubMode("error", 500);
  await main.getByLabel("Title").fill("Buy milk");
  await main.getByLabel("Due date").fill("2026-05-01");
  await main.getByRole("button", { name: "Add task" }).click();
  await expect(main.getByText(SAVE_FAILED)).toBeVisible();
  await expect(main.getByTestId("task-title")).toHaveText(["Existing"]);
  await expect(main.getByLabel("Title")).toHaveValue("Buy milk");
  await expect(main.getByLabel("Due date")).toHaveValue("2026-05-01");
});

test("AC-001.6 shows the save error when the Task API is unreachable", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  await setStubMode("down");
  await main.getByLabel("Title").fill("Buy milk");
  await main.getByRole("button", { name: "Add task" }).click();
  await expect(main.getByText(SAVE_FAILED)).toBeVisible();
  await expect(main.getByLabel("Title")).toHaveValue("Buy milk");
  await expect(main.getByTestId("task")).toHaveCount(0);
});

test("AC-001.6 shows the save error when the Task API is slower than 5 seconds", async ({ page }) => {
  test.setTimeout(20_000);
  await page.goto("/");
  const main = page.getByRole("main");
  await setStubMode("slow");
  await main.getByLabel("Title").fill("Buy milk");
  await main.getByRole("button", { name: "Add task" }).click();
  await expect(main.getByText(SAVE_FAILED)).toBeVisible({ timeout: 10_000 });
  await expect(main.getByLabel("Title")).toHaveValue("Buy milk");
  await expect(main.getByTestId("task")).toHaveCount(0);
});

test("AC-001.7 shows a markup-like title literally on load and after adding", async ({ page }) => {
  const title = "<script>alert(1)</script> & <b>bold</b>";
  await resetStub([{ id: "a", title, due_date: null }]);
  await page.goto("/");
  const main = page.getByRole("main");
  await expect(main.getByTestId("task-title")).toHaveText([title]);
  expect(await main.locator("[data-testid=task] b, [data-testid=task] script").count()).toBe(0);

  await main.getByLabel("Title").fill(title);
  await main.getByRole("button", { name: "Add task" }).click();
  await expect(main.getByTestId("task-title")).toHaveText([title, title]);
  expect(await main.locator("[data-testid=task] b, [data-testid=task] script").count()).toBe(0);
});
