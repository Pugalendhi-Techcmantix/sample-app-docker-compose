import { db } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";

try {
  await seedDatabase({
    adminEmail: process.env.SEED_ADMIN_EMAIL,
    adminPassword: process.env.SEED_ADMIN_PASSWORD,
  });
  console.log("Seed complete");
} finally {
  await db.close();
}
