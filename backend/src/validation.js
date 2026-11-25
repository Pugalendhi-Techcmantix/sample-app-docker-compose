import { z } from "zod";
import { HttpError } from "./errors.js";

const INT32_MAX = 2147483647;

// Postgres text cannot store NUL; reject it up front instead of failing with a 500.
const noNul = (s) => !s.includes("\u0000");
const NUL_MSG = "Must not contain null characters";

const required = (max) =>
  z.string().trim().min(1, "Required").max(max, `Must be at most ${max} characters`).refine(noNul, NUL_MSG);

export const roleSchema = z.object({
  name: required(50),
  description: z
    .string()
    .trim()
    .max(255, "Must be at most 255 characters")
    .refine(noNul, NUL_MSG)
    .nullish()
    .transform((v) => v || null),
});

export const userSchema = z.object({
  fullName: required(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(255, "Must be at most 255 characters")
    .refine(noNul, NUL_MSG)
    .pipe(z.email("Invalid email address")),
  roleId: z
    .number({ error: "Required" })
    .int("Must be an integer")
    .positive("Must be a positive integer")
    .max(INT32_MAX, `Must be at most ${INT32_MAX}`),
  isActive: z.boolean().default(true),
});

// Runs a zod schema; on failure throws 400 with one detail per field.
export function parseBody(schema, body) {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const byField = new Map();
  for (const issue of result.error.issues) {
    const field = issue.path.join(".") || "_";
    if (!byField.has(field)) byField.set(field, { field, message: issue.message });
  }
  throw new HttpError(400, "Validation failed", [...byField.values()]);
}

// '12' -> 12; anything else ('abc', '0', '1.5', '-3', out of int4 range) -> 404.
export function parseId(raw) {
  if (!/^[1-9]\d{0,9}$/.test(String(raw)) || Number(raw) > INT32_MAX) {
    throw new HttpError(404, "Not found");
  }
  return Number(raw);
}
