import { randomBytes } from "node:crypto";
import { db } from "../src/db.js";

// Every dummy row carries this run's marker, so tests only ever touch what they created.
export const runId = process.env.TEST_RUN_ID ?? randomBytes(4).toString("hex");
export const NAME_PREFIX = `__test_${runId}_`;
export const EMAIL_SUFFIX = `.${runId}@test.invalid`;

export const testName = (s) => `${NAME_PREFIX}${s}`;
export const testEmail = (s) => `${s}${EMAIL_SUFFIX}`;
export const isMine = (row) =>
  (row.name !== undefined && row.name.toLowerCase().startsWith(NAME_PREFIX)) ||
  (row.email !== undefined && row.email.toLowerCase().endsWith(EMAIL_SUFFIX));

const escapeLike = (s) => s.replace(/[\%_]/g, "\$&");
const Role = db.orm.public.Role;
const User = db.orm.public.User;

// Deletes ONLY rows carrying this run's marker: users first, then roles.
export async function cleanupTestData() {
  // Any user holding one of this run's marker roles was created by a test too.
  const mine = await Role.where((r) => r.name.ilike(`${escapeLike(NAME_PREFIX)}%`)).all();
  for (const role of mine) await User.where({ roleId: role.id }).deleteAll();
  await User.where((u) => u.email.ilike(`%${escapeLike(EMAIL_SUFFIX)}`)).deleteAll();
  await Role.where((r) => r.name.ilike(`${escapeLike(NAME_PREFIX)}%`)).deleteAll();
}

// Fails loudly if any of this run's dummy rows are still there.
export async function assertNoLeftovers() {
  const users = await User.where((u) => u.email.ilike(`%${escapeLike(EMAIL_SUFFIX)}`)).all();
  const roles = await Role.where((r) => r.name.ilike(`${escapeLike(NAME_PREFIX)}%`)).all();
  if (users.length || roles.length) {
    throw new Error(`Leftover test rows: ${users.length} user(s), ${roles.length} role(s)`);
  }
}

// ---- auth helpers: dummy actors with exactly the permissions a test needs ----
import bcrypt from "bcryptjs";
import request from "supertest";

export const TEST_PASSWORD = "Test-pass-123";
let counter = 0;

// Creates a dummy role + user (marker-named, so cleanup removes them) and signs in.
// Returns { agent, user, role, email, password }.
export async function makeActor(app, { permissions = [], isActive = true, password = TEST_PASSWORD, signIn = true } = {}) {
  const n = ++counter;
  const role = await Role.create({ name: testName(`actor${n}`), permissions });
  const email = testEmail(`actor${n}`);
  const user = await User.create({
    fullName: `Actor ${n}`,
    email,
    roleId: role.id,
    isActive: true,
    passwordHash: await bcrypt.hash(password, 4),
  });
  const agent = request.agent(app);
  if (signIn) {
    const res = await agent.post("/api/auth/login").send({ email, password });
    if (res.status !== 200) throw new Error(`test login failed: ${res.status}`);
  }
  if (!isActive) await User.where({ id: user.id }).update({ isActive: false });
  return { agent, user, role, email, password };
}
