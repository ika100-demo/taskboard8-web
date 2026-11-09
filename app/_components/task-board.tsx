"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { MESSAGES } from "@/app/_lib/messages";
import type { Task } from "@/app/_lib/task-api";
import { validateTitle } from "@/app/_lib/title";

export type TaskBoardProps = { initialTasks: Task[]; loadFailed: boolean };

function isTask(v: unknown): v is Task {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.title === "string" &&
    (t.due_date === null || typeof t.due_date === "string")
  );
}

export function TaskBoard({ initialTasks, loadFailed }: TaskBoardProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setTitleError(null);
    setSaveError(false);
    const check = validateTitle(title);
    if (!check.ok) {
      setTitleError(check.error === "empty" ? MESSAGES.titleEmpty : MESSAGES.titleTooLong);
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: check.title, due_date: due || null }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.status !== 201) {
        setSaveError(true);
        return;
      }
      const body: unknown = await res.json();
      if (!isTask(body)) {
        setSaveError(true);
        return;
      }
      setTasks((prev) => [...prev, body]);
      setTitle("");
      setDue("");
    } catch {
      setSaveError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="container board">
      <h1>Tasks</h1>
      {loadFailed && (
        <p role="alert" className="error-text">
          {MESSAGES.loadFailed}
        </p>
      )}
      {!loadFailed && tasks.length === 0 && <p>{MESSAGES.noTasks}</p>}
      {tasks.length > 0 && (
        <ul aria-label="Tasks" className="task-list">
          {tasks.map((t) => (
            <li key={t.id} data-testid="task">
              <span data-testid="task-title" className="task-title">
                {t.title}
              </span>
              <span data-testid="task-due" className="task-due">
                {t.due_date ?? MESSAGES.noDueDate}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form aria-label="Add a task" noValidate onSubmit={onSubmit} className="task-form">
        <div className="field">
          <label htmlFor="task-title">Title</label>
          <input
            id="task-title"
            name="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={titleError ? "true" : undefined}
            aria-describedby={titleError ? "task-title-error" : undefined}
          />
          {titleError && (
            <p id="task-title-error" className="error-text">
              {titleError}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="task-due">Due date</label>
          <input
            id="task-due"
            name="due_date"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>
        {saveError && (
          <p role="alert" className="error-text">
            {MESSAGES.saveFailed}
          </p>
        )}
        <button type="submit" disabled={pending}>
          Add task
        </button>
      </form>
    </div>
  );
}
