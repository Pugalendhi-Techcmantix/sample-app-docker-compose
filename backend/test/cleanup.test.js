import { afterAll, describe, expect, it } from "vitest";
import { db } from "../src/db.js";
import { assertNoLeftovers, cleanupTestData, testEmail, testName } from "./helpers.js";

const Role = db.orm.public.Role;
const User = db.orm.public.User;

// Rows from a different (fake) run id: cleanup must leave them alone.
const decoyRole = "__test_00000000_decoy";
const decoyEmail = "decoy.00000000@test.invalid";

async function removeDecoys() {
  await User.where({ email: decoyEmail }).deleteAll();
  await Role.where({ name: decoyRole }).deleteAll();
}

afterAll(async () => {
  await removeDecoys();
  await cleanupTestData();
  await db.close();
});

describe("test cleanup safety", () => {
  it("deletes only rows carrying this run marker; guard detects leftovers", async () => {
    await removeDecoys();
    const decoy = await Role.create({ name: decoyRole });
    await User.create({ fullName: "Decoy", email: decoyEmail, roleId: decoy.id });
    const mine = await Role.create({ name: testName("mine") });
    await User.create({ fullName: "Mine", email: testEmail("mine"), roleId: mine.id });

    await expect(assertNoLeftovers()).rejects.toThrow(/Leftover test rows: 1 user\(s\), 1 role\(s\)/);
    await cleanupTestData();
    await assertNoLeftovers();

    expect(await Role.first({ id: decoy.id })).not.toBeNull();
    expect(await User.where({ email: decoyEmail }).first()).not.toBeNull();
    await removeDecoys();
  });
});
