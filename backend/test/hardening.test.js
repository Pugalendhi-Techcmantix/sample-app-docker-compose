import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { db } from "../src/db.js";
import { PERMISSION_KEYS } from "../src/permissions.js";
import { PERMISSION_KEYS } from "../src/permissions.js";
import { assertNoLeftovers, cleanupTestData, makeActor, TEST_PASSWORD, testEmail, testName, makeActor, TEST_PASSWORD } from "./helpers.js";

const app = createApp();
let role;
let admin;

beforeAll(cleanupTestData);
beforeEach(async () => {
  admin = await makeActor(app, { permissions: PERMISSION_KEYS });
  role = await db.orm.public.Role.create({ name: testName("Admin") });
});
afterEach(cleanupTestData);
afterAll(async () => {
  await cleanupTestData();
  await assertNoLeftovers();
  await db.close();
});

const user = (o = {}) => ({ fullName: "C", email: testEmail("c"), roleId: role.id, password: TEST_PASSWORD, ...o });
const field = (res, f) => res.body.error.details.map((d) => d.field).includes(f);

describe("input hardening", () => {
  it("roleId above int32 -> 400 roleId (POST and PUT)", async () => {
    const res = await admin.agent.post("/api/users").send(user({ roleId: 99999999999999 }));
    expect(res.status).toBe(400);
    expect(field(res, "roleId")).toBe(true);
    const created = (await admin.agent.post("/api/users").send(user())).body;
    const put = await admin.agent.put(`/api/users/${created.id}`).send(user({ roleId: 99999999999999 }));
    expect(put.status).toBe(400);
    expect(field(put, "roleId")).toBe(true);
  });

  it("NUL character in any string field -> 400 with that field", async () => {
    const cases = [
      ["/api/roles", { name: "a\u0000b" }, "name"],
      ["/api/roles", { name: testName("ok"), description: "a\u0000b" }, "description"],
      ["/api/users", user({ fullName: "a\u0000b" }), "fullName"],
      ["/api/users", user({ email: "a\u0000b@x.com" }), "email"],
    ];
    for (const [url, body, f] of cases) {
      const res = await admin.agent.post(url).send(body);
      expect(res.status, f).toBe(400);
      expect(field(res, f), f).toBe(true);
    }
  });

  it("oversized body -> 413 with error message; malformed JSON stays 400", async () => {
    const big = await admin.agent.post("/api/roles").send({ name: "x".repeat(3 * 1024 * 1024) });
    expect(big.status).toBe(413);
    expect(big.body.error.message).toBeTypeOf("string");
    const bad = await admin.agent.post("/api/roles").set("Content-Type", "application/json").send("{bad");
    expect(bad.status).toBe(400);
  });
});
