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
import { PERMISSION_KEYS, activeAdminExists } from "../src/permissions.js";
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

describe("safety rule: keep an ACTIVE user in a role with roles.manage and users.edit", () => {
  // Whether the user's real rows already contain an active administrator decides which branch of
  // the API assertions applies, so both outcomes are asserted explicitly.
  async function realActiveAdminExists() {
    const [roles, users] = await Promise.all([Role.all(), User.all()]);
    return activeAdminExists(
      roles.filter((r) => !isMine(r)),
      users.filter((u) => !isMine(u)),
    );
  }
  const MESSAGE = "At least one role must keep roles.manage and users.edit";
  const strip = (r) => ({ name: r.name, permissions: ["users.view"] });

  it("removing the admin permissions from the only admin role -> 409 (allowed if a real active admin exists)", async () => {
    const res = await admin.agent.put(`/api/roles/${admin.role.id}`).send(strip(admin.role));
    if (await realActiveAdminExists()) {
      expect(res.status).toBe(200);
    } else {
      expect(res.status).toBe(409);
      expect(res.body.error.message).toBe(MESSAGE);
    }
  });

  it("a second admin role with NO active user does not count (still 409 unless real admin)", async () => {
    await Role.create({ name: testName("empty-admin"), permissions: ["roles.manage", "users.edit"] });
    const res = await admin.agent.put(`/api/roles/${admin.role.id}`).send(strip(admin.role));
    expect(res.status).toBe(await realActiveAdminExists() ? 200 : 409);
  });

  it("a second admin role WITH an active user makes the change allowed", async () => {
    const second = await Role.create({ name: testName("second-admin"), permissions: ["roles.manage", "users.edit"] });
    await User.create({ fullName: "S", email: testEmail("second"), roleId: second.id, isActive: true });
    const res = await admin.agent.put(`/api/roles/${admin.role.id}`).send(strip(admin.role));
    expect(res.status).toBe(200);
  });

  it("an INACTIVE user in the second admin role does not count", async () => {
    const second = await Role.create({ name: testName("second-admin"), permissions: ["roles.manage", "users.edit"] });
    await User.create({ fullName: "S", email: testEmail("second"), roleId: second.id, isActive: false });
    const res = await admin.agent.put(`/api/roles/${admin.role.id}`).send(strip(admin.role));
    expect(res.status).toBe(await realActiveAdminExists() ? 200 : 409);
  });

  it("deleting an unused admin-capable role is allowed while an active admin remains", async () => {
    const unused = await Role.create({ name: testName("unused-admin"), permissions: ["roles.manage", "users.edit"] });
    expect((await admin.agent.delete(`/api/roles/${unused.id}`)).status).toBe(204);
  });
});
