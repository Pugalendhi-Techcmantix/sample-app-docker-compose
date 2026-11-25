import { randomBytes } from "node:crypto";

// Tests run against the same database as DATABASE_URL (from backend/.env or the
// environment). They never migrate, truncate or wipe anything: each test creates
// uniquely marked dummy rows and deletes exactly those (see test/helpers.js).
export default function setup() {
  // One marker per `npm test` run; workers inherit it.
  process.env.TEST_RUN_ID = randomBytes(4).toString("hex");
  // Auth settings for tests (override whatever .env holds; dotenv never overrides these).
  process.env.JWT_SECRET = "test-only-secret-" + randomBytes(24).toString("hex");
  process.env.LOGIN_RATE_LIMIT_DISABLED = "true";
  process.env.BCRYPT_COST = "4";
  process.env.COOKIE_SECURE = "false";
  process.env.JWT_EXPIRES_IN = "8h";
}
