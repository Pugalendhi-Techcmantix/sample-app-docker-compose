import { hashPassword } from "./auth.js";
import { isWeakSecret } from "./config.js";
import { escapeLike } from "./like.js";
import { db } from "./db.js";
import { SEED_ROLES } from "./permissions.js";
import { passwordSchema } from "./validation.js";

const Role = db.orm.public.Role;
const User = db.orm.public.User;

// Idempotent. Roles are created with their permissions only when missing (an existing
// role is never changed); the admin user is created only when no user has that email.
export async function seedDatabase({
  roles = SEED_ROLES,
  adminRole = "Admin",
  adminEmail,
  adminPassword,
  log = console.log,
} = {}) {
  for (const role of roles) {
    const existing = await Role.where((r) => r.name.ilike(escapeLike(role.name))).first();
    if (!existing) {
      await Role.create(role);
      log(`Created role ${role.name}`);
    }
  }

  if (!adminEmail || !adminPassword) {
    log("Skipped admin user: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one.");
    return;
  }
  if (!passwordSchema.safeParse(adminPassword).success || isWeakSecret(adminPassword)) {
    throw new Error("SEED_ADMIN_PASSWORD must be 8 to 72 bytes and not a placeholder or an obvious weak value.");
  }
  const email = adminEmail.trim().toLowerCase();
  if (await User.where({ email }).first()) {
    log(`Admin user ${email} already exists, left unchanged.`);
    return;
  }
  const role = await Role.where((r) => r.name.ilike(escapeLike(adminRole))).first();
  await User.create({
    fullName: "Administrator",
    email,
    roleId: role.id,
    isActive: true,
    passwordHash: await hashPassword(adminPassword),
  });
  log(`Created admin user ${email}`);
  if (role.permissions.length === 0) {
    log(`Warning: role ${role.name} has no permissions, so this user cannot do anything yet.`);
  }
}
