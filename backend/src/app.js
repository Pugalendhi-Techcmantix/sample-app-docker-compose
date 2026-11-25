import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { db } from "./db.js";
import { HttpError, errorHandler } from "./errors.js";
import { requireAuth } from "./auth.js";
import { PERMISSIONS } from "./permissions.js";
import authRouter from "./routes/auth.js";
import rolesRouter from "./routes/roles.js";
import usersRouter from "./routes/users.js";

// Touches both tables, so it fails if the database is down or not migrated yet.
async function checkDb() {
  await db.execute(
    db.raw.sql`SELECT 1 FROM roles LIMIT 1`.affectedCount().build(),
  );
  await db.execute(
    db.raw.sql`SELECT 1 FROM users LIMIT 1`.affectedCount().build(),
  );
}

export function createApp({
  trustProxy = config.trustProxy,
  corsOrigins = config.corsOrigins,
  checkDb: check = checkDb,
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  // Only behind a known reverse proxy; otherwise X-Forwarded-For could be spoofed to dodge rate limits.
  if (trustProxy > 0) app.set("trust proxy", trustProxy);
  // Origins not on the list simply get no CORS headers.
  app.use(
    cors({
      origin: corsOrigins,
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type"],
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());

  // Liveness: process is up. Never touches the DB.
  app.get("/api/live", (req, res) => res.json({ status: "live" }));

  // Readiness: 200 ok, or 503 db-not-migrated (Postgres 42P01 undefined_table) / db-down.
  app.get("/api/health", async (req, res) => {
    try {
      await check();
      res.json({ status: "ok" });
    } catch (err) {
      const status = err?.sqlState === "42P01" ? "db-not-migrated" : "db-down";
      console.error(`health check failed (${status}):`, err?.message);
      res.status(503).json({ status });
    }
  });
  app.use("/api/auth", authRouter);
  app.get("/api/permissions", requireAuth, (req, res) => res.json(PERMISSIONS));
  app.use("/api/roles", requireAuth, rolesRouter);
  app.use("/api/users", requireAuth, usersRouter);
  app.use((req, res, next) => next(new HttpError(404, "Not found")));
  app.use(errorHandler);
  return app;
}
