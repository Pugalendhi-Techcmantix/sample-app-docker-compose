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

const tooMany = (req, res) =>
  res.status(429).json({ error: { message: "Too many attempts, try again later" } });
const skip = () => config.loginRateLimitDisabled; // switched off in tests only

// Login: 10 attempts / minute / IP, and 10 attempts / 15 minutes / email (stops distributed guessing).
const loginIpLimiter = rateLimit({ windowMs: 60_000, limit: 10, skip, handler: tooMany });
const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skip,
  handler: tooMany,
  keyGenerator: (req) =>
    typeof req.body?.email === "string" ? `email:${req.body.email.trim().toLowerCase()}` : "email:none",
});
// Change password: 10 attempts / 15 minutes / signed-in user.
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skip,
  handler: tooMany,
  keyGenerator: (req) => `user:${req.user.id}`,
});

router.post("/login", loginIpLimiter, loginEmailLimiter, async (req, res) => {
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

router.post("/change-password", requireAuth, changePasswordLimiter, async (req, res) => {
  const { currentPassword, newPassword } = parseBody(changePasswordSchema, req.body);
  const user = await findUserWithRole({ id: req.user.id });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Validation failed", [{ field: "currentPassword", message: "Current password is incorrect" }]);
  }
  await db.orm.public.User.where({ id: user.id }).update({ passwordHash: await hashPassword(newPassword) });
  res.status(204).end();
});

export default router;
