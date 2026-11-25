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
import { PERMISSION_KEYS, keepsAdminRole } from "../src/permissions.js";
import {
  assertNoLeftovers,
  cleanupTestData,
  isMine,
  makeActor,
  testEmail,
  testName,
} from "./helpers.js";

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

const post = (body) => admin.agent.post("/api/roles").send(body);

describe("role permissions", () => {
  it("create stores permissions de-duplicated and sorted; default is empty", async () => {
    const res = await post({
      name: testName("a"),
      permissions: ["users.view", "roles.view", "users.view"],
    });
    expect(res.status).toBe(201);
    expect(res.body.permissions).toEqual(["roles.view", "users.view"]);
    const none = await post({ name: testName("b") });
    expect(none.body.permissions).toEqual([]);
  });

  it("unknown permission or wrong type -> 400 field permissions", async () => {
    for (const permissions of [
      ["users.fly"],
      "users.view",
      [1],
      ["users.view", null],
    ]) {
      const res = await post({ name: testName("bad"), permissions });
      expect(res.status, JSON.stringify(permissions)).toBe(400);
      expect(res.body.error.details.map((d) => d.field)[0]).toMatch(
        /^permissions/,
      );
    }
  });

  it("update replaces permissions", async () => {
    const r = (await post({ name: testName("r"), permissions: ["users.view"] }))
      .body;
    const res = await admin.agent
      .put(`/api/roles/${r.id}`)
      .send({ name: testName("r"), permissions: ["roles.view", "users.view"] });
    expect(res.status).toBe(200);
    expect(res.body.permissions).toEqual(["roles.view", "users.view"]);
  });

  it("list and get carry permissions and userCount", async () => {
    const r = (
      await post({ name: testName("counted"), permissions: ["users.view"] })
    ).body;
    await User.create({ fullName: "A", email: testEmail("c1"), roleId: r.id });
    await User.create({ fullName: "B", email: testEmail("c2"), roleId: r.id });
    const list = (await admin.agent.get("/api/roles")).body.filter(isMine);
    const mine = list.find((x) => x.id === r.id);
    expect(mine).toMatchObject({ permissions: ["users.view"], userCount: 2 });
    expect(list.find((x) => x.id === admin.role.id).userCount).toBe(1);
    expect((await admin.agent.get(`/api/roles/${r.id}`)).body).toMatchObject({
      permissions: ["users.view"],
      userCount: 2,
    });
  });

  it("GET /roles/options is not captured by /roles/:id", async () => {
    const res = await admin.agent.get("/api/roles/options");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("safety rule: keep a role with roles.manage and users.edit", () => {
  const roles = [
    { id: 1, permissions: ["roles.manage", "users.edit"] },
    { id: 2, permissions: ["users.view"] },
    { id: 3, permissions: ["roles.manage"] },
  ];

  it("keepsAdminRole (pure logic)", () => {
    expect(keepsAdminRole(roles, 1, null)).toBe(false);
    expect(keepsAdminRole(roles, 1, ["roles.manage"])).toBe(false);
    expect(keepsAdminRole(roles, 1, PERMISSION_KEYS)).toBe(true);
    expect(keepsAdminRole(roles, 2, null)).toBe(true);
    expect(keepsAdminRole(roles, 3, ["users.edit", "roles.manage"])).toBe(true);
    expect(
      keepsAdminRole(
        [...roles, { id: 4, permissions: PERMISSION_KEYS }],
        1,
        null,
      ),
    ).toBe(true);
  });

  // Whether the real database already has an admin-capable role decides which branch of the
  // API assertions applies, so both outcomes are asserted explicitly.
  async function otherAdminRoleExists() {
    const all = await Role.all();
    return all.some(
      (r) =>
        r.id !== admin.role.id &&
        !isMine(r) &&
        ["roles.manage", "users.edit"].every((p) => r.permissions.includes(p)),
    );
  }

  it("removing the admin permissions from the last admin role -> 409 (allowed if another real admin role exists)", async () => {
    const res = await admin.agent
      .put(`/api/roles/${admin.role.id}`)
      .send({ name: admin.role.name, permissions: ["users.view"] });
    if (await otherAdminRoleExists()) {
      expect(res.status).toBe(200);
    } else {
      expect(res.status).toBe(409);
      expect(res.body.error.message).toBe(
        "At least one role must keep roles.manage and users.edit",
      );
    }
  });

  it("a second admin-capable role makes the change allowed", async () => {
    await Role.create({
      name: testName("second-admin"),
      permissions: ["roles.manage", "users.edit"],
    });
    const res = await admin.agent
      .put(`/api/roles/${admin.role.id}`)
      .send({ name: admin.role.name, permissions: ["users.view"] });
    expect(res.status).toBe(200);
  });

  it("deleting the last admin-capable role -> 409 (allowed if another real admin role exists)", async () => {
    const only = await Role.create({
      name: testName("only-admin"),
      permissions: ["roles.manage", "users.edit"],
    });
    // the signed-in actor role also holds both permissions, so strip users.edit from it first
    await Role.where({ id: admin.role.id }).update({
      permissions: ["roles.manage", "users.view"],
    });
    const res = await admin.agent.delete(`/api/roles/${only.id}`);
    if (await otherAdminRoleExists()) {
      expect(res.status).toBe(204);
    } else {
      expect(res.status).toBe(409);
      expect(res.body.error.message).toBe(
        "At least one role must keep roles.manage and users.edit",
      );
    }
  });
});
