import 'dotenv/config';

const DEFAULT_ORIGINS = 'http://localhost:5173,http://localhost:8080';

// "a, b,," -> ['a', 'b']
export function parseOrigins(value) {
  return (value || DEFAULT_ORIGINS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL,
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
};
