/**
 * S1 de ADR-114 v1.3 §9 contra PostgreSQL real: el cambio del ajuste y su fila de auditoría
 * van en una sola transacción con la fila bloqueada (`SELECT … FOR UPDATE`).
 *
 * - Si la auditoría falla, el ajuste no cambia y no queda fila de auditoría.
 * - Dos escrituras concurrentes dejan dos filas cuyo «anterior» y «nuevo» encadenan.
 *
 * Escribe en `public.platform_branding_settings` de la base `test` y restaura el valor previo.
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test pnpm --filter @iwana/api exec jest \
 *     --config jest.integration.config.js platform-access-settings
 */
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  PlatformAuditLog,
  PlatformBrandingSettings,
  resolveMigrationDbCredentials,
} from '@iwana/db';
import { AuditAction, PlatformRole } from '@iwana/shared';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAccessSettingsService } from './platform-access-settings.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const baseDatabase = process.env['IWANA_IT_BASE_DB_NAME'] ?? process.env['DB_NAME'] ?? '';

if (dbAvailable && baseDatabase !== 'test') {
  throw new Error('Integración platform-access-settings exige DB_NAME=test.');
}

type AuditRow = {
  action: string;
  old_value: { grantedRoles: string[] };
  new_value: { grantedRoles: string[] };
};

describeWithDb(
  'PlatformAccessSettingsService — transacción con auditoría (PostgreSQL real)',
  () => {
    let dataSource: DataSource;
    let audit: PlatformAuditService;
    let service: PlatformAccessSettingsService;
    let original: string[] | null = null;
    const actors: string[] = [];

    const readRoles = async (): Promise<string[]> => {
      const rows = (await dataSource.query(
        `SELECT tenant_usage_viewer_roles AS roles FROM public.platform_branding_settings WHERE id = 'platform'`,
      )) as Array<{ roles: string[] }>;
      return rows[0]?.roles ?? [];
    };
    const actor = () => {
      const userId = randomUUID();
      actors.push(userId);
      return { userId, ipAddress: '10.0.0.7' };
    };

    beforeAll(async () => {
      const credentials = resolveMigrationDbCredentials();
      dataSource = new DataSource({
        type: 'postgres',
        host: process.env['DB_HOST'] ?? 'localhost',
        port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
        username: credentials.username,
        password: credentials.password,
        database: process.env['DB_NAME'] ?? 'test',
        entities: [PlatformAuditLog, PlatformBrandingSettings],
        synchronize: false,
        logging: false,
        extra: { max: 4 },
      });
      await dataSource.initialize();
      audit = new PlatformAuditService(dataSource, undefined as never);
      service = new PlatformAccessSettingsService(
        dataSource.getRepository(PlatformBrandingSettings),
        audit,
      );
      const rows = (await dataSource.query(
        `SELECT tenant_usage_viewer_roles AS roles FROM public.platform_branding_settings WHERE id = 'platform'`,
      )) as Array<{ roles: string[] }>;
      original = rows[0]?.roles ?? null;
    });

    afterEach(() => jest.restoreAllMocks());

    afterAll(async () => {
      if (original !== null) {
        await dataSource.query(
          `UPDATE public.platform_branding_settings SET tenant_usage_viewer_roles = $1::text[] WHERE id = 'platform'`,
          [original],
        );
      }
      // `platform_audit_logs` es de solo escritura (trigger): las filas de actores aleatorios
      // quedan en `test`, como en las demás integraciones que auditan fuera de transacción.
      await dataSource.destroy();
    });

    it('si la auditoría falla, el ajuste no cambia y no queda fila', async () => {
      await service.setTenantUsageGrantedRoles([], actor());
      jest.spyOn(audit, 'logWithin').mockRejectedValueOnce(new Error('auditoría caída'));
      const who = actor();
      await expect(
        service.setTenantUsageGrantedRoles([PlatformRole.IWANA_SUPPORT], who),
      ).rejects.toThrow('auditoría caída');
      expect(await readRoles()).toEqual([]);
      const rows = (await dataSource.query(
        `SELECT 1 FROM public.platform_audit_logs WHERE user_id = $1`,
        [who.userId],
      )) as unknown[];
      expect(rows).toHaveLength(0);
    });

    it('dos escrituras concurrentes dejan dos filas cuyo anterior y nuevo encadenan', async () => {
      await service.setTenantUsageGrantedRoles([], actor());
      const a = actor();
      const b = actor();
      await Promise.all([
        service.setTenantUsageGrantedRoles([PlatformRole.IWANA_SUPPORT], a),
        service.setTenantUsageGrantedRoles([], b),
      ]);
      const rows = (await dataSource.query(
        `SELECT action, old_value, new_value
         FROM public.platform_audit_logs
        WHERE user_id = ANY($1::uuid[]) AND entity_type = 'TenantUsageVisibility'`,
        [[a.userId, b.userId]],
      )) as AuditRow[];
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.action === AuditAction.UPDATE)).toBe(true);
      // Una partió del valor inicial ([]); la otra, de lo que dejó la primera.
      const [x, y] = rows as [AuditRow, AuditRow];
      const startsChain = (first: AuditRow, second: AuditRow) =>
        first.old_value.grantedRoles.length === 0 &&
        JSON.stringify(second.old_value) === JSON.stringify(first.new_value);
      const xFirst = startsChain(x, y);
      expect(xFirst || startsChain(y, x)).toBe(true);
      // El valor guardado es el «nuevo» de la última en entrar.
      expect(await readRoles()).toEqual((xFirst ? y : x).new_value.grantedRoles);
    });
  },
);
