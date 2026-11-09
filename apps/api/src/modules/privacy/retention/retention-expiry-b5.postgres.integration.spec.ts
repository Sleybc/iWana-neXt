import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { TenantContext, resolveMigrationDbCredentials, runInTenantSchema } from '@iwana/db';
import { CrmContractStandingReadAdapter } from '../../crm/privacy-adapters/crm-contract-standing-read.adapter';
import { CrmPersonalDataErasureAdapter } from '../../crm/privacy-adapters/crm-personal-data-erasure.adapter';
import { CrmTitularErasureParticipant } from '../../crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant';
import { PartyTitularErasureParticipant } from '../../parties/privacy/party-titular-erasure.participant';
import { UserAccountErasureParticipant } from '../../users/privacy/user-account-erasure.participant';
import { WfmTitularErasureParticipant } from '../../wfm/privacy/wfm-titular-erasure.participant';
import { ExecutionOrderTitularErasureParticipant } from '../../tasks/privacy/execution-order-titular-erasure.participant';
import { OperationalTaskTitularErasureParticipant } from '../../tasks/privacy/operational-task-titular-erasure.participant';
import { MediaTitularErasureParticipant } from '../../media/privacy/media-titular-erasure.participant';
import { BillingTitularErasureParticipant } from '../../billing/privacy/billing-titular-erasure.participant';
import { BillingStandingReadAdapter } from '../../billing/privacy/billing-standing-read.adapter';
import { IBillingStandingReadPort } from '../requests/ports/billing-standing-read.port';
import { AssuranceTitularErasureParticipant } from '../../assurance/privacy/assurance-titular-erasure.participant';
import { NetworkTitularErasureParticipant } from '../../network/privacy/network-titular-erasure.participant';
import { SupplierProfileReadAdapter } from '../../inventory/privacy/supplier-profile-read.adapter';
import { PqrRetentionReadAdapter } from '../../assurance/privacy/pqr-retention-read.adapter';
import { IPqrRetentionReadPort } from '../requests/ports/pqr-retention-read.port';
import { IContractStandingReadPort } from '../requests/ports/contract-standing-read.port';
import { IPersonalDataErasurePort } from '../ports/personal-data-erasure.port';
import { AuditService } from '../../audit/audit.service';
import { ConservationDutyService } from './conservation-duty.service';
import { RetentionExpiryService } from './retention-expiry.service';
import { RetentionAuditPort } from './retention-audit.port';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

