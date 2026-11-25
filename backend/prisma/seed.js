import { db } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";

try {
  await seedDatabase();
  console.log("Seed complete");
} finally {
  await db.close();
}
