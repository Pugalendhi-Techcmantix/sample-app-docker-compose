import { Router } from "express";
import { db } from "../db.js";
import { HttpError, mapPrismaError } from "../errors.js";
import { parseBody, parseId, roleSchema } from "../validation.js";

const Role = db.orm.public.Role;
const User = db.orm.public.User;
const router = Router();

const nameTaken = "Role name already exists";

// Escape LIKE wildcards so ilike behaves as a case-insensitive equality check.
const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&");

async function assertNameFree(name, exceptId) {
  const dup = await Role.where((r) => r.name.ilike(escapeLike(name))).first();
  if (dup && dup.id !== exceptId) {
    throw new HttpError(409, nameTaken, [
      { field: "name", message: nameTaken },
    ]);
  }
}

// lower(name) unique index is the race backstop for assertNameFree.
async function write(fn) {
  try {
    return await fn();
  } catch (err) {
    throw mapPrismaError(err, { unique: nameTaken }) ?? err;
  }
}

router.get("/", async (req, res) => {
  res.json(await Role.orderBy((r) => r.name.asc()).all());
});

router.get("/:id", async (req, res) => {
  const role = await Role.first({ id: parseId(req.params.id) });
  if (!role) throw new HttpError(404, "Not found");
  res.json(role);
});

router.post("/", async (req, res) => {
  const data = parseBody(roleSchema, req.body);
  await assertNameFree(data.name);
  res.status(201).json(await write(() => Role.create(data)));
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const data = parseBody(roleSchema, req.body);
  await assertNameFree(data.name, id);
  const role = await write(() => Role.where({ id }).update(data));
  if (!role) throw new HttpError(404, "Not found");
  res.json(role);
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const { n } = await User.where({ roleId: id }).aggregate((a) => ({
    n: a.count(),
  }));
  if (n > 0) throw new HttpError(409, `Role is assigned to ${n} user(s)`);
  let deleted;
  try {
    deleted = await Role.where({ id }).delete();
  } catch (err) {
    // DB backstop (ON DELETE RESTRICT) if a user got this role since the count.
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
