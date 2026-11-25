import jwt from "jsonwebtoken";
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
import { assertConfig } from "../src/config.js";
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
import { execFileSync } from "node:child_process";

const app = createApp();
const Role = db.orm.public.Role;
const User = db.orm.public.User;

beforeAll(cleanupTestData);
afterEach(cleanupTestData);
afterAll(async () => {
  await cleanupTestData();
  await assertNoLeftovers();
  await db.close();
});

const NOT_FOUND_ID = 2147483647;

// [method, path, required permission, body]. Bodies are valid so a passing actor gets past validation.
let fixtures;
beforeEach(async () => {
  const role = await Role.create({ name: testName("target") });
  fixtures = { roleId: role.id };
});
const routes = () => [
  ["get", "/api/users", "users.view"],
  ["get", `/api/users/${NOT_FOUND_ID}`, "users.view"],
  [
    "post",
    "/api/users",
    "users.create",
    {
      fullName: "N",
      email: testEmail("matrix"),
      roleId: fixtures.roleId,
      password: TEST_PASSWORD,
    },
  ],
  [
    "put",
    `/api/users/${NOT_FOUND_ID}`,
    "users.edit",
    { fullName: "N", email: testEmail("matrix2"), roleId: fixtures.roleId },
  ],
  ["delete", `/api/users/${NOT_FOUND_ID}`, "users.delete"],
  ["get", "/api/roles", "roles.view"],
  ["get", `/api/roles/${NOT_FOUND_ID}`, "roles.view"],
  ["post", "/api/roles", "roles.manage", { name: testName("matrix-role") }],
  [
    "put",
    `/api/roles/${NOT_FOUND_ID}`,
    "roles.manage",
    { name: testName("matrix-role2") },
  ],
  ["delete", `/api/roles/${NOT_FOUND_ID}`, "roles.manage"],
];

