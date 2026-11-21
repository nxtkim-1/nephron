import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { env } from "~/env";
import * as schema from "./schema";

// Connect to Neon Postgres over HTTP using the serverless driver.
const sql = neon(env.DATABASE_URL);

// Export the typed Drizzle database client.
export const db = drizzle(sql, { schema });
