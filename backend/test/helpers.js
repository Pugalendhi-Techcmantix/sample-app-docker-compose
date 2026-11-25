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
