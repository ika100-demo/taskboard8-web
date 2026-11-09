export type StubTask = { id: string; title: string; due_date: string | null };

function base(): string {
  const url = process.env.TASK_API_URL;
  if (!url) throw new Error("TASK_API_URL is not set");
  return url.replace(/\/+$/, "");
}

async function post(path: string, body: unknown): Promise<void> {
  const response = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`stub ${path} answered ${response.status}`);
}

export async function resetStub(tasks?: StubTask[]): Promise<void> {
  await post("/__stub/reset", tasks ? { tasks } : {});
}

export async function setStubMode(mode: "normal" | "down" | "error" | "slow", status?: number): Promise<void> {
  await post("/__stub/mode", status === undefined ? { mode } : { mode, status });
}

export async function stubRequests(): Promise<{ method: string; path: string; body: unknown }[]> {
  const response = await fetch(`${base()}/__stub/requests`);
  return (await response.json()) as { method: string; path: string; body: unknown }[];
}
