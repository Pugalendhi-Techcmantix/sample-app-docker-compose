import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  clearAuthCookie,
  findUserWithRole,
  hashPassword,
  requireAuth,
  setAuthCookie,
  signToken,
  toAuthUser,
  verifyPassword,
} from "../auth.js";
import { config } from "../config.js";
import { db } from "../db.js";
import { HttpError } from "../errors.js";
import { changePasswordSchema, parseBody } from "../validation.js";

const router = Router();
const invalid = () => new HttpError(401, "Invalid email or password");

// 10 attempts / minute / IP (switched off in tests via LOGIN_RATE_LIMIT_DISABLED).
const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  skip: () => config.loginRateLimitDisabled,
  handler: (req, res) => res.status(429).json({ error: { message: "Too many login attempts, try again in a minute" } }),
});

router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") throw invalid();
  const user = await findUserWithRole((u) => u.email.eq(email.trim().toLowerCase()));
  // Same work and same answer for unknown email, no password, wrong password, inactive.
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok || !user.isActive) throw invalid();
  setAuthCookie(res, signToken(user.id));
  res.json({ user: toAuthUser(user) });
});

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = parseBody(changePasswordSchema, req.body);
  const user = await findUserWithRole({ id: req.user.id });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Validation failed", [{ field: "currentPassword", message: "Current password is incorrect" }]);
  }
  await db.orm.public.User.where({ id: user.id }).update({ passwordHash: await hashPassword(newPassword) });
  res.status(204).end();
});

export default router;
