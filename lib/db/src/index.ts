import { drizzle } from "drizzle-orm/node-postgres";
import { attachDatabasePool } from "@vercel/functions";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 5_000,
  max: 10,
});

// Lets Vercel suspend functions safely without leaving idle PostgreSQL
// connections behind, while keeping the local long-running server unchanged.
if (process.env.VERCEL) attachDatabasePool(pool);

export const db = drizzle(pool, { schema });

export * from "./schema";
