import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { db } from "../src/db.js";
import { PERMISSION_KEYS, SEED_ROLES } from "../src/permissions.js";
import { seedDatabase } from "../src/seed.js";
import {
  assertNoLeftovers,
  cleanupTestData,
  testEmail,
  testName,
} from "./helpers.js";

const Role = db.orm.public.Role;
const User = db.orm.public.User;
const app = createApp();

// Marker-named copies of the real seed roles, so the real Admin/Manager/Staff are never touched.
const roles = SEED_ROLES.map((r) => ({ ...r, name: testName(r.name) }));
const adminRole = roles[0].name;
const log = () => {};

beforeAll(cleanupTestData);
afterEach(cleanupTestData);
afterAll(async () => {
  await cleanupTestData();
  await assertNoLeftovers();
  await db.close();
});

describe("seed", () => {
  it("the real seed definition: Admin has all six permissions, Manager and Staff as specified", () => {
    const by = Object.fromEntries(
      SEED_ROLES.map((r) => [r.name, r.permissions]),
    );
    expect(by.Admin).toEqual(PERMISSION_KEYS);
    expect(by.Manager).toEqual([
      "users.view",
      "users.create",
      "users.edit",
      "roles.view",
    ]);
    expect(by.Staff).toEqual(["users.view"]);
  });

  it("creates roles with permissions and an admin user who can sign in", async () => {
    const email = testEmail("seedadmin");
    await seedDatabase({
      roles,
      adminRole,
      adminEmail: email,
      adminPassword: "Seed-admin-pass-1",
      log,
    });
    for (const r of roles) {
      const row = await Role.where({ name: r.name }).first();
      expect(row.permissions).toEqual(r.permissions);
    }
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "Seed-admin-pass-1" });
    expect(res.status).toBe(200);
    expect(res.body.user.roleName).toBe(adminRole);
    expect(res.body.user.permissions).toEqual([...PERMISSION_KEYS].sort());
  });

  it("is idempotent and never overwrites existing roles or users", async () => {
    const email = testEmail("seedadmin");
    const args = {
      roles,
      adminRole,
      adminEmail: email,
      adminPassword: "Seed-admin-pass-1",
      log,
    };
    await seedDatabase(args);
    await Role.where({ name: roles[2].name }).update({
      permissions: ["roles.view"],
    });
    await User.where({ email }).update({ fullName: "Edited" });
    await seedDatabase({ ...args, adminPassword: "Different-pass-2" });
    expect(await Role.where({ name: roles[2].name }).first()).toMatchObject({
      permissions: ["roles.view"],
    });
    expect((await User.where({ email }).all()).length).toBe(1);
    expect(await User.where({ email }).first()).toMatchObject({
      fullName: "Edited",
    });
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .send({ email, password: "Seed-admin-pass-1" })
      ).status,
    ).toBe(200);
  });

  it("skips the admin user, and says so, when the env values are missing", async () => {
    const messages = [];
    await seedDatabase({
      roles,
      adminRole,
      adminEmail: undefined,
      adminPassword: undefined,
      log: (m) => messages.push(m),
    });
    expect(messages.join("\n")).toMatch(/SEED_ADMIN_EMAIL|SEED_ADMIN_PASSWORD/);
    expect(await Role.where({ name: adminRole }).first()).not.toBeNull();
  });

  it("refuses a seed admin password that is too short", async () => {
    await expect(
      seedDatabase({
        roles,
        adminRole,
        adminEmail: testEmail("seedadmin"),
        adminPassword: "short",
        log,
      }),
    ).rejects.toThrow(/SEED_ADMIN_PASSWORD/);
  });
});
