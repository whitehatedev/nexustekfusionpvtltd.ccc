import fs from 'node:fs/promises';
import path from 'node:path';
import { createPool } from './index.ts';

let customerMgmtSqlEnsured = false;
let publicSyncEnsured = false;
let lastPublicSyncAttemptAt = 0;
let lastPublicSyncError: string | null = null;

export function getCustomerSchemaBootstrapError(): string | null {
  return lastPublicSyncError;
}

async function runPublicCustomersSyncSql(): Promise<void> {
  const pool = createPool();
  if (!pool) return;
  try {
    const publicSyncPath = path.resolve(process.cwd(), 'supabase/public_customers_sync.sql');
    const publicSyncSql = await fs.readFile(publicSyncPath, 'utf8');
    await pool.query(publicSyncSql);
    publicSyncEnsured = true;
    lastPublicSyncError = null;
  } catch (err) {
    publicSyncEnsured = false;
    lastPublicSyncError = (err as Error).message || 'Failed to apply supabase/public_customers_sync.sql';
    console.warn('Public customers SQL bootstrap note:', lastPublicSyncError);
  }
}

export async function ensureCustomerManagementSchema(forceRetry = false): Promise<void> {
  const pool = createPool();
  if (!pool) {
    customerMgmtSqlEnsured = true;
    publicSyncEnsured = true;
    lastPublicSyncError = null;
    return;
  }

  if (!customerMgmtSqlEnsured || forceRetry) {
    try {
      await pool.query(`
        ALTER TABLE IF EXISTS public.customer_profiles
          ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
          ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '',
          ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
          ADD COLUMN IF NOT EXISTS company_or_college text NOT NULL DEFAULT '',
          ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'customer',
          ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz,
          ADD COLUMN IF NOT EXISTS phone_confirmed_at timestamptz,
          ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
          ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
      `).catch(() => {});
      const sqlPath = path.resolve(process.cwd(), 'supabase/customer_management_table.sql');
      const sqlText = await fs.readFile(sqlPath, 'utf8');
      await pool.query(sqlText);
      const otpMigrationPath = path.resolve(process.cwd(), 'supabase/customer_otp_rbac_migration.sql');
      const otpMigrationSql = await fs.readFile(otpMigrationPath, 'utf8');
      await pool.query(otpMigrationSql);
      const portalMigrationPath = path.resolve(process.cwd(), 'supabase/customer_portal_complete_migration.sql');
      const portalMigrationSql = await fs.readFile(portalMigrationPath, 'utf8').catch(() => '');
      if (portalMigrationSql) {
        await pool.query(portalMigrationSql).catch(() => {});
      }
      const passwordlessOtpSqlPath = path.resolve(process.cwd(), 'supabase/passwordless_otp_customer_system.sql');
      const passwordlessOtpSql = await fs.readFile(passwordlessOtpSqlPath, 'utf8').catch(() => '');
      if (passwordlessOtpSql) {
        await pool.query(passwordlessOtpSql).catch(() => {});
      }
      const adminUpgradeSqlPath = path.resolve(process.cwd(), 'supabase/admin_complete_data_access_upgrade.sql');
      const adminUpgradeSql = await fs.readFile(adminUpgradeSqlPath, 'utf8').catch(() => '');
      if (adminUpgradeSql) {
        await pool.query(adminUpgradeSql).catch(() => {});
      }
      const cloudSingleSourceSqlPath = path.resolve(
        process.cwd(),
        'supabase/nexustekfusion_cloud_single_source_migration.sql'
      );
      const cloudSingleSourceSql = await fs.readFile(cloudSingleSourceSqlPath, 'utf8').catch(() => '');
      if (cloudSingleSourceSql) {
        await pool.query(cloudSingleSourceSql).catch((err) => {
          console.warn('Cloud single-source SQL migration note:', (err as Error).message);
        });
      }
      await pool.query(`
        ALTER TABLE IF EXISTS web_platform.admin_sessions
          ADD COLUMN IF NOT EXISTS session_scope text NOT NULL DEFAULT 'customer';
      `).catch(() => {});
      customerMgmtSqlEnsured = true;
    } catch (err) {
      console.warn('Customer management DDL bootstrap warning:', (err as Error).message);
    }
  }

  const now = Date.now();
  if (forceRetry || (!publicSyncEnsured && now - lastPublicSyncAttemptAt >= 15_000)) {
    lastPublicSyncAttemptAt = now;
    await runPublicCustomersSyncSql();
  }
}
