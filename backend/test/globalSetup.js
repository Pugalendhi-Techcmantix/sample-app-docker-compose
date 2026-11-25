import { randomBytes } from "node:crypto";

// Tests run against the same database as DATABASE_URL (from backend/.env or the
// environment). They never migrate, truncate or wipe anything: each test creates
// uniquely marked dummy rows and deletes exactly those (see test/helpers.js).
export default function setup() {
  // One marker per `npm test` run; workers inherit it.
  process.env.TEST_RUN_ID = randomBytes(4).toString("hex");
}
