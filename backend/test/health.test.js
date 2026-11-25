import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { db } from "../src/db.js";

afterAll(() => db.close());

describe("liveness, health, 404", () => {
  const app = createApp();

  it("GET /api/live -> 200 without touching the DB", async () => {
    const res = await request(createApp({ checkDb: () => Promise.reject(new Error("must not be called")) })).get(
      "/api/live",
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "live" });
  });

  it("GET /api/health -> 200 ok when the DB answers", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /api/health -> 503 db-not-migrated when tables are missing (Postgres 42P01)", async () => {
    const missing = Object.assign(new Error("relation does not exist"), { kind: "sql_query", sqlState: "42P01" });
    const res = await request(createApp({ checkDb: () => Promise.reject(missing) })).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "db-not-migrated" });
  });

  it("GET /api/health -> 503 db-down on any other DB failure, no internals leaked", async () => {
    const down = Object.assign(new Error("connect ECONNREFUSED secret-host:5433"), { kind: "sql_connection" });
    const res = await request(createApp({ checkDb: () => Promise.reject(down) })).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "db-down" });
  });

  it("GET /api/nope -> 404 error body", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: "Not found" } });
  });
});
