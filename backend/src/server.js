import { createApp } from "./app.js";
import { config } from "./config.js";
import { db } from "./db.js";

const server = createApp().listen(config.port, () => {
  console.log(`API listening on :${config.port}`);
});

async function shutdown() {
  server.close();
  await db.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
