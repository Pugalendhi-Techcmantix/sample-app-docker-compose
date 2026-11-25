import { Router } from "express";
import { hashPassword, requirePermission } from "../auth.js";
import { db } from "../db.js";
import { HttpError, mapPrismaError } from "../errors.js";
import {
  parseBody,
  parseId,
  userCreateSchema,
  userUpdateSchema,
} from "../validation.js";

const User = db.orm.public.User;
const router = Router();

const withRole = () => User.include("role", (r) => r.select("name"));

// Flattens the role name and drops the password hash: the hash never leaves the server.
function toUserDto({ role, passwordHash, ...user }) {
  return { ...user, roleName: role.name };
}

const findUser = (id) => withRole().where({ id }).first();

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
  const passwordHash = await hashPassword(password);
  const created = await write(() => User.create({ ...data, passwordHash }));
  res.status(201).json(toUserDto(await findUser(created.id)));
});

router.put("/:id", requirePermission("users.edit"), async (req, res) => {
  const id = parseId(req.params.id);
  const { password, ...data } = parseBody(userUpdateSchema, req.body);
  if (id === req.user.id && data.isActive === false) {
    throw new HttpError(409, "You cannot deactivate your own account");
  }
  const changes = password
    ? { ...data, passwordHash: await hashPassword(password) }
    : data;
  const updated = await write(() => User.where({ id }).update(changes));
  if (!updated) throw new HttpError(404, "Not found");
  res.json(toUserDto(await findUser(id)));
});

router.delete("/:id", requirePermission("users.delete"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === req.user.id)
    throw new HttpError(409, "You cannot delete your own account");
  const deleted = await User.where({ id }).delete();
  if (!deleted) throw new HttpError(404, "Not found");
  res.status(204).end();
});

export default router;
