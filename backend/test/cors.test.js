import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { db } from "../src/db.js";

afterAll(() => db.close());

const app = createApp({ corsOrigins: ["http://localhost:5173", "http://localhost:8080"] });

describe("CORS", () => {
  it("allowed origin gets Access-Control-Allow-Origin", async () => {
    const res = await request(app).get("/api/live").set("Origin", "http://localhost:5173");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("disallowed origin gets no CORS headers (and is not an error)", async () => {
    const res = await request(app).get("/api/live").set("Origin", "http://evil.example");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("preflight for PUT with JSON content type is allowed from an allowed origin", async () => {
    const res = await request(app)
      .options("/api/roles/1")
      .set("Origin", "http://localhost:8080")
      .set("Access-Control-Request-Method", "PUT")
      .set("Access-Control-Request-Headers", "content-type");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:8080");
    expect(res.headers["access-control-allow-methods"]).toMatch(/PUT/);
    expect(res.headers["access-control-allow-headers"]).toMatch(/content-type/i);
  });

  it("CORS_ORIGINS env is parsed as a comma-separated list with a sane default", async () => {
    const { parseOrigins } = await import("../src/config.js");
    expect(parseOrigins(undefined)).toEqual(["http://localhost:5173", "http://localhost:8080"]);
    expect(parseOrigins(" http://a.test , http://b.test ,")).toEqual(["http://a.test", "http://b.test"]);
  });
});
