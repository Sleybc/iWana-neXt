/**
 * F2-D2 — «Activas al cierre» reconstruye el mes de la activación cuando el aprovisionador del
 * worker la audita (PostgreSQL real, base `test`).
 *
 * La fila de activación se arma con `buildTenantStatusTransitionAudit` de `@iwana/db`, el mismo
 * constructor que usa `tenant-provisioning.processor.ts`, y se fecha en un mes ya cerrado. La
 * prueba del worker (`tenant-provisioning.audit.integration.spec.ts`) comprueba que el
 * aprovisionador la escribe. Aquí se comprueba que la lectura del módulo audit
 * (`listEntityStatusEvents`) y la reconstrucción (`reconstructActiveAtClose`) la usan. Sin ella,
 * el mes queda en `null` (estado desconocido).
 *
 * Solo se evalúa la empresa propia: la base `test` tiene empresas sin historia que dejan en `null`
 * los meses del resumen global.
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test pnpm --filter @iwana/api exec jest \
 *     --config jest.integration.config.js tenant-active-at-close.activation
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { buildTenantStatusTransitionAudit, resolveMigrationDbCredentials } from '@iwana/db';
import { TenantStatus } from '@iwana/shared';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { TENANT_STATUS_EVENT_ACTIONS, reconstructActiveAtClose } from './tenant-active-at-close';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const RUN = randomBytes(4).toString('hex');
const MONTHS = 6 as const;

/** Día 10 a mediodía (Bogotá, UTC-5) de hace `back` meses. */
function bogotaMidMonth(now: Date, back: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 10, 17));
}

describeWithDb('Activas al cierre — activación auditada por el aprovisionador', () => {
  let dataSource: DataSource;
  let audit: PlatformAuditService;
  const tenantId = randomUUID();
  const now = new Date();
  const createdAt = bogotaMidMonth(now, 2);
  const activatedAt = new Date(createdAt.getTime() + 5 * 60_000);

  async function activeAtCloseForTenant(): Promise<Array<number | null>> {
    const lifecycle = await audit.countEntityLifecycleByMonth('Tenant', now, MONTHS);
    const events = (
      await audit.listEntityStatusEvents('Tenant', TENANT_STATUS_EVENT_ACTIONS, now, MONTHS)
    ).filter((event) => event.entityId === tenantId);
    return reconstructActiveAtClose({
      months: lifecycle.map((month) => month.month),
      events,
      tenants: [{ id: tenantId, status: TenantStatus.ACTIVE, createdAt }],
      currentActive: 1,
    });
  }

  beforeAll(async () => {
    if (process.env['DB_NAME'] !== 'test') {
      throw new Error('[BLOCKED] Solo corre con DB_NAME=test.');
    }
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: 'test',
      entities: [],
      synchronize: false,
      logging: false,
      extra: { max: 2 },
    });
    await dataSource.initialize();
    audit = new PlatformAuditService(dataSource, undefined as never);

    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email, created_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', 'activas@example.invalid', $5)`,
      [tenantId, `Activas ${RUN}`, `active-close-${RUN}`, `tenant_active_close_${RUN}`, createdAt],
    );
    // Alta como la deja el interceptor del API: CREATE con la empresa en PROVISIONING.
    await dataSource.query(
      `INSERT INTO public.platform_audit_logs
         (user_id, action, entity_type, entity_id, old_value, new_value, request_id, created_at)
       VALUES (NULL, 'CREATE', 'Tenant', $1, NULL, $2::jsonb, NULL, $3)`,
      [tenantId, JSON.stringify({ id: tenantId, status: 'PROVISIONING' }), createdAt],
    );
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    await dataSource.destroy();
  });

  it('sin la fila de activación el mes del alta queda desconocido (null)', async () => {
    const series = await activeAtCloseForTenant();
    // Meses: [-5 … -1, actual]; el alta fue en -2.
    expect(series.slice(MONTHS - 3, MONTHS - 1)).toEqual([null, null]);
  });

  it('con la fila del aprovisionador el mes del alta y el siguiente cuentan la empresa', async () => {
    const row = buildTenantStatusTransitionAudit(tenantId, 'PROVISIONING', 'ACTIVE');
    await dataSource.query(
      `INSERT INTO public.platform_audit_logs
         (user_id, action, entity_type, entity_id, old_value, new_value, request_id, created_at)
       VALUES (NULL, $1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
      [
        row.action,
        row.entityType,
        row.entityId,
        JSON.stringify(row.oldValue),
        JSON.stringify(row.newValue),
        row.requestId,
        activatedAt,
      ],
    );

    const series = await activeAtCloseForTenant();
    expect(series.slice(0, MONTHS - 3)).toEqual([0, 0, 0]);
    expect(series.slice(MONTHS - 3)).toEqual([1, 1, 1]);
  });
});
