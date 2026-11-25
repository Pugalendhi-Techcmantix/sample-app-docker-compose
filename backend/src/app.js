import express from "express";
import { db } from "./db.js";
import { HttpError, errorHandler } from "./errors.js";
import rolesRouter from "./routes/roles.js";
import usersRouter from "./routes/users.js";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/api/health", async (req, res) => {
    await db.execute(db.raw.sql`SELECT 1`.affectedCount().build());
    res.json({ status: "ok" });
  });
  app.use("/api/roles", rolesRouter);
  app.use("/api/users", usersRouter);
  app.use((req, res, next) => next(new HttpError(404, "Not found")));
  app.use(errorHandler);
  return app;
}
