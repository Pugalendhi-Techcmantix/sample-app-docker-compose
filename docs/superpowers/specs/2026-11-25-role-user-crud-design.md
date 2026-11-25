# Role & User Master CRUD — Design

**Date:** 2026-11-25
**Status:** Draft, awaiting user review

## Intent
A simple CRUD application for two master tables, **Roles** and **Users**. Each user has exactly one role. It runs only on the local machine, and one `docker compose up` starts it.

## Goals
- Create, list, view, edit and delete Roles.
- Create, list, view, edit and delete Users, with each user assigned to one role.
- React (Vite) UI, Node.js (Express) REST API and PostgreSQL, each in its own container.
- Data survives container restarts (named volume).

## Non-goals
- Login, passwords, permissions. A role here is master data only and is never enforced.
- Cloud deployment, CI/CD, HTTPS, Kubernetes.
- Pagination, search and sorting. Lists are expected to stay small.

## Anti-goals (would be a failure even if it works)
- Deleting a role that users still use, which would orphan those users.
- Two users with the same email, or two roles with the same name (case-insensitive).
- Raw database errors or stack traces shown in the UI.

## Approach (my call; you said "simple")
Use a monorepo with `backend/`, `frontend/` and `docker-compose.yml`.

- **Backend:** Express with **Prisma ORM 8** (the user chose it) on PostgreSQL. `schema.prisma` defines the models, Prisma Migrate manages schema changes, and `zod` validates input.
  - Rejected alternatives: plain SQL with `pg` (the user chose Prisma instead), and NestJS (too much structure for this size).
- **Frontend:** a React + Vite SPA with React Router and plain `fetch`, built and served by nginx, which also proxies `/api` to the backend. Because of the proxy there is a single URL and no CORS setup.
- **Language:** JavaScript (ESM) everywhere, to keep it simple.

## Data model
```
roles
  id           integer identity PK
  name         varchar(50)  NOT NULL, unique (case-insensitive)
  description  varchar(255) NULL
  created_at   timestamptz  NOT NULL default now()
  updated_at   timestamptz  NOT NULL default now()

users
  id           integer identity PK
  full_name    varchar(100) NOT NULL
  email        varchar(255) NOT NULL, unique (case-insensitive)
  role_id      integer NOT NULL  FK -> roles(id) ON DELETE RESTRICT
  is_active    boolean NOT NULL default true
  created_at   timestamptz NOT NULL default now()
  updated_at   timestamptz NOT NULL default now()
```
Prisma models are `Role` and `User`, mapped with `@@map` to the `roles` and `users` tables and with `@map` to the snake_case columns.
- Email is stored lowercased and uses a plain `@unique`.
- Role names keep the case they were typed in. To make them unique regardless of case, a hand-added unique index on `lower(name)` goes into the first migration's SQL, and the API also checks for a case-insensitive duplicate before writing.

Seed roles (Prisma seed script): `Admin`, `Manager`, `Staff`.

## API (base `/api`)
| Method | Path | Result |
|---|---|---|
| GET | /health | 200 `{status:"ok"}` (checks DB) |
| GET | /roles | 200 list, ordered by name |
| GET | /roles/:id | 200 / 404 |
| POST | /roles | 201 created / 400 / 409 duplicate name |
| PUT | /roles/:id | 200 / 400 / 404 / 409 |
| DELETE | /roles/:id | 204 / 404 / 409 "role is assigned to N users" |
| GET | /users | 200 list with `roleName`, ordered by full name |
| GET | /users/:id | 200 / 404 |
| POST | /users | 201 / 400 / 409 duplicate email / 400 unknown roleId |
| PUT | /users/:id | 200 / 400 / 404 / 409 |
| DELETE | /users/:id | 204 / 404 |

Error body: `{ "error": { "message": string, "details"?: [{ "field": string, "message": string }] } }`
JSON uses camelCase (`fullName`, `roleId`, `isActive`, `createdAt`).

## Local deployment (Docker Compose)
| Service | Image | Host port |
|---|---|---|
| db | postgres:17-alpine, healthcheck, volume `pgdata` | 5433 → 5432 |
| api | built from `backend/Dockerfile` (node:24-alpine) | 4000 |
| web | built from `frontend/Dockerfile` (Vite build → nginx:alpine) | **8080** (open http://localhost:8080) |

The API container runs `prisma migrate deploy` and the seed on startup, before it starts the server. Secrets live in `.env`, which is git-ignored; `.env.example` is committed.

## Left to the builder
Styling details (clean, plain CSS, responsive at 375/768/1440), and exact component breakdown.
