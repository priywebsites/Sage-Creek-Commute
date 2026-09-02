# Sage Creek Commute

A mobile-first Sage Creek to U of M commute questionnaire with database-backed responses and a private validation dashboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required secret: `ADMIN_PASSWORD` — password for the private `/admin` results dashboard

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/sage-creek-commute` — public landing page, one-URL questionnaire, success state, and `/admin` dashboard
- `artifacts/api-server/src/routes/commute.ts` — validated submissions, anonymous events, summaries, raw responses, and CSV export
- `lib/db/src/schema/commute.ts` — response and event tables
- `lib/api-spec/openapi.yaml` — source of truth for generated API hooks and server schemas

## Architecture decisions

- Questionnaire responses store weekday schedules as JSONB on one response record so the submission remains atomic while the API stays simple.
- Admin access is protected server-side with the `ADMIN_PASSWORD` secret; the browser never receives or stores response data before unlocking.
- Time choices are generated in the UI at 30-minute intervals and checked again server-side before persistence.

## Product

- Explains the Sage Creek ↔ U of M recurring-ride concept without claiming matches already exist.
- Collects role, qualification, weekday schedule, flexibility, economics, objections, intent, and contact information.
- Shows grouped schedule/economics/reliability signals, potential overlap buckets, searchable responses, and CSV export to the private admin.

## User preferences

- Keep the experience consumer-facing rather than survey-like; avoid stock photography, fake numbers, fake testimonials, and customer-facing “pilot” language.

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`.
- Public submissions require both a five-day schedule payload and at least one contact method.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
