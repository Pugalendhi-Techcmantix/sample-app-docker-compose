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
const User = db.orm.public.User;
let admin;
let role;

beforeAll(cleanupTestData);
beforeEach(async () => {
  admin = await makeActor(app, { permissions: PERMISSION_KEYS });
  role = await db.orm.public.Role.create({
    name: testName("member"),
    permissions: ["users.view"],
  });
});
afterEach(cleanupTestData);
afterAll(async () => {
  await cleanupTestData();
  await assertNoLeftovers();
  await db.close();
});

const body = (o = {}) => ({
  fullName: "P",
  email: testEmail("p"),
  roleId: role.id,
  password: TEST_PASSWORD,
  ...o,
});
const login = (email, password) =>
  request(app).post("/api/auth/login").send({ email, password });

describe("passwords on users", () => {
  it("POST requires a password (8..72 bytes, no NUL) -> 400 field password", async () => {
    for (const password of [
      undefined,
      "",
      "short",
      "x".repeat(73),
      "é".repeat(37),
      "abcdefgh\u0000i",
      12345678,
    ]) {
      const res = await admin.agent.post("/api/users").send(body({ password }));
      expect(res.status, String(password)).toBe(400);
      expect(res.body.error.details.map((d) => d.field)).toContain("password");
    }
  });

  it("POST stores a hash (never the plain text) and the new user can sign in", async () => {
    const res = await admin.agent.post("/api/users").send(body());
    expect(res.status).toBe(201);
    expect(res.body.password).toBeUndefined();
    const row = await User.first({ id: res.body.id });
    expect(row.passwordHash).toMatch(/^\$2[aby]\$04\$/);
    expect(row.passwordHash).not.toContain(TEST_PASSWORD);
    expect((await login(testEmail("p"), TEST_PASSWORD)).status).toBe(200);
  });

  it("PUT without password or with an empty one keeps the current password", async () => {
    const u = (await admin.agent.post("/api/users").send(body())).body;
    const put = (extra) =>
      admin.agent
        .put(`/api/users/${u.id}`)
        .send({
          fullName: "P2",
          email: testEmail("p"),
          roleId: role.id,
          ...extra,
        });
    expect((await put({})).status).toBe(200);
    expect((await put({ password: "" })).status).toBe(200);
    expect((await login(testEmail("p"), TEST_PASSWORD)).status).toBe(200);
  });

  it("PUT with a password sets it; too short -> 400 field password", async () => {
    const u = (await admin.agent.post("/api/users").send(body())).body;
    const put = (password) =>
      admin.agent
        .put(`/api/users/${u.id}`)
        .send({
          fullName: "P",
          email: testEmail("p"),
          roleId: role.id,
          password,
        });
    const bad = await put("short");
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.map((d) => d.field)).toContain("password");
    expect((await put("Reset-pass-77")).status).toBe(200);
    expect((await login(testEmail("p"), TEST_PASSWORD)).status).toBe(401);
    expect((await login(testEmail("p"), "Reset-pass-77")).status).toBe(200);
  });
});

describe("safety rules on users", () => {
  it("cannot delete yourself -> 409", async () => {
    const res = await admin.agent.delete(`/api/users/${admin.user.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("You cannot delete your own account");
    expect(await User.first({ id: admin.user.id })).not.toBeNull();
  });

  it("cannot deactivate yourself -> 409, but can edit your own other fields", async () => {
    const self = (extra) =>
      admin.agent
        .put(`/api/users/${admin.user.id}`)
        .send({
          fullName: "Renamed",
          email: admin.email,
          roleId: admin.role.id,
          ...extra,
        });
    const res = await self({ isActive: false });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe(
      "You cannot deactivate your own account",
    );
    expect((await self({ isActive: true })).status).toBe(200);
  });

  it("can deactivate and delete other users", async () => {
    const u = (await admin.agent.post("/api/users").send(body())).body;
    const off = await admin.agent
      .put(`/api/users/${u.id}`)
      .send({
        fullName: "P",
        email: testEmail("p"),
        roleId: role.id,
        isActive: false,
      });
    expect(off.status).toBe(200);
    expect((await login(testEmail("p"), TEST_PASSWORD)).status).toBe(401);
    expect((await admin.agent.delete(`/api/users/${u.id}`)).status).toBe(204);
  });
});
