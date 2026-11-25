import { Router } from "express";
import { assertAdminRemains, withAdminLock } from "../adminGuard.js";
import { requirePermission } from "../auth.js";
import { escapeLike } from "../like.js";
import { db } from "../db.js";
import { HttpError, mapPrismaError } from "../errors.js";
import { parseBody, parseId, roleSchema } from "../validation.js";

const Role = db.orm.public.Role;
const User = db.orm.public.User;
const router = Router();

const nameTaken = "Role name already exists";

async function assertNameFree(name, exceptId) {
  const dup = await Role.where((r) => r.name.ilike(escapeLike(name))).first();
  if (dup && dup.id !== exceptId) {
    throw new HttpError(409, nameTaken, [
      { field: "name", message: nameTaken },
    ]);
  }
}

// The lower(name) unique index is the race backstop for assertNameFree.
async function write(fn) {
  try {
    return await fn();
  } catch (err) {
    throw mapPrismaError(err, { unique: nameTaken }) ?? err;
  }
}

const toRoleDto = ({ users, ...role }, userCount = users) => ({
  ...role,
  userCount,
});

const countUsers = async (roleId) =>
  (await User.where({ roleId }).aggregate((a) => ({ n: a.count() }))).n;

// Any signed-in user (feeds the role dropdown of the user form). Declared before /:id.
router.get("/options", async (req, res) => {
  const roles = await Role.select("id", "name")
    .orderBy((r) => r.name.asc())
    .all();
  res.json(roles);
});

router.get("/", requirePermission("roles.view"), async (req, res) => {
  const roles = await Role.include("users", (u) => u.count())
    .orderBy((r) => r.name.asc())
    .all();
  res.json(roles.map((r) => toRoleDto(r)));
});

router.get("/:id", requirePermission("roles.view"), async (req, res) => {
  const id = parseId(req.params.id);
  const role = await Role.first({ id });
  if (!role) throw new HttpError(404, "Not found");
  res.json(toRoleDto(role, await countUsers(id)));
});

router.post("/", requirePermission("roles.manage"), async (req, res) => {
  const data = parseBody(roleSchema, req.body);
  await assertNameFree(data.name);
  const role = await write(() => Role.create(data));
  res.status(201).json(toRoleDto(role, 0));
});

router.put("/:id", requirePermission("roles.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  const data = parseBody(roleSchema, req.body);
  await assertNameFree(data.name, id);
  // Check + write in one locked transaction, so two requests cannot both remove the last admin.
  const role = await write(() =>
    withAdminLock(async (tx) => {
      await assertAdminRemains(tx, ({ roles, users }) => ({
        roles: roles.map((x) => (x.id === id ? { ...x, permissions: data.permissions } : x)),
        users,
      }));
      return tx.orm.public.Role.where({ id }).update(data);
    }),
  );
  if (!role) throw new HttpError(404, "Not found");
  res.json(toRoleDto(role, await countUsers(id)));
});

router.delete("/:id", requirePermission("roles.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  let deleted;
  try {
    deleted = await withAdminLock(async (tx) => {
      const { n } = await tx.orm.public.User.where({ roleId: id }).aggregate((a) => ({ n: a.count() }));
      if (n > 0) throw new HttpError(409, `Role is assigned to ${n} user(s)`);
      await assertAdminRemains(tx, ({ roles, users }) => ({ roles: roles.filter((x) => x.id !== id), users }));
      return tx.orm.public.Role.where({ id }).delete();
    });
  } catch (err) {
    // DB backstop (ON DELETE RESTRICT) if a user got this role in the meantime.
    throw (
      mapPrismaError(err, {
        fk: { status: 409, message: "Role is assigned to one or more users" },
      }) ?? err
    );
  }
  if (!deleted) throw new HttpError(404, "Not found");
  res.status(204).end();
});

export default router;
