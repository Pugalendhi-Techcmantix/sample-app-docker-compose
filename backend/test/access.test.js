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

// One entry per protected route. make() creates fresh dummy rows and returns [method, path, body],
// so the "allowed" call hits real data and must return the exact success status.
const lowRole = () => Role.create({ name: testName(`t${Math.random().toString(36).slice(2, 8)}`) });
const lowUser = async () => {
  const role = await lowRole();
  const email = testEmail(`t${Math.random().toString(36).slice(2, 8)}`);
  return { role, user: await User.create({ fullName: "T", email, roleId: role.id }), email };
};
const routeDefs = [
  { needed: "users.view", ok: 200, make: async () => ["get", "/api/users"] },
  { needed: "users.view", ok: 200, make: async () => ["get", `/api/users/${(await lowUser()).user.id}`] },
  {
    needed: "users.create",
    ok: 201,
    make: async () => [
      "post",
      "/api/users",
      { fullName: "N", email: testEmail(`c${Math.random().toString(36).slice(2, 8)}`), roleId: (await lowRole()).id, password: TEST_PASSWORD },
    ],
  },
  {
    needed: "users.edit",
    ok: 200,
    make: async () => {
      const t = await lowUser();
      return ["put", `/api/users/${t.user.id}`, { fullName: "N2", email: t.email, roleId: t.role.id }];
    },
  },
  { needed: "users.delete", ok: 204, make: async () => ["delete", `/api/users/${(await lowUser()).user.id}`] },
  { needed: "roles.view", ok: 200, make: async () => ["get", "/api/roles"] },
  { needed: "roles.view", ok: 200, make: async () => ["get", `/api/roles/${(await lowRole()).id}`] },
  {
    needed: "roles.manage",
    ok: 201,
    make: async () => ["post", "/api/roles", { name: testName(`p${Math.random().toString(36).slice(2, 8)}`) }],
  },
  {
    needed: "roles.manage",
    ok: 200,
    make: async () => {
      const r = await lowRole();
      return ["put", `/api/roles/${r.id}`, { name: r.name, description: "changed" }];
    },
  },
  { needed: "roles.manage", ok: 204, make: async () => ["delete", `/api/roles/${(await lowRole()).id}`] },
];

describe("401 / 403 matrix", () => {
  it("no cookie -> 401 on every protected route", async () => {
    for (const def of routeDefs) {
      const [method, path, body] = await def.make();
      const res = await request(app)[method](path).send(body);
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(res.body.error.message).toBeTypeOf("string");
    }
    for (const path of ["/api/permissions", "/api/roles/options", "/api/auth/me"]) {
      expect((await request(app).get(path)).status, path).toBe(401);
    }
  });

  it("without the needed permission -> 403 Forbidden and no change; with only that permission -> exact success status", async () => {
    for (const def of routeDefs) {
      const without = await makeActor(app, { permissions: PERMISSION_KEYS.filter((k) => k !== def.needed) });
      const [m1, p1, b1] = await def.make();
      const denied = await without.agent[m1](p1).send(b1);
      expect(denied.status, `${m1} ${p1} without ${def.needed}`).toBe(403);
      expect(denied.body).toEqual({ error: { message: "Forbidden" } });

      const only = await makeActor(app, { permissions: [def.needed] });
      const [m2, p2, b2] = await def.make();
      const allowed = await only.agent[m2](p2).send(b2);
      expect(allowed.status, `${m2} ${p2} with ${def.needed}`).toBe(def.ok);
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
