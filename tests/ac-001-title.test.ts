import { describe, expect, it } from "vitest";

async function load() {
  return await import("@/app/_lib/title");
}

describe("validateTitle", () => {
  it("AC-001.4 rejects an empty title", async () => {
    const { validateTitle } = await load();
    expect(validateTitle("")).toEqual({ ok: false, error: "empty" });
  });

  it("AC-001.4 rejects a whitespace-only title", async () => {
    const { validateTitle } = await load();
    expect(validateTitle("   \t\n ")).toEqual({ ok: false, error: "empty" });
  });

  it("AC-001.3 returns the trimmed title", async () => {
    const { validateTitle } = await load();
    expect(validateTitle("  Buy milk  ")).toEqual({ ok: true, title: "Buy milk" });
  });

  it("AC-001.4 accepts exactly 200 characters and rejects 201 after trimming", async () => {
    const { validateTitle } = await load();
    expect(validateTitle("a".repeat(200))).toEqual({ ok: true, title: "a".repeat(200) });
    expect(validateTitle(`  ${"a".repeat(200)}  `)).toEqual({ ok: true, title: "a".repeat(200) });
    expect(validateTitle("a".repeat(201))).toEqual({ ok: false, error: "too_long" });
  });

  it("AC-001.4 counts code points, not UTF-16 units", async () => {
    const { validateTitle } = await load();
    expect(validateTitle("😀".repeat(200)).ok).toBe(true);
    expect(validateTitle("😀".repeat(201))).toEqual({ ok: false, error: "too_long" });
  });
});
