import { db } from "../src/db.js";

export async function resetDb() {
  await db.execute(
    db.raw.sql`TRUNCATE users, roles RESTART IDENTITY CASCADE`
      .affectedCount()
      .build(),
  );
}
