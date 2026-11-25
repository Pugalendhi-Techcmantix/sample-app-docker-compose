import { Router } from "express";
import { db } from "../db.js";
import { HttpError, mapPrismaError } from "../errors.js";
import { parseBody, parseId, userSchema } from "../validation.js";

const User = db.orm.public.User;
const router = Router();

const withRole = () => User.include("role", (r) => r.select("name"));

function toUserDto({ role, ...user }) {
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

router.get("/", async (req, res) => {
  const users = await withRole()
    .orderBy((u) => u.fullName.asc())
    .all();
  res.json(users.map(toUserDto));
});

router.get("/:id", async (req, res) => {
  const user = await findUser(parseId(req.params.id));
  if (!user) throw new HttpError(404, "Not found");
  res.json(toUserDto(user));
});

router.post("/", async (req, res) => {
  const data = parseBody(userSchema, req.body);
  const created = await write(() => User.create(data));
  res.status(201).json(toUserDto(await findUser(created.id)));
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const data = parseBody(userSchema, req.body);
  const updated = await write(() => User.where({ id }).update(data));
  if (!updated) throw new HttpError(404, "Not found");
  res.json(toUserDto(await findUser(id)));
});

router.delete("/:id", async (req, res) => {
  const deleted = await User.where({ id: parseId(req.params.id) }).delete();
  if (!deleted) throw new HttpError(404, "Not found");
  res.status(204).end();
});

export default router;
