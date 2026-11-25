import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { db } from "../src/db.js";
import {
  assertNoLeftovers,
  cleanupTestData,
  makeActor,
  testEmail,
  TEST_PASSWORD,
} from "./helpers.js";

const app = createApp();

beforeAll(cleanupTestData);
afterEach(cleanupTestData);
afterAll(async () => {
  await cleanupTestData();
  await assertNoLeftovers();
  await db.close();
});

const login = (body) => request(app).post("/api/auth/login").send(body);
const cookieOf = (res) =>
  (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("token="));

describe("POST /auth/login", () => {
  it("200 with the user object (no hash) and an httpOnly SameSite=Lax cookie", async () => {
    const a = await makeActor(app, {
      permissions: ["users.view"],
      signIn: false,
    });
    const res = await login({ email: a.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: a.user.id,
      fullName: a.user.fullName,
      email: a.email,
      roleId: a.role.id,
      roleName: a.role.name,
      isActive: true,
      permissions: ["users.view"],
    });
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Secure/i);
    expect(JSON.stringify(res.body)).not.toMatch(
      /passwordHash|password_hash|\$2[aby]\$/,
    );
  });

  it("email is matched case-insensitively and trimmed", async () => {
    const a = await makeActor(app, { signIn: false });
    const res = await login({
      email: `  ${a.email.toUpperCase()} `,
      password: TEST_PASSWORD,
    });
    expect(res.status).toBe(200);
  });

  it("wrong email, wrong password, inactive user, user without password: all the same generic 401", async () => {
    const ok = await makeActor(app, { signIn: false });
    const inactive = await makeActor(app, { signIn: false });
    await db.orm.public.User.where({ id: inactive.user.id }).update({
      isActive: false,
    });
    const nopw = await makeActor(app, { signIn: false });
    await db.orm.public.User.where({ id: nopw.user.id }).update({
      passwordHash: null,
    });

    const attempts = [
      { email: testEmail("nobody"), password: TEST_PASSWORD },
      { email: ok.email, password: "wrong-password" },
      { email: inactive.email, password: TEST_PASSWORD },
      { email: nopw.email, password: TEST_PASSWORD },
    ];
    for (const body of attempts) {
      const res = await login(body);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: { message: "Invalid email or password" },
      });
      expect(cookieOf(res)).toBeUndefined();
    }
  });

  it("missing / non-string fields -> 401 generic (no 500, no field hints)", async () => {
    for (const body of [
      {},
      { email: "x" },
      { email: 1, password: 2 },
      { email: ["a"], password: {} },
    ]) {
      const res = await login(body);
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe("Invalid email or password");
    }
  });

  it("cookie lifetime follows JWT_EXPIRES_IN and the token carries only the user id", async () => {
    const a = await makeActor(app, { signIn: false });
    const res = await login({ email: a.email, password: TEST_PASSWORD });
    const token = cookieOf(res).split(";")[0].slice("token=".length);
    const payload = jwt.decode(token);
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "sub"]);
    expect(payload.sub).toBe(String(a.user.id));
    expect(payload.exp - payload.iat).toBe(8 * 3600);
  });
});

describe("GET /auth/me and POST /auth/logout", () => {
  it("me: 401 without cookie, 200 with the current user after login", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    const a = await makeActor(app, { permissions: ["roles.view"] });
    const res = await a.agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: a.user.id,
      email: a.email,
      permissions: ["roles.view"],
    });
  });

  it("logout: 204 and clears the cookie; works even when not signed in", async () => {
    const anon = await request(app).post("/api/auth/logout");
    expect(anon.status).toBe(204);
    const a = await makeActor(app);
    const res = await a.agent.post("/api/auth/logout");
    expect(res.status).toBe(204);
    expect(cookieOf(res)).toMatch(/token=;/);
    expect((await a.agent.get("/api/auth/me")).status).toBe(401);
  });
});

describe("POST /auth/change-password", () => {
  it("401 when not signed in", async () => {
    const res = await request(app)
      .post("/api/auth/change-password")
      .send({ currentPassword: "a", newPassword: "b".repeat(8) });
    expect(res.status).toBe(401);
  });

  it("changes the password: old one stops working, new one works", async () => {
    const a = await makeActor(app);
    const res = await a.agent
      .post("/api/auth/change-password")
      .send({
        currentPassword: TEST_PASSWORD,
        newPassword: "Brand-new-pass-9",
      });
    expect(res.status).toBe(204);
    expect(
      (await login({ email: a.email, password: TEST_PASSWORD })).status,
    ).toBe(401);
    expect(
      (await login({ email: a.email, password: "Brand-new-pass-9" })).status,
    ).toBe(200);
  });

  it("wrong current password -> 400 field currentPassword", async () => {
    const a = await makeActor(app);
    const res = await a.agent
      .post("/api/auth/change-password")
      .send({
        currentPassword: "nope-nope-nope",
        newPassword: "Brand-new-pass-9",
      });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { field: "currentPassword", message: "Current password is incorrect" },
    ]);
  });

  it("new password too short / over 72 bytes / NUL -> 400 field newPassword", async () => {
    const a = await makeActor(app);
    const bad = ["short", "x".repeat(73), "é".repeat(37), "abcdefgh\u0000i"]; // 37 x 2 bytes = 74
    for (const newPassword of bad) {
      const res = await a.agent
        .post("/api/auth/change-password")
        .send({ currentPassword: TEST_PASSWORD, newPassword });
      expect(res.status, newPassword).toBe(400);
      expect(res.body.error.details.map((d) => d.field)).toContain(
        "newPassword",
      );
    }
    expect(
      (
        await a.agent
          .post("/api/auth/change-password")
          .send({ currentPassword: TEST_PASSWORD, newPassword: "x".repeat(72) })
      ).status,
    ).toBe(204);
  });
});
