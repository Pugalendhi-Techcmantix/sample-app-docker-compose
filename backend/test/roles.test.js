import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { db } from "../src/db.js";
import { PERMISSION_KEYS } from "../src/permissions.js";
import {
  assertNoLeftovers,
  cleanupTestData,
  isMine,
  testEmail,
  testName, makeActor, TEST_PASSWORD } from "./helpers.js";

const app = createApp();
const Role = db.orm.public.Role;
const User = db.orm.public.User;

let admin;
beforeAll(cleanupTestData);
beforeEach(async () => {
  admin = await makeActor(app, { permissions: PERMISSION_KEYS });
});
afterEach(cleanupTestData);
afterAll(async () => {
  await cleanupTestData();
  await assertNoLeftovers();
  await db.close();
});

const createRole = (body) => admin.agent.post("/api/roles").send(body);

describe("roles API", () => {
  it("POST creates a role", async () => {
    const res = await createRole({
      name: testName("Admin"),
      description: "All access",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: testName("Admin"),
      description: "All access",
    });
    expect(res.body.id).toBeTypeOf("number");
    expect(typeof res.body.createdAt).toBe("string");
  });

  it("POST with empty name -> 400 with field detail", async () => {
    const res = await createRole({ name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
    expect(res.body.error.details[0].field).toBe("name");
  });

  it("POST with malformed JSON -> 400, not 500", async () => {
    const res = await admin.agent
      .post("/api/roles")
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBeTypeOf("string");
  });

  it("POST duplicate name with different case -> 409", async () => {
    await createRole({ name: testName("Admin") });
    const res = await createRole({ name: testName("Admin").toUpperCase() });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("Role name already exists");
  });

  it("DB backstop: lower(name) unique index rejects a case-variant even without the pre-check", async () => {
    await Role.create({ name: testName("Admin") });
    await expect(
      Role.create({ name: testName("Admin").toUpperCase() }),
    ).rejects.toMatchObject({
      sqlState: "23505",
    });
  });

  it("LIKE wildcards in a name are not treated as patterns", async () => {
    await createRole({ name: testName("Admin") });
    const res = await createRole({ name: testName("Ad%") });
    expect(res.status).toBe(201);
  });

  it("GET list is sorted by name (own rows only)", async () => {
    await createRole({ name: testName("Staff") });
    await createRole({ name: testName("Admin") });
    await createRole({ name: testName("Manager") });
    const res = await admin.agent.get("/api/roles");
    expect(res.status).toBe(200);
    expect(res.body.filter((x) => isMine(x) && !x.name.includes("actor")).map((x) => x.name)).toEqual(
      ["Admin", "Manager", "Staff"].map(testName),
    );
  });

  it("GET one -> 200; non-numeric or unknown id -> 404", async () => {
    const { body } = await createRole({ name: testName("Admin") });
    expect((await admin.agent.get(`/api/roles/${body.id}`)).status).toBe(200);
    for (const id of [
      "abc",
      "2147483647",
      "0",
      "1.5",
      "-1",
      "99999999999999",
    ]) {
      const res = await admin.agent.get(`/api/roles/${id}`);
      expect(res.status, id).toBe(404);
      expect(res.body).toEqual({ error: { message: "Not found" } });
    }
  });

  it("PUT updates and bumps updatedAt", async () => {
    const { body } = await createRole({ name: testName("Admin") });
    await new Promise((r) => setTimeout(r, 15));
    const res = await admin.agent
      .put(`/api/roles/${body.id}`)
      .send({ name: testName("Super Admin") });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(testName("Super Admin"));
    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(
      new Date(res.body.createdAt).getTime(),
    );
  });

  it("PUT may keep its own name (changing only the case) but not take another role name", async () => {
    const a = (await createRole({ name: testName("Admin") })).body;
    await createRole({ name: testName("Staff") });
    const upper = testName("Admin").toUpperCase();
    expect(
      (await admin.agent.put(`/api/roles/${a.id}`).send({ name: upper }))
        .status,
    ).toBe(200);
    const taken = testName("Staff").toLowerCase();
    expect(
      (await admin.agent.put(`/api/roles/${a.id}`).send({ name: taken }))
        .status,
    ).toBe(409);
  });

  it("PUT / DELETE on unknown or non-numeric id -> 404", async () => {
    const put = (id) =>
      admin.agent
        .put(`/api/roles/${id}`)
        .send({ name: testName("X") });
    expect((await put(2147483647)).status).toBe(404);
    expect((await put("abc")).status).toBe(404);
    expect((await admin.agent.delete("/api/roles/2147483647")).status).toBe(
      404,
    );
    expect((await admin.agent.delete("/api/roles/abc")).status).toBe(404);
  });

  it("DELETE unused role -> 204, then GET -> 404", async () => {
    const { body } = await createRole({ name: testName("Admin") });
    expect((await admin.agent.delete(`/api/roles/${body.id}`)).status).toBe(
      204,
    );
    expect((await admin.agent.get(`/api/roles/${body.id}`)).status).toBe(404);
  });

  it("DELETE a role in use -> 409 with the user count, role survives", async () => {
    const { body } = await createRole({ name: testName("Admin") });
    await User.create({
      fullName: "A",
      email: testEmail("a"),
      roleId: body.id,
    });
    await User.create({
      fullName: "B",
      email: testEmail("b"),
      roleId: body.id,
    });
    const res = await admin.agent.delete(`/api/roles/${body.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("Role is assigned to 2 user(s)");
    expect((await admin.agent.get(`/api/roles/${body.id}`)).status).toBe(200);
  });
});
