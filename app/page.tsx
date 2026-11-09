import { TaskBoard } from "./_components/task-board";
import { listTasks } from "./_lib/task-api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await listTasks();
  return <TaskBoard initialTasks={result.ok ? result.tasks : []} loadFailed={!result.ok} />;
}