describe("401 / 403 matrix", () => {
  it("no cookie -> 401 on every protected route", async () => {
    for (const [method, path, , body] of routes()) {
      const res = await request(app)[method](path).send(body);
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(res.body.error.message).toBeTypeOf("string");
    }
    for (const path of [
      "/api/permissions",
      "/api/roles/options",
      "/api/auth/me",
    ]) {
      expect((await request(app).get(path)).status, path).toBe(401);
    }
  });

  it("signed in without the needed permission -> 403 Forbidden; with only that permission -> allowed", async () => {
    for (const [method, path, needed, body] of routes()) {
      const without = await makeActor(app, {
        permissions: PERMISSION_KEYS.filter((k) => k !== needed),
      });
      const denied = await without.agent[method](path).send(body);
      expect(denied.status, `${method} ${path} without ${needed}`).toBe(403);
      expect(denied.body).toEqual({ error: { message: "Forbidden" } });

      const only = await makeActor(app, { permissions: [needed] });
      const allowed = await only.agent[method](path).send(body);
      expect([401, 403], `${method} ${path} with ${needed}`).not.toContain(
        allowed.status,
      );
    }
  });

  it("public endpoints stay public; any signed-in user may read /permissions and /roles/options", async () => {
    expect((await request(app).get("/api/live")).status).toBe(200);
    expect((await request(app).get("/api/health")).status).toBe(200);
    const nobody = await makeActor(app, { permissions: [] });
    const perms = await nobody.agent.get("/api/permissions");
    expect(perms.status).toBe(200);
    expect(perms.body.map((p) => p.key)).toEqual(PERMISSION_KEYS);
    expect(perms.body[0]).toEqual({
      key: "users.view",
      group: "users",
      label: expect.any(String),
    });
    const opts = await nobody.agent.get("/api/roles/options");
    expect(opts.status).toBe(200);
    expect(
      opts.body.every((o) => Object.keys(o).sort().join() === "id,name"),
    ).toBe(true);
    expect(opts.body.map((o) => o.name)).toContain(nobody.role.name);
    const names = opts.body.map((o) => o.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe("permissions are read from the DB on every request", () => {
  it("deactivating the user blocks the next request even with a valid cookie", async () => {
    const a = await makeActor(app, { permissions: ["users.view"] });
    expect((await a.agent.get("/api/users")).status).toBe(200);
    await User.where({ id: a.user.id }).update({ isActive: false });
    expect((await a.agent.get("/api/users")).status).toBe(401);
    expect((await a.agent.get("/api/auth/me")).status).toBe(401);
  });

  it("deleting the user blocks the next request", async () => {
    const a = await makeActor(app, { permissions: ["users.view"] });
    await User.where({ id: a.user.id }).delete();
    expect((await a.agent.get("/api/users")).status).toBe(401);
  });

  it("changing the role's permissions takes effect on the next request", async () => {
    const a = await makeActor(app, { permissions: ["users.view"] });
    expect((await a.agent.get("/api/users")).status).toBe(200);
    expect((await a.agent.get("/api/roles")).status).toBe(403);
    await Role.where({ id: a.role.id }).update({ permissions: ["roles.view"] });
    expect((await a.agent.get("/api/users")).status).toBe(403);
    expect((await a.agent.get("/api/roles")).status).toBe(200);
    expect((await a.agent.get("/api/auth/me")).body.user.permissions).toEqual([
      "roles.view",
    ]);
  });

  it("moving the user to another role takes effect on the next request", async () => {
    const a = await makeActor(app, { permissions: ["users.view"] });
    const other = await Role.create({
      name: testName("other"),
      permissions: ["roles.view"],
    });
    await User.where({ id: a.user.id }).update({ roleId: other.id });
    expect((await a.agent.get("/api/users")).status).toBe(403);
    expect((await a.agent.get("/api/roles")).status).toBe(200);
  });
});

describe("bad tokens -> 401", () => {
  const secret = () => process.env.JWT_SECRET;
  const withCookie = (value) =>
    request(app).get("/api/auth/me").set("Cookie", `token=${value}`);

  it("tampered, wrong secret, alg none, expired, garbage, unknown user, non-numeric sub", async () => {
    const a = await makeActor(app, { permissions: ["users.view"] });
    const good = jwt.sign({}, secret(), {
      subject: String(a.user.id),
      expiresIn: "1h",
    });
    expect((await withCookie(good)).status).toBe(200);

    const tampered = good.slice(0, -2) + (good.endsWith("AA") ? "BB" : "AA");
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from(
      JSON.stringify({ sub: String(a.user.id) }),
    ).toString("base64url")}.`;
    const cases = {
      tampered,
      wrongSecret: jwt.sign({}, "x".repeat(40), {
        subject: String(a.user.id),
        expiresIn: "1h",
      }),
      none,
      expired: jwt.sign({}, secret(), {
        subject: String(a.user.id),
        expiresIn: -10,
      }),
      garbage: "not.a.jwt",
      empty: "",
      unknownUser: jwt.sign({}, secret(), {
        subject: String(NOT_FOUND_ID),
        expiresIn: "1h",
      }),
      nonNumericSub: jwt.sign({}, secret(), {
        subject: "abc",
        expiresIn: "1h",
      }),
      noSub: jwt.sign({ foo: 1 }, secret(), { expiresIn: "1h" }),
    };
    for (const [name, token] of Object.entries(cases)) {
      const res = await withCookie(token);
      expect(res.status, name).toBe(401);
      expect(res.body).toEqual({ error: { message: "Not signed in" } });
    }
  });

  it("a token signed with HS512 is refused (algorithm pinned to HS256)", async () => {
    const a = await makeActor(app);
    const token = jwt.sign({}, secret(), {
      algorithm: "HS512",
      subject: String(a.user.id),
      expiresIn: "1h",
    });
    expect((await withCookie(token)).status).toBe(401);
  });
});

describe("no secrets in any response", () => {
  it("passwordHash, password_hash, bcrypt hashes and JWT_SECRET never appear", async () => {
    const admin = await makeActor(app, { permissions: PERMISSION_KEYS });
    const created = await admin.agent
      .post("/api/users")
      .send({
        fullName: "L",
        email: testEmail("leak"),
        roleId: admin.role.id,
        password: TEST_PASSWORD,
      });
    const id = created.body.id;
    const bodies = [
      created,
      await admin.agent.get("/api/users"),
      await admin.agent.get(`/api/users/${id}`),
      await admin.agent.put(`/api/users/${id}`).send({
        fullName: "L2",
        email: testEmail("leak"),
        roleId: admin.role.id,
        password: "Another-pass-1",
      }),
      await admin.agent.get("/api/roles"),
      await admin.agent.get("/api/roles/options"),
      await admin.agent.get("/api/permissions"),
      await admin.agent.get("/api/auth/me"),
      await request(app)
        .post("/api/auth/login")
        .send({ email: admin.email, password: TEST_PASSWORD }),
      await request(app)
        .post("/api/auth/login")
        .send({ email: admin.email, password: "wrong" }),
      await admin.agent.post("/api/users").send({}),
      await admin.agent.get("/api/users/abc"),
    ].map(
      (r) => JSON.stringify(r.body) + JSON.stringify(r.headers.location ?? ""),
    );
    for (const text of bodies) {
      expect(text).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);
      expect(text).not.toContain(process.env.JWT_SECRET);
      expect(text).not.toContain(TEST_PASSWORD);
      expect(text).not.toContain("Another-pass-1");
    }
  });
});

describe("JWT_SECRET is required", () => {
  it("assertConfig throws for a missing or short secret and accepts a 32+ char one", () => {
    expect(() => assertConfig({ jwtSecret: undefined })).toThrow(/JWT_SECRET/);
    expect(() => assertConfig({ jwtSecret: "short" })).toThrow(/JWT_SECRET/);
    expect(() => assertConfig({ jwtSecret: "x".repeat(32) })).not.toThrow();
  });

  it("the server process exits with an error and never listens when JWT_SECRET is missing", () => {
    let failed = null;
    try {
      execFileSync(process.execPath, ["src/server.js"], {
        // point dotenv at a file that does not exist so backend/.env cannot supply a secret
        env: {
          ...process.env,
          JWT_SECRET: "",
          DOTENV_CONFIG_PATH: "/nonexistent/.env",
          PORT: "0",
        },
        stdio: "pipe",
        timeout: 15000,
      });
    } catch (err) {
      failed = err;
    }
    expect(failed, "server must not start").not.toBeNull();
    expect(failed.status).not.toBe(0);
    expect(String(failed.stderr)).toMatch(/JWT_SECRET/);
  });
});
