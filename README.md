# Role and User master CRUD

React (Vite) frontend, Express API, PostgreSQL. Data access uses Prisma ORM 8
(contract-first: `backend/src/prisma/contract.prisma`, migrations in `backend/migrations/`).

- Frontend: <http://localhost:5173> (dev) or <http://localhost:8080> (Docker)
- API: `PORT` (default 4000), under `/api`

## 1. Run locally against your own PostgreSQL

Prerequisites: Node 24, a running PostgreSQL 15+.

```sh
# 1. Create an empty database (name is up to you, "crud" below)
createdb crud

# 2. Backend
cd backend
npm install
# create backend/.env (git-ignored) with at least:
#   DATABASE_URL=postgres://USER:PASSWORD@localhost:5433/crud
#   PORT=4000                       # optional
npm run db:migrate                  # creates the tables
npm run db:seed                     # adds roles Admin, Manager, Staff (safe to repeat)
npm start                           # API on http://localhost:4000

# 3. Frontend (second terminal)
cd frontend
npm install
npm run dev                         # http://localhost:5173
```

In dev the frontend calls `VITE_API_URL` (committed `frontend/.env.development` points to
`http://localhost:4000/api`, which is why the API sends CORS headers for `CORS_ORIGINS`).
If your API runs on another port, put `VITE_API_URL=http://localhost:4001/api` in
`frontend/.env.development.local` (git-ignored).

API health:

| URL | Meaning |
|---|---|
| `GET /api/live` | 200 `{"status":"live"}` as soon as the process is up (no DB access) |
| `GET /api/health` | 200 `{"status":"ok"}`; 503 `{"status":"db-not-migrated"}` if the tables are missing (run `npm run db:migrate`); 503 `{"status":"db-down"}` if the database is unreachable |

The API starts even when the database is empty or down; it does not crash-loop. Only the
endpoints that need tables fail (with a generic 500) until you migrate.

## 2. Run the tests

```sh
cd backend && npm test      # API tests
cd frontend && npm test     # UI tests (mocked fetch, no database)
```

Backend tests use the **same database as `DATABASE_URL`** (it must already be migrated). They are
self-cleaning: every test creates its own dummy rows (role names `__test_<runId>_...`, emails
`...<runId>@test.invalid`), only asserts on those rows, and deletes exactly them afterwards
(users first, then roles). They never truncate or wipe tables, so your real data is untouched.
A guard fails the run if any dummy row is left over. (Auto-increment ids do advance, so you may see
gaps in ids.)

Optional end-to-end smoke test (needs the Docker stack from section 3 running on port 8080):
`npm install && npx playwright test` in the repo root. It removes the data it creates.

## 3. Run with Docker

```sh
cp .env.example .env                # first time only
docker compose up -d --build        # db, api, web

# The container does NOT migrate or seed by itself. Run once, then after schema changes:
docker compose exec api npm run db:migrate
docker compose exec api npm run db:seed

# open http://localhost:8080
```

Other commands:

```sh
docker compose logs -f api          # follow API logs
docker compose stop                 # stop, keep data
docker compose start                # start again
docker compose down                 # remove containers, keep data (volume pgdata)
docker compose down -v              # remove containers AND all data (then migrate/seed again)
```

The compose `api` healthcheck uses `/api/live`, so the stack looks healthy before you migrate.
The web container proxies `/api` to the api container, so no CORS is involved at port 8080.

## Docker: development (bind mounts, nodemon, hot reload)

Your source folders are mounted into the containers: edit files on your PC and the containers
pick the change up without a rebuild (backend restarts through nodemon, frontend hot-reloads
through Vite). Uses `docker-compose.dev.yml` on top of the normal `docker-compose.yml`.

```sh
# first run (builds the dev images, starts db + api + web)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# once, and after schema changes: create tables and seed roles
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run db:migrate
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run db:seed
```

- UI: <http://localhost:5173> (Vite dev server, calls the API at `http://localhost:4000/api`)
- API: <http://localhost:4000>
- Logs: `docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f api web`
- Stop and remove containers (data kept): `docker compose -f docker-compose.yml -f docker-compose.dev.yml down`
- Also wipe the database: add `-v` to the `down` command
- Run only one setup at a time: `down` the production-like stack before starting the dev one
  (and vice versa), because both use the same container names and port 4000.

**When do I need a rebuild?** Only when `package.json`, `package-lock.json` or a Dockerfile
changes. Then run the `up -d --build` command again with `-V` (`up -d --build -V`) so the
containers get fresh `node_modules` (they live in anonymous volumes, so the folders on your PC
never overwrite them). Source edits never need a rebuild.

**After editing `backend/src/prisma/contract.prisma`:** run these inside the api container,
then restart is automatic:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run contract:emit
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npx prisma migration plan --name <short_name>
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run db:migrate
```

(The generated files land in `backend/` on your PC through the bind mount; commit them.)

**File watching on Windows:** file-change events from Windows folders do not reach Linux
containers, so the dev setup uses polling (`legacyWatch` in `backend/nodemon.json`,
`VITE_USE_POLLING=true` for Vite). A change can take a second or so to show up; this is normal.

Production mode (`docker compose up -d --build`, section 3) is unchanged.

Tip: to shorten the commands, set `COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml`
(use `;` instead of `:` in Windows PowerShell/cmd) and then just run `docker compose up -d --build`.
Unset it to get the production-like setup again.

## 4. Environment variables

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | backend, prisma CLI | none (required) | PostgreSQL connection string. Docker: `postgres://root:password@db:5432/crud` |
| `PORT` | backend | `4000` | API listen port |
| `CORS_ORIGINS` | backend | `http://localhost:5173,http://localhost:8080` | Comma-separated browser origins allowed to call the API |
| `VITE_API_URL` | frontend (build time) | `/api` | API base URL the browser uses. Rebuild the frontend after changing it |
| `API_PROXY_TARGET` | frontend dev server | `http://localhost:4000` | Target of the Vite `/api` proxy when `VITE_API_URL` is `/api` |
| `DB_HOST_PORT` | docker compose | `5434` | Host port of the Docker db, for PC tools such as pgAdmin (`localhost:5434`). Containers use `db:5432`. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | db container | `root` / `password` / `crud` | Database created on first start of the db container |

Real values live in git-ignored `.env` files (`.env` in the repo root for Docker, `backend/.env`
for local runs, `frontend/.env*.local`). Commit only the `.env.example` files.
