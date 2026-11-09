import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test.skip(!process.env.SMOKE_BASE_URL, "SMOKE_BASE_URL not set");

// Read-only, so it runs in every environment. A smoke test that creates or changes data also carries
// @writes in its title (or { tag: "@writes" }) and then runs only in dev (#474).

test("the root page loads at the base URL @smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("root page loads 200 and shows a list or `No tasks yet.` @smoke", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("list").or(page.getByText("No tasks yet."))).not.toHaveCount(0);
});

test("a task added through the form survives a reload @smoke @writes", async ({ page }) => {
  const title = `smoke-${randomUUID()}`;
  await page.goto("/");
  await page.getByLabel(/title/i).fill(title);
  await page.getByRole("button", { name: /add/i }).click();
  await expect(page.getByText(title)).toBeVisible();
  await page.reload();
  await expect(page.getByText(title)).toBeVisible();
});
