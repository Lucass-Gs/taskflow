import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "./client.mjs";
test("tenant isolation, membership, concurrent version and audit", async () => {
  const owner = await new Client().login(),
    peer = await new Client().login("bruno@example.test"),
    outside = await new Client().login("carla@example.test");
  const wid = "10000000-0000-4000-8000-000000000001",
    pid = "20000000-0000-4000-8000-000000000001";
  assert.equal(
    (await outside.request("/projects/" + pid + "/tasks")).status,
    404,
  );
  assert.equal(
    (
      await peer.request("/workspaces/" + wid + "/members", "POST", {
        email: "carla@example.test",
      })
    ).status,
    403,
  );
  const task = await owner.ok("/projects/" + pid + "/tasks", "POST", {
    title: "Concurrent test " + Date.now(),
    description: "Preserve this description",
  });
  const updates = await Promise.all([
    owner.request("/tasks/" + task.id, "PATCH", {
      status: "doing",
      version: 1,
    }),
    peer.request("/tasks/" + task.id, "PATCH", { status: "done", version: 1 }),
  ]);
  assert.deepEqual(updates.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    updates.find((r) => r.status === 200).value.description,
    "Preserve this description",
  );
  assert.equal(
    (
      await outside.request("/tasks/" + task.id, "PATCH", {
        title: "intrusion",
        version: 2,
      })
    ).status,
    404,
  );
  assert.equal(
    (await outside.request("/tasks/" + task.id, "DELETE", { version: 2 }))
      .status,
    404,
  );
  assert.ok(
    (await owner.ok("/workspaces/" + wid + "/audit")).some(
      (a) => a.resource_id === task.id,
    ),
  );
  await owner.ok("/tasks/" + task.id, "DELETE", { version: 2 });
});
