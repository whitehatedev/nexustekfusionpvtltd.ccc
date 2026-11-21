import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
const sqlHost = process.env.SQL_HOST;
const sqlDbName = process.env.SQL_DB_NAME;
const user = process.env.SQL_ADMIN_USER;
const password = process.env.SQL_ADMIN_PASSWORD;

if (!databaseUrl && (!sqlHost || !sqlDbName || !user || !password)) {
  throw new Error(
    'Set DATABASE_URL (e.g. Supabase PostgreSQL URI) or SQL_HOST, SQL_DB_NAME, SQL_ADMIN_USER, and SQL_ADMIN_PASSWORD.'
  );
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['web_platform'],
  dbCredentials: databaseUrl
    ? {
        url: databaseUrl,
      }
    : {
        host: sqlHost!,
        user: user!,
        password: password!,
        database: sqlDbName!,
        ssl: false,
      },
  verbose: true,
});
