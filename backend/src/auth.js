import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { db } from "./db.js";
import { HttpError } from "./errors.js";

const COOKIE_NAME = "token";
const User = db.orm.public.User;

export const hashPassword = (password) => bcrypt.hash(password, config.bcryptCost);

// Compared against when the email is unknown, so timing does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", config.bcryptCost);
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash ?? DUMMY_HASH).then((ok) => ok && Boolean(hash));
}

// The token carries only the user id; everything else is read from the DB per request.
export function signToken(userId) {
  return jwt.sign({}, config.jwtSecret, { algorithm: "HS256", subject: String(userId), expiresIn: config.jwtExpiresIn });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
}

const cookieBase = () => ({ httpOnly: true, sameSite: "lax", secure: config.cookieSecure, path: "/" });

export function setAuthCookie(res, token) {
  const { exp, iat } = jwt.decode(token);
  res.cookie(COOKIE_NAME, token, { ...cookieBase(), maxAge: (exp - iat) * 1000 });
}

export const clearAuthCookie = (res) => res.clearCookie(COOKIE_NAME, cookieBase());

// The user shape sent to the client. Never includes the password hash.
export function toAuthUser(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    roleId: user.roleId,
    roleName: user.role.name,
    isActive: user.isActive,
    permissions: [...user.role.permissions].sort(),
  };
}

export const findUserWithRole = (where) =>
  User.include("role", (r) => r.select("name", "permissions")).where(where).first();

// 401 unless the cookie holds a valid token for an existing, active user.
// User, role and permissions are loaded from the DB on every request.
export async function requireAuth(req, res, next) {
  const payload = verifyToken(req.cookies?.[COOKIE_NAME]);
  const id = payload && /^[1-9]\d{0,9}$/.test(payload.sub ?? "") ? Number(payload.sub) : null;
  const user = id && id <= 2147483647 ? await findUserWithRole({ id }) : null;
  if (!user || !user.isActive) throw new HttpError(401, "Not signed in");
  req.user = toAuthUser(user);
  next();
}

// 403 unless the signed-in user's role holds the permission. Use after requireAuth.
export const requirePermission = (key) => (req, res, next) => {
  if (!req.user.permissions.includes(key)) throw new HttpError(403, "Forbidden");
  next();
};
