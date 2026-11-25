# Login, permissions per role, and a polished UI — design and plan

**Date:** 2026-11-25 · **Status:** approved by the user ("go with 2": permissions per role) · Builds on `2026-11-25-role-user-crud-design.md` and `plans/2026-11-25-change-1-local-first.md` (local-first rules, self-cleaning tests, no docker commands by agents).

## Goal
Turn the Role/User CRUD into a full application: sign in with email + password, every API call protected, what a user can do is decided by the permissions ticked on their role, and a clean modern UI (light/dark, responsive).

## Non-goals
Self-registration, forgot-password email, social login, refresh tokens, multi-tenant, audit log.

## Decisions (my calls, recorded)
- **Session:** JWT (HS256) in an `httpOnly` cookie named `token`, `SameSite=Lax`, `Secure` only when `COOKIE_SECURE=true`, lifetime `JWT_EXPIRES_IN` (default `8h`). No token in localStorage. Browser calls use `withCredentials`. Local dev frontend (5173) and backend (4001) are same-site, so cookies work with CORS `credentials: true` and the exact-origin list (`CORS_ORIGINS`, never `*`).
- **Passwords:** `bcryptjs` (pure JS, no native build in alpine), cost 12, min 8 chars, max 72 bytes. Hash never leaves the server.
- **Login hardening:** one generic error for wrong email, wrong password, inactive user and user without password: 401 `Invalid email or password`. Rate limit `POST /auth/login` (`express-rate-limit`, 10 requests / minute / IP; configurable, disabled under test via env).
- **Packages (pin exact):** backend `jsonwebtoken`, `bcryptjs`, `cookie-parser`, `express-rate-limit`; frontend `react-router-dom` (have), `lucide-react` for icons. Nothing else without a reason.
- **Existing users have no password:** `users.password_hash` is nullable in the DB; such users cannot sign in until an admin sets a password (API requires a password on create). No data is lost by the migration.

## Permissions (fixed list, assigned per role)
Keys: `users.view`, `users.create`, `users.edit`, `users.delete`, `roles.view`, `roles.manage`.
Every signed-in user also gets the dashboard, their profile and change-password with no permission needed.
Seeded roles (set only when the role is created, never overwritten): **Admin** = all six; **Manager** = `users.view`, `users.create`, `users.edit`, `roles.view`; **Staff** = `users.view`.
Storage: `roles.permissions` (array of strings or equivalent supported by the Prisma 8 contract; backend engineer picks and documents). API shape is always `permissions: string[]`, validated against the fixed list, de-duplicated, sorted.
Safety rules: a user cannot delete themself (409 `You cannot delete your own account`) or deactivate themself (409 `You cannot deactivate your own account`); a role update/delete that would leave NO role holding `roles.manage` AND `users.edit` is rejected (409 `At least one role must keep roles.manage and users.edit`).

## API contract (base `/api`, JSON, camelCase, errors `{error:{message,details?}}`)
Auth
- `POST /auth/login` `{email,password}` → 200 `{user}` + cookie. 401 generic. 429 when rate limited.
- `POST /auth/logout` → 204, clears cookie (works even if not signed in).
- `GET /auth/me` → 200 `{user}` or 401.
- `POST /auth/change-password` `{currentPassword,newPassword}` → 204; 400 validation (`newPassword` min 8, details field), 401 not signed in, 400 field `currentPassword` `Current password is incorrect`.
- `user` object in auth responses: `{id, fullName, email, roleId, roleName, isActive, permissions: string[]}`.
- `GET /permissions` (any signed-in) → 200 `[{key, group:"users"|"roles", label}]` fixed order, used to render checkboxes.
- `GET /roles/options` (any signed-in) → 200 `[{id,name}]` sorted, used by the user form's role dropdown.

Existing resources, now protected (401 if no/invalid cookie, 403 `{error:{message:"Forbidden"}}` if signed in without the permission)
- Users: `GET /users`, `GET /users/:id` need `users.view`; `POST /users` needs `users.create` and body gains `password` (required); `PUT /users/:id` needs `users.edit` and body gains optional `password` (empty/absent = keep); `DELETE /users/:id` needs `users.delete`. User JSON never contains the hash; it gains nothing else new.
- Roles: `GET /roles`, `GET /roles/:id` need `roles.view`; `POST/PUT/DELETE` need `roles.manage`; role JSON and bodies gain `permissions: string[]`; list JSON also gains `userCount`.
- `GET /health` and `/live` stay public.
- Changing a user's role or active flag, or a role's permissions, takes effect on the next request (permissions are read from the DB on each request, not baked into the token; token carries only the user id).

Seed (`npm run db:seed`, idempotent): roles with permissions as above; one admin user from env `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` (role Admin) only if no user with that email exists; if either var is missing it skips the admin user and says so.
New env: `JWT_SECRET` (required, ≥32 chars, server refuses to start without it), `JWT_EXPIRES_IN`, `COOKIE_SECURE`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, optional `LOGIN_RATE_LIMIT_DISABLED`. Document in `.env.example` and README; add real values to the user's git-ignored root `.env` and `backend/.env` by APPENDING the missing keys only (random 48-byte hex secret, admin email `admin@example.com`, password chosen by the engineer and reported once in the report file, never printed in chat, never committed).

## UI
Login page; app shell with sidebar (collapsible on mobile), top bar with user menu (profile, theme toggle, logout); Dashboard (stat cards for what the user may view, recent users, own role + permission chips); Users (table, search box client-side, add/edit drawer or dialog with password field, role dropdown from `/roles/options`, status badge, delete confirm); Roles (cards or table with permission chips, add/edit dialog with permission checkboxes grouped Users/Roles, user count, delete confirm with the 409 message); Profile (details + change password); 403 and 404 pages. Buttons and nav items the user may not use are hidden; direct URL access shows the 403 page. 401 anywhere (except login/me) returns to /login and remembers the page to return to. Light + dark theme (system default, manual toggle, saved), design tokens as CSS variables, accessible (labels, focus rings, aria-live, reduced motion), works at 375/768/1440.
Design direction: calm, confident, modern admin (think Linear / Stripe dashboard): neutral surfaces, one accent colour, generous spacing, subtle depth, clear type scale, crisp tables, skeleton loaders, friendly empty states, toasts for success. The UI designer uses the skills `design-taste-frontend`, `impeccable`, `frontend-design:frontend-design`, `ui-ux-pro-max:ui-ux-pro-max`, then `web-design-guidelines` to review.

## Work split (agents)
1. **Backend engineer** (E:\DEV_DASH, backend/): contract + migration + seed, auth endpoints, permission middleware, protect/extend users and roles, self-cleaning tests (TDD), env/README. Test dummy data only, never touch real rows (rules in change-1 doc C2).
2. **Frontend engineer** (worktree E:\DEV_DASH_fe, frontend/): auth context, routing guards, axios `withCredentials` + 401 handling, all pages wired to the contract above (can build against mocks while the backend is in progress), unit tests, structure with token-based CSS ready for the designer.
3. **UI designer** (after 2, same worktree): visual system and polish using the design skills, screenshots at 3 widths in light and dark.
4. **Verifier** (after merge): api checks (401/403 matrix, login hardening, no hash leakage, safety rules, self-cleaning tests), UI pass, root e2e updated to sign in as the seeded admin.
Rules for all: never run docker commands; the user's `backend/.env` and root `.env` are theirs (append the new keys only); the user has an uncommitted formatting + `credentials: true` edit in `backend/src/app.js` that the backend engineer builds on and may commit with its own change.
