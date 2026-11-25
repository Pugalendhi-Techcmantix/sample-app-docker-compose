import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { withAdminLock } from "../src/adminGuard.js";
import { assertConfig, config, isWeakSecret } from "../src/config.js";
import { db } from "../src/db.js";
import { PERMISSION_KEYS, activeAdminExists } from "../src/permissions.js";
import { seedDatabase } from "../src/seed.js";
import {
  assertNoLeftovers,
  cleanupTestData,
  isMine,
  makeActor,
  TEST_PASSWORD,
  testEmail,
  testName,
} from "./helpers.js";

const Role = db.orm.public.Role;
const User = db.orm.public.User;

beforeAll(cleanupTestData);
afterEach(cleanupTestData);
afterAll(async () => {
  await cleanupTestData();
  await assertNoLeftovers();
  await db.close();
});

describe("placeholder and weak secrets are rejected", () => {
  it("isWeakSecret", () => {
    for (const v of [
      "change-me",
      "CHANGE-ME-to-a-long-random-string",
      "Change-Me-admin-password",
      "password",
      "Admin",
      "12345678",
      "",
    ]) {
      expect(isWeakSecret(v), v).toBe(true);
    }
    for (const v of ["Adm-k3j9Zx7QpLw2", "a".repeat(40)])
      expect(isWeakSecret(v), v).toBe(false);
  });

  it("assertConfig refuses a placeholder JWT_SECRET even when long enough", () => {
    expect(() =>
      assertConfig({
        jwtSecret: "change-me-to-a-long-random-string-of-at-least-32-chars",
      }),
    ).toThrow(/JWT_SECRET/);
    expect(() => assertConfig({ jwtSecret: "x".repeat(32) })).not.toThrow();
  });

  it("the real configured secret is acceptable (checked without printing it)", () => {
    expect(isWeakSecret(process.env.JWT_SECRET)).toBe(false);
  });

  it("seed refuses weak admin passwords", async () => {
    for (const adminPassword of [
      "change-me-admin-password",
      "Change-Me-1234",
      "password",
      "12345678",
    ]) {
      await expect(
        seedDatabase({
          roles: [],
          adminEmail: testEmail("weak"),
          adminPassword,
          log: () => {},
        }),
      ).rejects.toThrow(/SEED_ADMIN_PASSWORD/);
    }
  });
});

describe("misc hardening", () => {
  it("x-powered-by is not sent", async () => {
    const res = await request(createApp()).get("/api/live");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("PUT /users/:id without isActive keeps the current value (no silent re-activation)", async () => {
    const admin = await makeActor(createApp(), {
      permissions: PERMISSION_KEYS,
    });
    const role = await Role.create({ name: testName("member") });
    const u = await User.create({
      fullName: "Off",
      email: testEmail("off"),
      roleId: role.id,
      isActive: false,
    });
    const res = await admin.agent
      .put(`/api/users/${u.id}`)
      .send({ fullName: "Off2", email: testEmail("off"), roleId: role.id });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
    expect((await User.first({ id: u.id })).isActive).toBe(false);
  });
});

describe("rate limiting (limiter switched on only inside these tests)", () => {
  async function withLimiter(fn) {
    config.loginRateLimitDisabled = false;
    try {
      await fn();
    } finally {
      config.loginRateLimitDisabled = true;
    }
  }

  it("per-email limiter: 10 failures then 429, even when the IP changes (trust proxy 1)", async () => {
    const app = createApp({ trustProxy: 1 });
    const email = testEmail("limited");
    await withLimiter(async () => {
      const statuses = [];
      for (let i = 0; i < 12; i++) {
        const res = await request(app)
          .post("/api/auth/login")
          .set("X-Forwarded-For", `203.0.113.${i + 1}`)
          .send({ email, password: "wrong-password" });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
      // another email from another IP is unaffected
      const other = await request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", "198.51.100.9")
        .send({ email: testEmail("other"), password: "wrong-password" });
      expect(other.status).toBe(401);
    });
  });

  it("per-IP limiter: 10 attempts per minute then 429 with the standard error body", async () => {
    const app = createApp(); // trust proxy off: X-Forwarded-For is ignored, all calls share one IP
    await withLimiter(async () => {
      let last;
      for (let i = 0; i < 12; i++) {
        last = await request(app)
          .post("/api/auth/login")
          .set("X-Forwarded-For", `192.0.2.${i + 1}`)
          .send({ email: testEmail(`ip${i}`), password: "wrong-password" });
      }
      expect(last.status).toBe(429);
      expect(last.body).toEqual({ error: { message: expect.any(String) } });
    });
  });

  it("change-password is rate limited per user (10 attempts)", async () => {
    const app = createApp();
    const a = await makeActor(app);
    await withLimiter(async () => {
      const statuses = [];
      for (let i = 0; i < 12; i++) {
        const res = await a.agent
          .post("/api/auth/change-password")
          .send({
            currentPassword: "wrong-current-pw",
            newPassword: "Brand-new-pass-9",
          });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
      expect(statuses[11]).toBe(429);
    });
  });
});

describe("last ACTIVE administrator rule", () => {
  const roles = [
    { id: 1, permissions: ["roles.manage", "users.edit"] },
    { id: 2, permissions: ["users.view"] },
  ];
  it("activeAdminExists (pure logic)", () => {
    expect(
      activeAdminExists(roles, [{ id: 1, roleId: 1, isActive: true }]),
    ).toBe(true);
    expect(
      activeAdminExists(roles, [{ id: 1, roleId: 1, isActive: false }]),
    ).toBe(false);
    expect(
      activeAdminExists(roles, [{ id: 1, roleId: 2, isActive: true }]),
    ).toBe(false);
    expect(activeAdminExists(roles, [])).toBe(false);
  });
});

describe("admin operations are serialized by a database lock", () => {
  it("withAdminLock never runs two callbacks at the same time", async () => {
    let running = 0;
    let maxRunning = 0;
    const job = () =>
      withAdminLock(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 60));
        running--;
      });
    await Promise.all([job(), job(), job()]);
    expect(maxRunning).toBe(1);
  });

  it("two admins deactivating each other at once: at most one succeeds when no real admin exists", async () => {
    const app = createApp();
    const a = await makeActor(app, { permissions: PERMISSION_KEYS });
    const b = await makeActor(app, { permissions: PERMISSION_KEYS });
    const [allRoles, allUsers] = await Promise.all([Role.all(), User.all()]);
    const realAdmin = activeAdminExists(
      allRoles.filter((r) => !isMine(r)),
      allUsers.filter((u) => !isMine(u)),
    );
    const off = (who, target) =>
      who.agent.put(`/api/users/${target.user.id}`).send({
        fullName: "x",
        email: target.email,
        roleId: target.role.id,
        isActive: false,
      });
    const results = await Promise.all([off(a, b), off(b, a)]);
    const statuses = results.map((r) => r.status).sort();
    if (realAdmin) {
      expect(statuses).toEqual([200, 200]);
    } else {
      // exactly one deactivation may win; the other must see the first and be refused
      expect(statuses).toEqual([200, 409]);
    }
    const active = (await User.all()).filter(
      (u) => isMine(u) && u.isActive && [a.user.id, b.user.id].includes(u.id),
    );
    if (!realAdmin) expect(active.length).toBeGreaterThanOrEqual(1);
  });
});
