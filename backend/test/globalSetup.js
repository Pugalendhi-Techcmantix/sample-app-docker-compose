import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

export default function setup() {
  // The repo-root .env (shared with docker compose) holds TEST_DATABASE_URL.
  loadEnv({
    path: fileURLToPath(new URL("../../.env", import.meta.url)),
    quiet: true,
  });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  // Worker processes inherit this, so src/config.js uses the test DB, not the app DB.
  process.env.DATABASE_URL = url;
  execSync("npx prisma db migrate --no-advance-ref", { stdio: "inherit", env: process.env });
}
