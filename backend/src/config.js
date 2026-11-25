import "dotenv/config";

const DEFAULT_ORIGINS = "http://localhost:5173,http://localhost:8080";

// "a, b,," -> ['a', 'b']
export function parseOrigins(value) {
  return (value || DEFAULT_ORIGINS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Placeholders copied from an example file and the most obvious weak values.
const WEAK = new Set(["password", "admin", "12345678", "changeme", "secret"]);
export function isWeakSecret(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "" || v.startsWith("change-me") || WEAK.has(v);
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL,
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  jwtSecret: process.env.JWT_SECRET,
  // Number of reverse-proxy hops to trust for X-Forwarded-For (0 = trust none).
  trustProxy: Math.max(0, parseInt(process.env.TRUST_PROXY, 10) || 0),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  loginRateLimitDisabled: process.env.LOGIN_RATE_LIMIT_DISABLED === "true",
  // bcrypt cost: 12 in real use; tests lower it to stay fast.
  bcryptCost: Math.max(4, Number(process.env.BCRYPT_COST) || 12),
};

// Called at startup: the server must refuse to run without a usable JWT secret.
export function assertConfig(cfg = config) {
  if (!cfg.jwtSecret || cfg.jwtSecret.length < 32 || isWeakSecret(cfg.jwtSecret)) {
    throw new Error(
      "JWT_SECRET is missing, shorter than 32 characters, or a placeholder. Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
    );
  }
}
