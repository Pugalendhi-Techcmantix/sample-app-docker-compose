import { db } from "../src/db.js";

const Role = db.orm.public.Role;
const roles = [
  { name: "Admin", description: "Full access" },
  { name: "Manager", description: "Manages a team" },
  { name: "Staff", description: "Standard user" },
];

try {
  for (const role of roles) {
    // Idempotent: skip when a role with this name exists (case-insensitive).
    const existing = await Role.where((r) => r.name.ilike(role.name)).first();
    if (!existing) await Role.create(role);
  }
  console.log("Seed complete");
} finally {
  await db.close();
}
