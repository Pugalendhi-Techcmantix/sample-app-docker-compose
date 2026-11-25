import { Router } from "express";
import { assertAdminRemains, withAdminLock } from "../adminGuard.js";
import { hashPassword, requirePermission } from "../auth.js";
import { db } from "../db.js";
import { HttpError, mapPrismaError } from "../errors.js";
import { isSubset } from "../permissions.js";
import {
  parseBody,
  parseId,
  userCreateSchema,
  userUpdateSchema,
} from "../validation.js";

const User = db.orm.public.User;
const router = Router();

const ASSIGN_MSG =
  "You cannot assign a role with more permissions than your own";
const MODIFY_MSG =
  "You cannot modify a user whose role has more permissions than your own";

const withRole = () => User.include("role", (r) => r.select("name"));

// Flattens the role name and drops the password hash: the hash never leaves the server.
function toUserDto({ role, passwordHash, ...user }) {
  return { ...user, roleName: role.name };
}

const findUser = (id) => withRole().where({ id }).first();

// Privilege escalation guard: nobody may hand out, or act on, more than they hold themselves.
async function assertCanAssign(client, caller, roleId) {
  const role = await client.orm.public.Role.first({ id: roleId });
  // Unknown role: left to the foreign key, which answers 400 "Role does not exist".
  if (role && !isSubset(role.permissions, caller.permissions))
    throw new HttpError(403, ASSIGN_MSG);
}

async function loadTarget(client, caller, id) {
  const target = await client.orm.public.User.include("role", (r) =>
    r.select("permissions"),
  )
    .where({ id })
    .first();
  if (!target) throw new HttpError(404, "Not found");
  if (!isSubset(target.role.permissions, caller.permissions))
    throw new HttpError(403, MODIFY_MSG);
  return target;
}

async function write(fn) {
  try {
    return await fn();
  } catch (err) {
    throw (
      mapPrismaError(err, {
        unique: "Email already exists",
        fk: { status: 400, field: "roleId", message: "Role does not exist" },
      }) ?? err
    );
  }
}

router.get("/", requirePermission("users.view"), async (req, res) => {
  const users = await withRole()
    .orderBy((u) => u.fullName.asc())
    .all();
  res.json(users.map(toUserDto));
});

router.get("/:id", requirePermission("users.view"), async (req, res) => {
  const user = await findUser(parseId(req.params.id));
  if (!user) throw new HttpError(404, "Not found");
  res.json(toUserDto(user));
});

router.post("/", requirePermission("users.create"), async (req, res) => {
  const { password, ...data } = parseBody(userCreateSchema, req.body);
  await assertCanAssign(db, req.user, data.roleId);
  const passwordHash = await hashPassword(password);
  const created = await write(() => User.create({ ...data, passwordHash }));
  res.status(201).json(toUserDto(await findUser(created.id)));
});

router.put("/:id", requirePermission("users.edit"), async (req, res) => {
  const id = parseId(req.params.id);
  const { password, isActive, ...data } = parseBody(userUpdateSchema, req.body);
  if (id === req.user.id && isActive === false) {
    throw new HttpError(409, "You cannot deactivate your own account");
  }
  if (id === req.user.id && data.roleId !== req.user.roleId) {
    throw new HttpError(403, "You cannot change your own role");
  }
  // An omitted isActive keeps the current value (never silently re-activates).
  const changes = { ...data };
  if (isActive !== undefined) changes.isActive = isActive;
  if (password) changes.passwordHash = await hashPassword(password);

  await write(() =>
    withAdminLock(async (tx) => {
      await loadTarget(tx, req.user, id);
      await assertCanAssign(tx, req.user, data.roleId);
      await assertAdminRemains(tx, ({ roles, users }) => ({
        roles,
        users: users.map((u) =>
          u.id === id
            ? { ...u, roleId: data.roleId, isActive: isActive ?? u.isActive }
            : u,
        ),
      }));
      await tx.orm.public.User.where({ id }).update(changes);
    }),
  );
  res.json(toUserDto(await findUser(id)));
});

router.delete("/:id", requirePermission("users.delete"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === req.user.id)
    throw new HttpError(409, "You cannot delete your own account");
  await withAdminLock(async (tx) => {
    await loadTarget(tx, req.user, id);
    await assertAdminRemains(tx, ({ roles, users }) => ({
      roles,
      users: users.filter((u) => u.id !== id),
    }));
    await tx.orm.public.User.where({ id }).delete();
  });
  res.status(204).end();
});

export default router;
