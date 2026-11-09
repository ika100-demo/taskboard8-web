// Stub Task API for e2e tests: in-memory, controlled through /__stub/* endpoints.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.TASK_API_STUB_PORT);

let store = [];
let mode = "normal";
let errorStatus = 500;
let requests = [];

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function parse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function send(res, status, body) {
  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function handleTasks(req, res, body) {
  if (req.method === "GET") return send(res, 200, store);
  if (req.method === "POST") {
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const length = [...title].length;
    if (length < 1 || length > 200) return send(res, 422, { detail: [{ msg: "invalid title", loc: ["body", "title"] }] });
    const task = { id: randomUUID(), title, due_date: body.due_date ?? null };
    store.push(task);
    return send(res, 201, task);
  }
  return send(res, 405, { detail: "method not allowed" });
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://stub").pathname;
  const text = await readBody(req);
  const body = parse(text);

  if (path === "/__stub/health") return send(res, 200, { ok: true });
  if (path === "/__stub/reset" && req.method === "POST") {
    store = Array.isArray(body?.tasks) ? [...body.tasks] : [];
    mode = "normal";
    errorStatus = 500;
    requests = [];
    return send(res, 204);
  }
  if (path === "/__stub/mode" && req.method === "POST") {
    mode = body?.mode ?? "normal";
    errorStatus = typeof body?.status === "number" ? body.status : 500;
    return send(res, 204);
  }
  if (path === "/__stub/requests" && req.method === "GET") return send(res, 200, requests);

  if (path === "/tasks") {
    requests.push({ method: req.method, path, body });
    if (mode === "down") {
      req.socket.destroy();
      return;
    }
    if (mode === "error") return send(res, errorStatus, { detail: "stub error" });
    if (mode === "slow") {
      setTimeout(() => handleTasks(req, res, body), 6000);
      return;
    }
    return handleTasks(req, res, body);
  }
  return send(res, 404, { detail: "not found" });
});

server.listen(port, "127.0.0.1");