/**
 * H-EXP B5 contra PostgreSQL real: P3 de §1.10 del plan — un prospecto que la
 * selección no concilia deja fila ATTENTION_REQUIRED con su reason_code, igual
 * que en processProspecto. Solo usa códigos ya cubiertos por el CHECK de la
 * 179 (MISSING_POLICY), sin cambiar la migración. Schema efímero propio para
 * no alterar los conteos globales de B3 ni B4-R2. Sin PII.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;

jest.setTimeout(300_000);

const TODAY = '2026-11-08';

describeWithDb(
  'RetentionExpiry B5 — selección de prospectos sin conciliar en PostgreSQL real',
  () => {
    const schemaName = `tenant_hexp_b5_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const tenantId = randomUUID();
    const tenantSlug = `hexp-b5-${randomUUID().slice(0, 8)}`;
    const actorId = randomUUID();
    const s = `"${schemaName}"`;

    let dataSource: DataSource | undefined;
    let service: RetentionExpiryService | undefined;

    const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
      TenantContext.run({ tenantId, schemaName, tenantSlug }, operation);

    function ready(): { ds: DataSource; expiry: RetentionExpiryService } {
      if (!dataSource || !service) throw new Error('Integración no inicializada.');
      return { ds: dataSource, expiry: service };
    }

    function runBatch() {
      const { ds, expiry } = ready();
      return runInTenantSchema(ds, schemaName, (queryRunner) =>
        inTenant(() =>
          expiry.runTenantBatch(queryRunner.manager, {
            actorId,
            runId: randomUUID(),
            today: TODAY,
          }),
        ),
      );
    }

    function preview() {
      const { ds, expiry } = ready();
      return runInTenantSchema(ds, schemaName, (queryRunner) =>
        inTenant(() => expiry.previewTenant(queryRunner.manager, TODAY)),
      );
    }

    async function q(sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
      return (await ready().ds.query(sql, params)) as Array<Record<string, unknown>>;
    }

    async function ledgerFor(tipo: string, targetId: string) {
      return (await q(
        `SELECT estado, changed_rows, reason_code FROM ${s}.privacy_retention_expiry_runs
        WHERE tipo = $1 AND target_id = $2`,
        [tipo, targetId],
      )) as Array<{ estado: string; changed_rows: number; reason_code: string | null }>;
    }

    async function insertDiscardedProspect(discardedAt: string): Promise<string> {
      const id = randomUUID();
      await q(
        `INSERT INTO ${s}.expediente_records
         (id, tenant_id, full_name, status, status_changed_at, created_by)
       VALUES ($1, $2, 'Prospecto sintético B5', 'DESCARTADO', $3, $4)`,
        [id, tenantId, discardedAt, actorId],
      );
      return id;
    }

    async function insertAnsweredProspectPqr(expedienteId: string, answeredAt: string) {
      const ticket = randomUUID();
      await q(
        `INSERT INTO ${s}.support_tickets
         (id, tenant_id, ticket_number, type, subject, requester_type, subject_type,
          subject_ref_id, created_by_user_id)
       VALUES ($1, $2, $3, 'PQR', 'Sonda B5', 'EXTERNAL', 'EXPEDIENTE', $4, $5)`,
        [ticket, tenantId, `PQR-${ticket.slice(0, 8)}`, expedienteId, actorId],
      );
      await q(
        `INSERT INTO ${s}.ticket_pqr_records
         (ticket_id, tenant_id, deadline_type, deadline_at, notified_at, resolved_at)
       VALUES ($1, $2, 'FINAL_RESOLUTION', $3::timestamptz, $3::timestamptz, $3::timestamptz)`,
        [ticket, tenantId, answeredAt],
      );
    }

    async function prospectName(expedienteId: string): Promise<string | null> {
      const rows = (await q(`SELECT full_name FROM ${s}.expediente_records WHERE id = $1`, [
        expedienteId,
      ])) as Array<{ full_name: string | null }>;
      return rows[0]?.full_name ?? null;
    }

    beforeAll(async () => {
      const databaseName = process.env['DB_NAME'] ?? '';
      if (!allowedDatabaseName.test(databaseName)) {
        throw new Error(
          'Integración H-EXP B5: DB_NAME debe ser test o iwana_it_*; nunca desarrollo.',
        );
      }
      const credentials = resolveMigrationDbCredentials();
      dataSource = new DataSource({
        type: 'postgres',
        host: process.env['DB_HOST'] ?? 'localhost',
        port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
        username: credentials.username,
        password: credentials.password,
        database: databaseName,
        entities: [],
        migrations: [],
        synchronize: false,
        logging: false,
        extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
      });
      await dataSource.initialize();
      await dataSource.query(`CREATE SCHEMA ${s}`);
      await dataSource.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'H-EXP B5 sintético', $2, $3, 'ACTIVE', 'hexp-b5@invalid.example')`,
        [tenantId, tenantSlug, schemaName],
      );
      const tenantDataSource = createTenantDataSource(dataSource, schemaName, tenantSlug);
      await tenantDataSource.initialize();
      try {
        await applyTenantMigrationsInOrder(tenantDataSource);
      } finally {
        await tenantDataSource.destroy();
      }

      const moduleRef = await Test.createTestingModule({
        providers: [
          { provide: getDataSourceToken(), useValue: dataSource },
          { provide: DataSource, useValue: dataSource },
          {
            provide: ConfigService,
            useValue: new ConfigService({
              ...process.env,
              PII_HASH_KEY: randomBytes(32).toString('hex'),
            }),
          },
          { provide: AuditService, useValue: { logWithin: jest.fn(async () => undefined) } },
          CrmContractStandingReadAdapter,
          { provide: IContractStandingReadPort, useExisting: CrmContractStandingReadAdapter },
          BillingStandingReadAdapter,
          { provide: IBillingStandingReadPort, useExisting: BillingStandingReadAdapter },
          PqrRetentionReadAdapter,
          { provide: IPqrRetentionReadPort, useExisting: PqrRetentionReadAdapter },
          { provide: RetentionAuditPort, useExisting: AuditService },
          CrmTitularErasureParticipant,
          PartyTitularErasureParticipant,
          UserAccountErasureParticipant,
          WfmTitularErasureParticipant,
          ExecutionOrderTitularErasureParticipant,
          OperationalTaskTitularErasureParticipant,
          MediaTitularErasureParticipant,
          BillingTitularErasureParticipant,
          AssuranceTitularErasureParticipant,
          NetworkTitularErasureParticipant,
          SupplierProfileReadAdapter,
          CrmPersonalDataErasureAdapter,
          { provide: IPersonalDataErasurePort, useExisting: CrmPersonalDataErasureAdapter },
          ConservationDutyService,
          {
            provide: RetentionExpiryService,
            inject: [
              ConservationDutyService,
              IContractStandingReadPort,
              IPersonalDataErasurePort,
              RetentionAuditPort,
              IPqrRetentionReadPort,
            ],
            useFactory: (...deps: ConstructorParameters<typeof RetentionExpiryService>) =>
              new RetentionExpiryService(...deps),
          },
        ],
      }).compile();
      service = moduleRef.get(RetentionExpiryService);
    }, 180_000);

    afterAll(async () => {
      if (!dataSource?.isInitialized) return;
      if (!/^tenant_hexp_b5_[a-f0-9]{12}$/u.test(schemaName)) {
        throw new Error('Schema de limpieza inválido.');
      }
      try {
        await dataSource.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      } finally {
        await dataSource.destroy();
      }
    });

    it('B5-P3: prospecto sin política PQR_SOPORTES deja ATTENTION_REQUIRED MISSING_POLICY y no toca datos', async () => {
      // PQR respondida hace 6 meses: con la política presente el prospecto se
      // retiene por PQR_SOPORTES; sin ella la selección no concilia y falla
      // cerrado con código saneado (CHECK de la 179), igual que processProspecto.
      const expediente = await insertDiscardedProspect('2023-01-10T12:00:00Z');
      await insertAnsweredProspectPqr(expediente, '2026-05-08T12:00:00Z');
      await q(`DELETE FROM ${s}.retention_policies WHERE category = 'PQR_SOPORTES'`, []);
      try {
        const result = await runBatch();
        expect(result.status).toBe('ATTENTION_REQUIRED');
        expect(result.reasonCounts).toEqual({ MISSING_POLICY: 1 });
        expect(await ledgerFor('TITULAR', expediente)).toEqual([
          { estado: 'ATTENTION_REQUIRED', changed_rows: 0, reason_code: 'MISSING_POLICY' },
        ]);
        expect(await prospectName(expediente)).toBe('Prospecto sintético B5');
        const dry = await preview();
        expect(dry.eligible.prospectos.map((row) => row.expedienteId)).not.toContain(expediente);
        expect(dry.unreconciled.prospectos).toContainEqual({
          expedienteId: expediente,
          reasonCode: 'MISSING_POLICY',
        });
      } finally {
        // Restaura el seed canónico (177).
        await q(
          `INSERT INTO ${s}.retention_policies
           (category, years, start_event, legal_basis, is_legal_minimum)
         VALUES ('PQR_SOPORTES', 3, 'NOTIFICACION_RESPUESTA_DEFINITIVA', 'ADR-104 E1', true)
         ON CONFLICT (category) DO UPDATE SET years = 3`,
          [],
        );
      }
    });
  },
);
