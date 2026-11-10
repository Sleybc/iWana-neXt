import { randomUUID } from 'crypto';
import { Pool } from 'pg';

export async function recordTestPurgeEvidence(tenantId: string): Promise<() => Promise<void>> {
  if (
    process.env.DB_NAME !== 'test' ||
    !process.env.DB_BOOTSTRAP_USER ||
    !process.env.DB_BOOTSTRAP_PASSWORD
  ) {
    throw new Error('[BLOCKED] La constancia sintética requiere DB_NAME=test y DB_BOOTSTRAP_*.');
  }

  const bootstrap = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_BOOTSTRAP_USER,
    password: process.env.DB_BOOTSTRAP_PASSWORD,
    max: 1,
  });
  try {
    await bootstrap.query(
      `SELECT public.iwana_record_tenant_purge_evidence(
         $1, (SELECT deleted_at FROM public.tenants WHERE id = $1), 'ISP_WRITTEN_INSTRUCTION', $2, $3
       )`,
      [tenantId, randomUUID(), 'b'.repeat(64)],
    );
  } catch (error) {
    await bootstrap.end();
    throw error;
  }
  return async () => {
    try {
      await bootstrap.query('DELETE FROM public.tenant_purge_evidence WHERE tenant_id = $1', [
        tenantId,
      ]);
    } finally {
      await bootstrap.end();
    }
  };
}
