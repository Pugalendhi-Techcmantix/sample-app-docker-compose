import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { db } from "../src/db.js";
import { resetDb } from "./helpers.js";

const app = createApp();
const Role = db.orm.public.Role;
const User = db.orm.public.User;

beforeEach(resetDb);
afterAll(() => db.close());

const createRole = (body) => request(app).post("/api/roles").send(body);

describe("roles API", () => {
  it("POST creates a role", async () => {
    const res = await createRole({ name: "Admin", description: "All access" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Admin",
      description: "All access",
    });
    expect(res.body.id).toBeTypeOf("number");
    expect(typeof res.body.createdAt).toBe("string");
  });

  it("POST with empty name -> 400 with field detail", async () => {
    const res = await createRole({ name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
    expect(res.body.error.details[0].field).toBe("name");
  });

  it("POST with malformed JSON -> 400, not 500", async () => {
    const res = await request(app)
      .post("/api/roles")
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBeTypeOf("string");
  });

  it("POST duplicate name with different case -> 409", async () => {
    await createRole({ name: "Admin" });
    const res = await createRole({ name: "admin" });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("Role name already exists");
  });

  it("DB backstop: lower(name) unique index rejects a case-variant even without the pre-check", async () => {
    await Role.create({ name: "Admin" });
    await expect(Role.create({ name: "ADMIN" })).rejects.toMatchObject({
      sqlState: "23505",
    });
  });

  it("LIKE wildcards in a name are not treated as patterns", async () => {
    await createRole({ name: "Admin" });
    const res = await createRole({ name: "Ad%" });
    expect(res.status).toBe(201);
  });

  it("GET list is sorted by name", async () => {
    await createRole({ name: "Staff" });
    await createRole({ name: "Admin" });
    await createRole({ name: "Manager" });
    const res = await request(app).get("/api/roles");
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.name)).toEqual(["Admin", "Manager", "Staff"]);
  });

  it("GET one -> 200; non-numeric or unknown id -> 404", async () => {
    const { body } = await createRole({ name: "Admin" });
    expect((await request(app).get(`/api/roles/${body.id}`)).status).toBe(200);
    for (const id of ["abc", "99999", "0", "1.5", "-1", "99999999999999"]) {
      const res = await request(app).get(`/api/roles/${id}`);
      expect(res.status, id).toBe(404);
      expect(res.body).toEqual({ error: { message: "Not found" } });
    }
  });

  it("PUT updates and bumps updatedAt", async () => {
    const { body } = await createRole({ name: "Admin" });
    await new Promise((r) => setTimeout(r, 15));
    const res = await request(app)
      .put(`/api/roles/${body.id}`)
      .send({ name: "Super Admin" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Super Admin");
    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(
      new Date(res.body.createdAt).getTime(),
    );
  });

  it("PUT may keep its own name (changing only the case) but not take another role's", async () => {
    const a = (await createRole({ name: "Admin" })).body;
    await createRole({ name: "Staff" });
    expect(
      (await request(app).put(`/api/roles/${a.id}`).send({ name: "ADMIN" }))
        .status,
    ).toBe(200);
    expect(
      (await request(app).put(`/api/roles/${a.id}`).send({ name: "staff" }))
        .status,
    ).toBe(409);
  });

  it("PUT / DELETE on unknown or non-numeric id -> 404", async () => {
    expect(
      (await request(app).put("/api/roles/99999").send({ name: "X" })).status,
    ).toBe(404);
    expect(
      (await request(app).put("/api/roles/abc").send({ name: "X" })).status,
    ).toBe(404);
    expect((await request(app).delete("/api/roles/99999")).status).toBe(404);
    expect((await request(app).delete("/api/roles/abc")).status).toBe(404);
  });

  it("DELETE unused role -> 204, then GET -> 404", async () => {
    const { body } = await createRole({ name: "Admin" });
    expect((await request(app).delete(`/api/roles/${body.id}`)).status).toBe(
      204,
    );
    expect((await request(app).get(`/api/roles/${body.id}`)).status).toBe(404);
  });

  it("DELETE a role in use -> 409 with the user count, role survives", async () => {
    const { body } = await createRole({ name: "Admin" });
    await User.create({ fullName: "A", email: "a@x.com", roleId: body.id });
    await User.create({ fullName: "B", email: "b@x.com", roleId: body.id });
    const res = await request(app).delete(`/api/roles/${body.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("Role is assigned to 2 user(s)");
    expect((await request(app).get(`/api/roles/${body.id}`)).status).toBe(200);
  });
});
