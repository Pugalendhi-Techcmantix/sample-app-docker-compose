import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
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

const createUser = (body = {}) =>
  admin.agent
    .post("/api/users")
    .send({
      fullName: "Asha K",
      email: testEmail("Asha"),
      roleId: role.id,
      password: TEST_PASSWORD,
      ...body,
    });

describe("users API", () => {
  it("POST creates a user: lowercased email, roleName, isActive default", async () => {
    const res = await createUser();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      fullName: "Asha K",
      email: testEmail("asha"),
      roleId: role.id,
      roleName: testName("Admin"),
      isActive: true,
    });
    expect(res.body.role).toBeUndefined();
  });

  it("POST with invalid email -> 400 field email", async () => {
    const res = await createUser({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("email");
  });

  it("POST with roleId that does not exist -> 400 field roleId (not 500)", async () => {
    const res = await createUser({ roleId: 2147483647 });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toEqual({
      field: "roleId",
      message: "Role does not exist",
    });
  });

  it("POST with missing / non-integer roleId -> 400 field roleId", async () => {
    const res = await admin.agent
      .post("/api/users")
      .send({ fullName: "A", email: testEmail("a") });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toContain("roleId");
    const res2 = await createUser({ roleId: "abc" });
    expect(res2.status).toBe(400);
  });

  it("POST duplicate email with different case -> 409", async () => {
    await createUser();
    const res = await createUser({
      email: testEmail("ASHA").toUpperCase(),
      fullName: "Other",
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("Email already exists");
  });

  it("GET list includes roleName, sorted by fullName (own rows only)", async () => {
    await createUser({ fullName: "Zed", email: testEmail("z") });
    await createUser({ fullName: "Amy", email: testEmail("a") });
    const res = await admin.agent.get("/api/users");
    expect(res.status).toBe(200);
    const mine = res.body.filter((x) => isMine(x) && x.id !== admin.user.id);
    expect(mine.map((u) => u.fullName)).toEqual(["Amy", "Zed"]);
    expect(mine[0].roleName).toBe(testName("Admin"));
  });

  it("GET one -> 200; non-numeric or unknown id -> 404", async () => {
    const { body } = await createUser();
    expect((await admin.agent.get(`/api/users/${body.id}`)).status).toBe(200);
    for (const id of ["abc", "2147483647"]) {
      const res = await admin.agent.get(`/api/users/${id}`);
      expect(res.status, id).toBe(404);
      expect(res.body).toEqual({ error: { message: "Not found" } });
    }
  });

  it("PUT changes role and deactivates", async () => {
    const other = await db.orm.public.Role.create({ name: testName("Staff") });
    const { body } = await createUser();
    const res = await admin.agent
      .put(`/api/users/${body.id}`)
      .send({
        fullName: "Asha K",
        email: testEmail("asha"),
        roleId: other.id,
        isActive: false,
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      roleId: other.id,
      roleName: testName("Staff"),
      isActive: false,
    });
  });

  it("PUT: unknown id -> 404, unknown roleId -> 400, email taken -> 409", async () => {
    const a = (await createUser()).body;
    await createUser({ email: testEmail("b"), fullName: "B" });
    const ok = {
      fullName: "Asha K",
      email: testEmail("asha"),
      roleId: role.id,
    };
    expect(
      (await admin.agent.put("/api/users/2147483647").send(ok)).status,
    ).toBe(404);
    expect((await admin.agent.put("/api/users/abc").send(ok)).status).toBe(
      404,
    );
    const fk = await admin.agent
      .put(`/api/users/${a.id}`)
      .send({ ...ok, roleId: 2147483647 });
    expect(fk.status).toBe(400);
    expect(fk.body.error.details[0].field).toBe("roleId");
    const dup = await admin.agent
      .put(`/api/users/${a.id}`)
      .send({ ...ok, email: testEmail("B") });
    expect(dup.status).toBe(409);
  });

  it("DELETE -> 204, second DELETE -> 404, non-numeric -> 404", async () => {
    const { body } = await createUser();
    expect((await admin.agent.delete(`/api/users/${body.id}`)).status).toBe(
      204,
    );
    expect((await admin.agent.delete(`/api/users/${body.id}`)).status).toBe(
      404,
    );
    expect((await admin.agent.delete("/api/users/abc")).status).toBe(404);
  });

  it("errors never leak internals: body is always { error: { message } }", async () => {
    const res = await createUser({ roleId: 2147483647 });
    expect(Object.keys(res.body)).toEqual(["error"]);
    expect(JSON.stringify(res.body)).not.toMatch(
      /violates|constraint|sql|stack/i,
    );
  });
});
