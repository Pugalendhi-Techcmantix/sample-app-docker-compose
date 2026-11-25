import request from "supertest";
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
  makeActor,
  TEST_PASSWORD,
  testEmail,
  testName,
} from "./helpers.js";

const app = createApp();
const Role = db.orm.public.Role;
const User = db.orm.public.User;

const MANAGER = ["users.view", "users.create", "users.edit", "roles.view"];
const ASSIGN_MSG =
  "You cannot assign a role with more permissions than your own";
const MODIFY_MSG =
  "You cannot modify a user whose role has more permissions than your own";

let admin; // all six permissions
let manager; // seeded-Manager-like
let adminRole; // dummy role with all six
let managerRole;
let target; // a user holding adminRole

beforeAll(cleanupTestData);
beforeEach(async () => {
  admin = await makeActor(app, { permissions: PERMISSION_KEYS });
  manager = await makeActor(app, { permissions: MANAGER });
  adminRole = admin.role;
  managerRole = manager.role;
  target = await makeActor(app, {
    permissions: PERMISSION_KEYS,
    signIn: false,
  });
});
afterEach(cleanupTestData);
afterAll(async () => {
  await cleanupTestData();
  await assertNoLeftovers();
  await db.close();
});

const userBody = (o = {}) => ({
  fullName: "E",
  email: testEmail("esc"),
  roleId: managerRole.id,
  password: TEST_PASSWORD,
  ...o,
});

describe("privilege escalation through users.create / users.edit", () => {
  it("manager cannot create a user with a role that has more permissions (403)", async () => {
    const res = await manager.agent
      .post("/api/users")
      .send(userBody({ roleId: adminRole.id }));
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(ASSIGN_MSG);
    expect(await User.where({ email: testEmail("esc") }).first()).toBeNull();
  });

  it("manager can create a user with a role whose permissions are a subset of the manager", async () => {
    const res = await manager.agent.post("/api/users").send(userBody());
    expect(res.status).toBe(201);
    const lower = await Role.create({
      name: testName("lower"),
      permissions: ["users.view"],
    });
    const res2 = await manager.agent
      .post("/api/users")
      .send(userBody({ email: testEmail("esc2"), roleId: lower.id }));
    expect(res2.status).toBe(201);
  });

  it("manager cannot promote another user to a role with more permissions", async () => {
    const lowUser = (await manager.agent.post("/api/users").send(userBody()))
      .body;
    const res = await manager.agent
      .put(`/api/users/${lowUser.id}`)
      .send({ fullName: "E", email: testEmail("esc"), roleId: adminRole.id });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(ASSIGN_MSG);
  });

  it("manager cannot edit, reset the password of, or delete a user whose role has more permissions", async () => {
    const put = await manager.agent.put(`/api/users/${target.user.id}`).send({
      fullName: "Hacked",
      email: target.email,
      roleId: managerRole.id,
      password: "Takeover-pass-1",
    });
    expect(put.status).toBe(403);
    expect(put.body.error.message).toBe(MODIFY_MSG);
    const pwOnly = await manager.agent
      .put(`/api/users/${target.user.id}`)
      .send({
        fullName: "x",
        email: target.email,
        roleId: adminRole.id,
        password: "Takeover-pass-1",
      });
    expect(pwOnly.status).toBe(403);
    const deleter = await makeActor(app, { permissions: [...MANAGER, "users.delete"] });
    const del = await deleter.agent.delete(`/api/users/${target.user.id}`);
    expect(del.status).toBe(403);
    expect(del.body.error.message).toBe(MODIFY_MSG);
    // the admin account is untouched and its password still works
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .send({ email: target.email, password: TEST_PASSWORD })
      ).status,
    ).toBe(200);
  });

  it("nobody can change their own role (403), not even to a lower one", async () => {
    const lower = await Role.create({
      name: testName("lower"),
      permissions: ["users.view"],
    });
    const res = await manager.agent
      .put(`/api/users/${manager.user.id}`)
      .send({ fullName: "M", email: manager.email, roleId: lower.id });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("You cannot change your own role");
    const ok = await manager.agent
      .put(`/api/users/${manager.user.id}`)
      .send({
        fullName: "Renamed",
        email: manager.email,
        roleId: managerRole.id,
      });
    expect(ok.status).toBe(200);
  });

  it("a user with all six permissions can do all of it", async () => {
    const created = await admin.agent
      .post("/api/users")
      .send(userBody({ roleId: adminRole.id }));
    expect(created.status).toBe(201);
    const put = await admin.agent.put(`/api/users/${target.user.id}`).send({
      fullName: "Reset",
      email: target.email,
      roleId: managerRole.id,
      password: "Reset-by-admin-1",
    });
    expect(put.status).toBe(200);
    expect(
      (await admin.agent.delete(`/api/users/${created.body.id}`)).status,
    ).toBe(204);
  });
});
