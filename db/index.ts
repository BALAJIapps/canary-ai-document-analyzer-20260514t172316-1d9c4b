/**
 * Database client.
 *
 * Uses the node-postgres (`pg`) driver via `drizzle-orm/node-postgres`.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : false,
});

export const db = drizzle(pool, { schema });

export type DB = typeof db;
