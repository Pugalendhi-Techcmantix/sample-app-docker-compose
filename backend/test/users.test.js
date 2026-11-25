import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { db } from "../src/db.js";
import { resetDb } from "./helpers.js";

const app = createApp();
let role;

beforeEach(async () => {
  await resetDb();
  role = await db.orm.public.Role.create({ name: "Admin" });
});
afterAll(() => db.close());

const createUser = (body = {}) =>
  request(app)
    .post("/api/users")
    .send({
      fullName: "Asha K",
      email: "Asha@X.com",
      roleId: role.id,
      ...body,
    });

describe("users API", () => {
  it("POST creates a user: lowercased email, roleName, isActive default", async () => {
    const res = await createUser();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      fullName: "Asha K",
      email: "asha@x.com",
      roleId: role.id,
      roleName: "Admin",
      isActive: true,
    });
    expect(res.body.role).toBeUndefined();
  });

  it("POST with invalid email -> 400 field email", async () => {
    const res = await createUser({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("email");
  });

  it("POST with roleId that does not exist -> 400 field roleId (not 500)", async () => {
    const res = await createUser({ roleId: 99999 });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toEqual({
      field: "roleId",
      message: "Role does not exist",
    });
  });

  it("POST with missing / non-integer roleId -> 400 field roleId", async () => {
    const res = await request(app)
      .post("/api/users")
      .send({ fullName: "A", email: "a@x.com" });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toContain("roleId");
    const res2 = await createUser({ roleId: "abc" });
    expect(res2.status).toBe(400);
  });

  it("POST duplicate email with different case -> 409", async () => {
    await createUser();
    const res = await createUser({ email: "ASHA@x.com", fullName: "Other" });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("Email already exists");
  });

  it("GET list includes roleName, sorted by fullName", async () => {
    await createUser({ fullName: "Zed", email: "z@x.com" });
    await createUser({ fullName: "Amy", email: "a@x.com" });
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(200);
    expect(res.body.map((u) => u.fullName)).toEqual(["Amy", "Zed"]);
    expect(res.body[0].roleName).toBe("Admin");
  });

  it("GET one -> 200; non-numeric or unknown id -> 404", async () => {
    const { body } = await createUser();
    expect((await request(app).get(`/api/users/${body.id}`)).status).toBe(200);
    for (const id of ["abc", "99999"]) {
      const res = await request(app).get(`/api/users/${id}`);
      expect(res.status, id).toBe(404);
      expect(res.body).toEqual({ error: { message: "Not found" } });
    }
  });

  it("PUT changes role and deactivates", async () => {
    const other = await db.orm.public.Role.create({ name: "Staff" });
    const { body } = await createUser();
    const res = await request(app)
      .put(`/api/users/${body.id}`)
      .send({
        fullName: "Asha K",
        email: "asha@x.com",
        roleId: other.id,
        isActive: false,
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      roleId: other.id,
      roleName: "Staff",
      isActive: false,
    });
  });

  it("PUT: unknown id -> 404, unknown roleId -> 400, email taken -> 409", async () => {
    const a = (await createUser()).body;
    await createUser({ email: "b@x.com", fullName: "B" });
    const ok = { fullName: "Asha K", email: "asha@x.com", roleId: role.id };
    expect((await request(app).put("/api/users/99999").send(ok)).status).toBe(
      404,
    );
    expect((await request(app).put("/api/users/abc").send(ok)).status).toBe(
      404,
    );
    const fk = await request(app)
      .put(`/api/users/${a.id}`)
      .send({ ...ok, roleId: 99999 });
    expect(fk.status).toBe(400);
    expect(fk.body.error.details[0].field).toBe("roleId");
    const dup = await request(app)
      .put(`/api/users/${a.id}`)
      .send({ ...ok, email: "B@x.com" });
    expect(dup.status).toBe(409);
  });

  it("DELETE -> 204, second DELETE -> 404, non-numeric -> 404", async () => {
    const { body } = await createUser();
    expect((await request(app).delete(`/api/users/${body.id}`)).status).toBe(
      204,
    );
    expect((await request(app).delete(`/api/users/${body.id}`)).status).toBe(
      404,
    );
    expect((await request(app).delete("/api/users/abc")).status).toBe(404);
  });

  it("errors never leak internals: body is always { error: { message } }", async () => {
    const res = await createUser({ roleId: 99999 });
    expect(Object.keys(res.body)).toEqual(["error"]);
    expect(JSON.stringify(res.body)).not.toMatch(
      /violates|constraint|sql|stack/i,
    );
  });
});
