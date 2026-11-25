import { db } from "./db.js";
import { HttpError } from "./errors.js";
import { activeAdminExists } from "./permissions.js";

export const LAST_ADMIN_MESSAGE = "At least one role must keep roles.manage and users.edit";

// Every change that could remove the last administrator runs inside this transaction, which first
// takes a Postgres advisory lock. Two such requests therefore run one after the other, and the
// second one sees the first one's committed result when it checks the rule.
export function withAdminLock(fn) {
  return db.transaction(async (tx) => {
    await tx.execute(tx.raw.sql`SELECT pg_advisory_xact_lock(7254001)`.affectedCount().build());
    return fn(tx);
  });
}

// Refuses a change that would leave NO active user holding a role with both roles.manage and
// users.edit. If there was no such user before the change, there is nothing to protect.
// mutate({roles, users}) returns the state as it would be after the change.
export async function assertAdminRemains(tx, mutate) {
  const roles = await tx.orm.public.Role.select("id", "permissions").all();
  const users = await tx.orm.public.User.select("id", "roleId", "isActive").all();
  if (!activeAdminExists(roles, users)) return;
  const after = mutate({ roles, users });
  if (!activeAdminExists(after.roles, after.users)) throw new HttpError(409, LAST_ADMIN_MESSAGE);
}
