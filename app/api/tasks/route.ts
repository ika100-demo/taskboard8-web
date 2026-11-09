import { createTask } from "@/app/_lib/task-api";
import { validateTitle } from "@/app/_lib/title";

export const dynamic = "force-dynamic";

function invalidTitle(): Response {
  return Response.json({ error: "invalid_title" }, { status: 422 });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidTitle();
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return invalidTitle();
  const { title, due_date: rawDue } = body as Record<string, unknown>;
  if (typeof title !== "string") return invalidTitle();
  const check = validateTitle(title);
  if (!check.ok) return invalidTitle();

  const due_date = typeof rawDue === "string" && rawDue !== "" ? rawDue : null;
  const result = await createTask({ title: check.title, due_date });
  if (!result.ok) {
    return Response.json({ error: "task_api_unavailable" }, { status: 502 });
  }
  return Response.json(result.task, { status: 201 });
}
