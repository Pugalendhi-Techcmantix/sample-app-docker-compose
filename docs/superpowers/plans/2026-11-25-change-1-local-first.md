# Change Request 1 — local-first run, self-cleaning tests, manual migrate/seed in Docker

Requested by the user after they ran the app locally against their own PostgreSQL (localhost:5433, user `root`, no password, DB `crud`). These changes override the earlier plan/spec where they conflict.

## C1. Backend URL configurable from the frontend env
- Frontend reads `import.meta.env.VITE_API_URL`; default `/api` (same-origin through the Vite proxy in dev and the nginx proxy in Docker).
- `frontend/.env.example` (committed) documents it; `frontend/.env.development` (committed) sets `VITE_API_URL=http://localhost:4000/api` for local dev. `frontend/.env*.local` stays git-ignored.
- Because the browser can then call the backend on another origin, the backend needs CORS: use the `cors` package (pinned), allowed origins from env `CORS_ORIGINS` (comma-separated, default `http://localhost:5173,http://localhost:8080`), methods GET/POST/PUT/DELETE, JSON content type. Disallowed origins get no CORS headers (not an error).
- Vite is build-time: the frontend Dockerfile takes `ARG VITE_API_URL` (default `/api`) and exports it before `npm run build`. Compose `web` passes `args: VITE_API_URL: ${VITE_API_URL:-/api}`. The nginx `/api` proxy stays so the default Docker setup keeps working at http://localhost:8080.
- The vite dev proxy remains as a fallback (used when `VITE_API_URL` is unset/`/api`); its target comes from `API_PROXY_TARGET` (default `http://localhost:4000`).

## C2. Tests: no separate test database, dummy data only, cleaned up after
- Remove `TEST_DATABASE_URL` everywhere (`.env`, `.env.example`, `test/globalSetup.js`, `vitest.config.js`, docs) and remove the `crud_test` DB creation (`db/init/01-create-test-db.sql` and its compose mount). `npm test` runs against the SAME database as `DATABASE_URL` (the tables must already exist: migrate is manual).
- **Tests must never touch real data.** No `TRUNCATE`, no `deleteMany({})`, no `resetDb()` that wipes tables. Every test creates its own dummy rows with a unique per-run marker (e.g. role names `__test_<runId>_...`, user emails `<...>@test.invalid`), asserts only on rows it created (list assertions filter to its own marker; never assume the table is empty or has a given count), and deletes exactly those rows in `afterEach`/`afterAll` (users first, then roles). Cleanup must run even when a test fails.
- Prove it: after `npm test` run twice, the roles/users rows that existed before (e.g. the 3 seeded roles and any user-entered data) are unchanged and no `__test_`/`@test.invalid` rows remain. Add a guard test or `afterAll` assertion that fails loudly if leftover dummy rows remain.
- Frontend tests already use mocks; leave them. The root e2e (`e2e/smoke.spec.js`) needs the running Docker stack: keep it, but make sure it already cleans its own data (it does) and document that it is optional.

## C3. Docker: no automatic migrate or seed
- `backend/docker-entrypoint.sh` (or the Dockerfile CMD) only starts the server. No `prisma db migrate`, no seed on container start.
- The user runs them manually in the running api container:
  - `docker compose exec api npm run db:migrate`
  - `docker compose exec api npm run db:seed`
  The image must therefore contain the prisma CLI, `prisma.config.ts`, the contract + `migrations/`, `prisma/seed.js` and the npm scripts. Verify by reading the Dockerfile (do NOT run docker; see rules).
- If the tables do not exist yet the API should still start and `/api/health` should report the DB state clearly rather than crash-loop (health may return 503 with `{status:"db-not-migrated"|"db-down"}` while the process stays up). Decide minimal behaviour and document it in the README.
- Compose `api` healthcheck must not make the stack look broken before the user migrates: use a liveness-style check that only needs the process (e.g. a `/api/live` endpoint returning 200), keep `/api/health` as the DB-aware check.

## C4. README.md (root)
Step-by-step for (a) local run against the user's own PostgreSQL (create DB, `npm install`, `npm run db:migrate`, `npm run db:seed`, `npm start`; frontend `npm install`, `npm run dev`), (b) running tests (`npm test`, self-cleaning), (c) Docker: `docker compose up -d --build`, then the two manual exec commands, then open http://localhost:8080, plus stop / wipe commands, (d) env variable table (`DATABASE_URL`, `PORT`, `CORS_ORIGINS`, `VITE_API_URL`, `API_PROXY_TARGET`, `DB_HOST_PORT`, `POSTGRES_*`).

## Rules for every engineer on this change
- **Never run any `docker` / `docker compose` command.** The user runs Docker themselves. Verify Docker-related changes by careful reading only.
- Running `npm` commands is fine. `npm test` in backend hits the user's local PostgreSQL (`DATABASE_URL`, localhost:5433, DB `crud`) and MUST be self-cleaning as above, so write the cleanup carefully before the first run.
- Never write real credentials anywhere; `.env` stays git-ignored.
