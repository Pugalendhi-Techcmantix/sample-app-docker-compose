import { createApp } from "./app.js";
import { assertConfig, config } from "./config.js";
import { db } from "./db.js";

// Refuse to start without a usable JWT secret.
try {
  assertConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

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
