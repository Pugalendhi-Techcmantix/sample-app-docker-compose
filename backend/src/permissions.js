// The fixed permission list. Roles hold a subset (roles.permissions, text[]).
export const PERMISSIONS = [
  { key: "users.view", group: "users", label: "View users" },
  { key: "users.create", group: "users", label: "Create users" },
  { key: "users.edit", group: "users", label: "Edit users" },
  { key: "users.delete", group: "users", label: "Delete users" },
  { key: "roles.view", group: "roles", label: "View roles" },
  { key: "roles.manage", group: "roles", label: "Create, edit and delete roles" },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

// Permissions given to the seeded roles when they are created.
export const SEED_ROLES = [
  { name: "Admin", description: "Full access", permissions: PERMISSION_KEYS },
  {
    name: "Manager",
    description: "Manages a team",
    permissions: ["users.view", "users.create", "users.edit", "roles.view"],
  },
  { name: "Staff", description: "Standard user", permissions: ["users.view"] },
];

// Roles that together keep the system administrable.
export const ADMIN_PERMISSIONS = ["roles.manage", "users.edit"];

export const holdsAdminPermissions = (permissions) => ADMIN_PERMISSIONS.every((p) => permissions.includes(p));

// Would the system still have a role with roles.manage AND users.edit after this change?
// roles: [{id, permissions}]; changedId: role being updated/deleted; newPermissions: null for delete.
export function keepsAdminRole(roles, changedId, newPermissions) {
  return roles.some((r) =>
    r.id === changedId ? newPermissions !== null && holdsAdminPermissions(newPermissions) : holdsAdminPermissions(r.permissions),
  );
}
