# Sage Creek Commute

Sage Creek Commute is a mobile-first questionnaire and validation dashboard for
students travelling between Sage Creek and the University of Manitoba. The
repository is a pnpm/TypeScript monorepo with a Vite React frontend, an Express
API, and PostgreSQL persistence through Drizzle ORM.

## Repository layout

- `artifacts/sage-creek-commute` — landing page, questionnaire, success state,
  and private `/admin` dashboard.
- `artifacts/api-server` — Express API for validated responses, analytics,
  dashboard data, poster QR codes, and CSV exports.
- `lib/db` — PostgreSQL schema and versioned Drizzle migrations.
- `lib/api-spec` — OpenAPI source used to generate server validation and React
  query clients.
- `api/index.ts` — serverless Express entry point used by Vercel.

## Requirements

- Node.js 24
- pnpm 10.17.1 (the version is pinned in `package.json` and the committed
  `pnpm-lock.yaml` is the package-manager source of truth)
- A hosted PostgreSQL database with a pooled connection URL

Copy `.env.example` to `.env` and replace every placeholder. Never commit the
resulting `.env` file.

## Local development

Install dependencies and apply the database migrations:

```sh
pnpm install --frozen-lockfile
pnpm run db:migrate
```

Run the API and frontend in separate terminals:

```sh
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/sage-creek-commute run dev
```

The frontend defaults to `http://localhost:5173` and proxies `/api` requests to
`http://127.0.0.1:5000`. Set `API_PROXY_TARGET` only if the local API runs
somewhere else.

## Verification

```sh
pnpm run typecheck
pnpm run build
```

No automated test suite or lint script is currently configured. The production
build performs the full workspace TypeScript check before compiling the API and
frontend.

After changing `lib/api-spec/openapi.yaml`, regenerate API code with:

```sh
pnpm --filter @workspace/api-spec run codegen
```

After changing a Drizzle table, create and review a migration with:

```sh
pnpm run db:generate
```

Use `pnpm --filter @workspace/db run push` only for disposable development
databases. Production databases should use committed migrations via
`pnpm run db:migrate`.

## Environment variables

| Variable | Production | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Required | Pooled PostgreSQL URL, including SSL options required by the provider. |
| `ADMIN_PASSWORD` | Required | Long, unique secret for the `/admin` dashboard. |
| `PUBLIC_APP_URL` | Required | Canonical deployment origin used in downloadable poster QR codes. |
| `LOG_LEVEL` | Optional | Pino log level; defaults to `info`. |
| `PORT` | Local only | Local Express port; defaults to `5000`. Vercel supplies this automatically. |
| `API_PROXY_TARGET` | Local only | Vite development proxy target; defaults to `http://127.0.0.1:5000`. |

## Deploy to Vercel

1. Provision PostgreSQL through the Vercel Marketplace or another hosted
   provider. Use its pooled connection string for `DATABASE_URL` and require
   TLS/SSL.
2. From a trusted local environment, set `DATABASE_URL` to that production URL
   and run `pnpm run db:migrate` once before the first deployment. Run it again
   whenever a future commit adds migrations.
3. Import this GitHub repository into Vercel and leave the project Root
   Directory at the repository root.
4. Vercel reads `vercel.json`, detects pnpm from `pnpm-lock.yaml`, runs
   `pnpm run build`, publishes `artifacts/sage-creek-commute/dist/public`, and
   routes `/api/*` to the Express serverless function.
5. Add `DATABASE_URL`, `ADMIN_PASSWORD`, and `PUBLIC_APP_URL` in Vercel Project
   Settings → Environment Variables. Add them to Production and Preview only
   where the database and canonical URL are appropriate.
6. Deploy, then verify `/`, `/questionnaire`, `/admin`, `/api/healthz`, a test
   questionnaire submission, admin summary/export, and each poster QR download.

The app does not write application data to the local filesystem and does not
require a persistent server process in production.

## Existing database data

The audited repository does not contain Prisma configuration, a SQLite database,
or a database dump. Its checked-in data layer already targets PostgreSQL. The
migration in `lib/db/drizzle` creates the same three tables for a new hosted
database, but it cannot copy records that exist only in the former Replit
database. If those records need to be retained, export them from the old
PostgreSQL service with `pg_dump` and import them into the new provider before
switching production traffic.
