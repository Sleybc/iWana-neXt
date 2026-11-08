import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  buildTenantSchemaAppGrantsSql,
  resolveMigrationDbCredentials,
  runInTenantSchema,
  TenantContext,
} from '@iwana/db';
import { AccessPermissionKey, DocumentTypeParty, normalizeDocumentNumber } from '@iwana/shared';
import { DataSource, QueryRunner } from 'typeorm';
import { hmacPii } from '../../../common/crypto/pii-hash-key.util';
import { encryptAes256Gcm } from '../../../common/crypto/aes-gcm.util';
import { AuditService } from '../../audit/audit.service';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { MediaService } from '../../media/media.service';
import { PqrRetentionReadAdapter } from '../../assurance/privacy/pqr-retention-read.adapter';
import { AssuranceTitularErasureParticipant } from '../../assurance/privacy/assurance-titular-erasure.participant';
import { NetworkTitularErasureParticipant } from '../../network/privacy/network-titular-erasure.participant';
import { SupplierProfileReadAdapter } from '../../inventory/privacy/supplier-profile-read.adapter';
import { BillingStandingReadAdapter } from '../../billing/privacy/billing-standing-read.adapter';
import { BillingTitularErasureParticipant } from '../../billing/privacy/billing-titular-erasure.participant';
import { CrmPersonalDataErasureAdapter } from '../../crm/privacy-adapters/crm-personal-data-erasure.adapter';
import { CrmTitularErasureParticipant } from '../../crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant';
import { PartyTitularErasureParticipant } from '../../parties/privacy/party-titular-erasure.participant';
import { UserAccountErasureParticipant } from '../../users/privacy/user-account-erasure.participant';
import { WfmTitularErasureParticipant } from '../../wfm/privacy/wfm-titular-erasure.participant';
import { ExecutionOrderTitularErasureParticipant } from '../../tasks/privacy/execution-order-titular-erasure.participant';
import { OperationalTaskTitularErasureParticipant } from '../../tasks/privacy/operational-task-titular-erasure.participant';
import { MediaTitularErasureParticipant } from '../../media/privacy/media-titular-erasure.participant';
import { IContractImpersonationPort } from '../ports/contract-impersonation.port';
import { IPersonalDataErasurePort } from '../ports/personal-data-erasure.port';
import { IBillingStandingReadPort } from './ports/billing-standing-read.port';
import { IContractStandingReadPort } from './ports/contract-standing-read.port';
import { PrivacyRequestsService } from './requests.service';
import { anonymizeTitularInTenantSchema } from '../../../cli/anonymize-titular';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

/**
 * H-1 B2 (spec 2026-11-07-privacy-h1-guc-supresion, D-H1-1 y D-H1-2) sobre la
 * cadena de migraciones vigente, con la 178, y el borrado real:
 * `PrivacyRequestsService` → `CrmPersonalDataErasureAdapter` y sus participantes,
 * cableados como en `privacy-erasure-api.postgres.integration.spec.ts`.
 *
 * - CA-H1-01: el rol real de la API (`DB_APP_USER`, conexión propia) con el GUC
 *   activo no puede reponer datos en `subscribers`, `expediente_records` ni
 *   `contracts` del titular suprimido: `55000`, sin entrada en la bitácora.
 * - CA-H1-02: el borrado real y la reaplicación del CLI pasan con la 178.
 * - CA-H1-06: la reaplicación del CLI deja entradas completas; la primera
 *   supresión del expediente (aún no marcado) no deja ninguna.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;
const keyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const key = Buffer.from(keyHex, 'hex');
const documentNumber = '90000178';
const cliKeys = { hashKey: key, activeEncryptionKey: key, previousEncryptionKey: null };
const LOGGED_TABLES = ['subscribers', 'expediente_records', 'contracts'] as const;
type LoggedTable = (typeof LOGGED_TABLES)[number];

interface LogEntry {
  table_name: LoggedTable;
  row_id: string;
  txid: string;
  session_user: string;
  operation: string;
  changed_columns: string[];
  anonymized_request_id: string | null;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

describeWithDb('Privacy H-1 — rama monótona y bitácora con el borrado real (B2)', () => {
  const schemaName = `tenant_privacy_h1_${randomBytes(5).toString('hex')}`;
  const q = quoteIdentifier(schemaName);
  const tenantId = randomUUID();
  const actorId = randomUUID();
  const ids = {
    expediente: randomUUID(),
    party: randomUUID(),
    subscriber: randomUUID(),
    contract: randomUUID(),
  };
  const rowIdByTable: Record<LoggedTable, string> = {
    subscribers: ids.subscriber,
    expediente_records: ids.expediente,
    contracts: ids.contract,
  };
  const configService = {
    getOrThrow: (name: string) => {
      if (name === 'MFA_ENCRYPTION_KEY' || name === 'PII_HASH_KEY') return keyHex;
      throw new Error('Clave sintética no configurada.');
    },
    get: (name: string) => (name === 'PII_ENCRYPTION_KEY' ? keyHex : undefined),
  } as unknown as ConfigService;
  const auditService = {
    log: jest.fn().mockResolvedValue(undefined),
    logWithin: jest.fn().mockResolvedValue(undefined),
  };
  const effectivePermissionsService = {
    getEffectivePermissionsForUser: jest
      .fn()
      .mockResolvedValue([AccessPermissionKey.PRIVACY_READ, AccessPermissionKey.PRIVACY_MANAGE]),
  };

  let dataSource: DataSource;
  let appDataSource: DataSource;
  let appRole = '';
  let migratorSessionUser = '';
  let requestId = '';
  /** Bitácora completa justo después del borrado real, antes de cualquier otra prueba. */
  let logAfterApiErasure: LogEntry[] = [];

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'privacy-h1-it' }, operation);

  async function readLog(): Promise<LogEntry[]> {
    return (await dataSource.query(
      `SELECT table_name, row_id::text AS row_id, txid::text AS txid, "session_user",
              operation, changed_columns, anonymized_request_id::text AS anonymized_request_id
         FROM ${q}.privacy_erasure_mutation_log ORDER BY id`,
    )) as LogEntry[];
  }

  async function readRow(table: LoggedTable): Promise<Record<string, unknown>> {
    const rows = (await dataSource.query(
      `SELECT to_jsonb(t) AS row FROM ${q}.${quoteIdentifier(table)} t WHERE id = $1`,
      [rowIdByTable[table]],
    )) as Array<{ row: Record<string, unknown> }>;
    return rows[0]!.row;
  }

  async function seedTitular(): Promise<void> {
    const documentHmac = hmacPii(
      normalizeDocumentNumber(DocumentTypeParty.CC, documentNumber),
      key,
    );
    await dataSource.query(
      `INSERT INTO ${q}.expediente_records
         (id, tenant_id, full_name, document_type, document_number_hmac, address, municipality,
          created_by)
       VALUES ($1, $2, 'Prospecto ficticio H1', 'CC', $3, 'Calle ficticia 178',
         'Municipio ficticio', $4)`,
      [ids.expediente, tenantId, documentHmac, actorId],
    );
    await dataSource.query(
      `INSERT INTO ${q}.party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', $2, 'Titular ficticio H1')`,
      [ids.party, encryptAes256Gcm('synthetic-party-document', key)],
    );
    await dataSource.query(
      `INSERT INTO ${q}.subscribers
         (id, tenant_id, party_id, person_type, customer_segment, document_type,
          document_number_encrypted, first_name, last_name, stratum, email_encrypted,
          phone_encrypted, vat_treatment, tax_regime, vat_responsibility, address, created_by)
       VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', $4,
         'Nombre ficticio', 'Apellido ficticio', 2, $5, $6, 'STANDARD', 'COMMON',
         'RESPONSABLE', 'Dirección ficticia', $7)`,
      [
        ids.subscriber,
        tenantId,
        ids.party,
        encryptAes256Gcm('synthetic-subscriber-document', key),
        encryptAes256Gcm('synthetic-email', key),
        encryptAes256Gcm('synthetic-phone', key),
        actorId,
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.contracts
         (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, fiscal_name, alias,
          installation_address, installation_stratum)
       VALUES ($1, $2, $3, 'synthetic-plan', '{}'::jsonb, 'Nombre fiscal ficticio',
         'Alias ficticio', 'Dirección de instalación ficticia', 2)`,
      [ids.contract, tenantId, ids.subscriber],
    );
  }

  /** Borrado real: solicitud verificada, vista previa y resolución por el servicio. */
  async function runRealErasure(): Promise<string> {
    const created = await inTenant(() =>
      service.create(
        {
          kind: 'CONSULTA',
          right: 'SUPRIMIR',
          partyId: ids.party,
          requesterKind: 'TITULAR',
          requesterName: 'Titular ficticio de integración',
          requesterDocumentType: DocumentTypeParty.CC,
          requesterDocument: documentNumber,
          requesterContact: 'titular-h1@example.invalid',
          identityVerificationMethod: 'DOCUMENTO_PRESENCIAL',
        },
        actorId,
      ),
    );
    const id = created.request.id;
    await inTenant(() => service.transition(id, 'complete', {}, actorId));
    const preview = await inTenant(() => service.erasurePreview(id));
    expect(preview.eligible).toBe(true);
    expect(preview.candidateExpedienteIds).toEqual([ids.expediente]);
    await inTenant(() =>
      service.transition(
        id,
        'resolve',
        {
          responseText: 'Supresión aplicada en la integración H-1.',
          responseChannel: 'EMAIL',
          erasure: { confirm: true, expedienteIds: preview.candidateExpedienteIds },
        },
        actorId,
      ),
    );
    return id;
  }

  /** Intento de reidentificación como `iwana_app`, en su propia transacción. */
  async function attemptAsApp(sql: string, params: unknown[], sessionWide = false): Promise<void> {
    const runner: QueryRunner = appDataSource.createQueryRunner();
    try {
      await runner.connect();
      await runner.query(`SET search_path TO ${q}, public`);
      if (sessionWide) {
        // Envenenamiento de sesión (spec §1): el GUC fijado para toda la conexión.
        await runner.query(`SELECT set_config('iwana.titular_erasure', 'on', false)`);
        await runner.query(sql, params);
        return;
      }
      await runner.startTransaction();
      await runner.query(`SELECT set_config('iwana.titular_erasure', 'on', true)`);
      await runner.query(sql, params);
      await runner.commitTransaction();
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      if (sessionWide) {
        await runner.query(`SELECT set_config('iwana.titular_erasure', 'off', false)`);
      }
      await runner.release();
    }
  }

  let service: PrivacyRequestsService;

  beforeAll(async () => {
    const databaseName = process.env['DB_NAME'] ?? '';
    if (!allowedDatabaseName.test(databaseName)) {
      throw new Error(
        'Integración privacy H-1: DB_NAME debe ser test o iwana_it_*; nunca la base de desarrollo.',
      );
    }
    appRole = process.env['DB_APP_USER']?.trim() ?? '';
    if (!appRole) {
      throw new Error('Integración privacy H-1: CA-H1-01 exige DB_APP_USER/DB_APP_PASSWORD.');
    }
    const credentials = resolveMigrationDbCredentials();
    const connection = {
      type: 'postgres' as const,
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5433', 10),
      database: databaseName,
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
    };
    dataSource = new DataSource({
      ...connection,
      username: credentials.username,
      password: credentials.password,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA ${q}`);
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Privacy H1 sintético', $2, $3, 'ACTIVE', 'privacy-h1-it@example.invalid')`,
      [tenantId, `privacy-h1-${schemaName.slice(-10)}`, schemaName],
    );
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `privacy-h1-${schemaName}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    // Grants que recibe un tenant aprovisionado; nunca SET ROLE sobre el migrador.
    await dataSource.query(
      buildTenantSchemaAppGrantsSql(schemaName, appRole, credentials.username),
    );
    const [session] = (await dataSource.query('SELECT session_user::text AS "user"')) as Array<{
      user: string;
    }>;
    migratorSessionUser = session!.user;
    expect(migratorSessionUser).not.toBe(appRole);

    appDataSource = new DataSource({
      ...connection,
      username: appRole,
      password: process.env['DB_APP_PASSWORD'] ?? '',
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await appDataSource.initialize();

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: ConfigService, useValue: configService },
        { provide: AuditService, useValue: auditService },
        { provide: IContractImpersonationPort, useValue: { suspendForImpersonation: jest.fn() } },
        {
          provide: IContractStandingReadPort,
          useValue: {
            standing: jest.fn().mockResolvedValue({
              contractIds: [],
              expedienteIds: [],
              subscriberIds: [],
              openContractIds: [],
              lastTerminatedAt: null,
            }),
          },
        },
        { provide: MediaService, useValue: { findOne: jest.fn() } },
        { provide: EffectivePermissionsService, useValue: effectivePermissionsService },
        CrmTitularErasureParticipant,
        PartyTitularErasureParticipant,
        UserAccountErasureParticipant,
        WfmTitularErasureParticipant,
        ExecutionOrderTitularErasureParticipant,
        OperationalTaskTitularErasureParticipant,
        MediaTitularErasureParticipant,
        BillingTitularErasureParticipant,
        BillingStandingReadAdapter,
        { provide: IBillingStandingReadPort, useExisting: BillingStandingReadAdapter },
        AssuranceTitularErasureParticipant,
        NetworkTitularErasureParticipant,
        SupplierProfileReadAdapter,
        CrmPersonalDataErasureAdapter,
        { provide: IPersonalDataErasurePort, useExisting: CrmPersonalDataErasureAdapter },
        {
          provide: PrivacyRequestsService,
          inject: [
            getDataSourceToken(),
            ConfigService,
            AuditService,
            IContractImpersonationPort,
            IContractStandingReadPort,
            MediaService,
            EffectivePermissionsService,
            IPersonalDataErasurePort,
            IBillingStandingReadPort,
          ],
          useFactory: (...deps: ConstructorParameters<typeof PrivacyRequestsService>) => {
            deps[9] = new PqrRetentionReadAdapter();
            return new PrivacyRequestsService(...deps);
          },
        },
      ],
    }).compile();
    service = moduleRef.get(PrivacyRequestsService);
    expect(moduleRef.get(IPersonalDataErasurePort)).toBeInstanceOf(CrmPersonalDataErasureAdapter);

    await seedTitular();
    expect(await readLog()).toEqual([]);
    requestId = await runRealErasure();
    logAfterApiErasure = await readLog();
  }, 300_000);

  afterAll(async () => {
    if (appDataSource?.isInitialized) await appDataSource.destroy();
    if (dataSource?.isInitialized) {
      try {
        await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      } finally {
        await dataSource.destroy();
      }
    }
  });

  it('CA-H1-02: el borrado real con la 178 resuelve la solicitud y deja el titular suprimido', async () => {
    expect(
      await dataSource.query(
        `SELECT status, erased_at IS NOT NULL AS erased FROM ${q}.data_subject_requests WHERE id = $1`,
        [requestId],
      ),
    ).toEqual([{ status: 'RESUELTA', erased: true }]);
    expect(
      await dataSource.query(
        `SELECT full_name, document_number_hmac, address, anonymized_at IS NOT NULL AS marked,
                anonymized_request_id::text AS request_id
           FROM ${q}.expediente_records WHERE id = $1`,
        [ids.expediente],
      ),
    ).toEqual([
      {
        full_name: 'ANONIMIZADO',
        document_number_hmac: null,
        address: null,
        marked: true,
        request_id: requestId,
      },
    ]);
    expect(
      await dataSource.query(
        `SELECT first_name, last_name, stratum, anonymized_at IS NOT NULL AS marked,
                anonymized_request_id::text AS request_id
           FROM ${q}.subscribers WHERE id = $1`,
        [ids.subscriber],
      ),
    ).toEqual([
      {
        first_name: 'ANONIMIZADO',
        last_name: 'ANONIMIZADO',
        stratum: null,
        marked: true,
        request_id: requestId,
      },
    ]);
    expect(
      await dataSource.query(
        `SELECT fiscal_name, alias, installation_address, installation_stratum
           FROM ${q}.contracts WHERE id = $1`,
        [ids.contract],
      ),
    ).toEqual([
      {
        fiscal_name: null,
        alias: 'ANONIMIZADO',
        installation_address: null,
        installation_stratum: null,
      },
    ]);
  });

  it('CA-H1-06: la primera supresión no deja entradas del expediente aún no marcado', () => {
    expect(
      logAfterApiErasure.filter(
        (entry) => entry.table_name === 'expediente_records' && entry.row_id === ids.expediente,
      ),
    ).toEqual([]);
    // Lo que sí registra el borrado real son mutaciones sobre filas ya marcadas
    // (marcar → anular, D-K2A-3), todas de esta solicitud y de esta sesión.
    expect([...new Set(logAfterApiErasure.map((entry) => entry.table_name))].sort()).toEqual([
      'contracts',
      'subscribers',
    ]);
    for (const entry of logAfterApiErasure) {
      expect(entry).toMatchObject({
        operation: 'UPDATE',
        session_user: migratorSessionUser,
        anonymized_request_id: requestId,
      });
      expect([ids.subscriber, ids.contract]).toContain(entry.row_id);
    }
  });

  it('CA-H1-01: iwana_app con el GUC no repone datos del titular suprimido (55000, sin bitácora)', async () => {
    const attempts: Array<{ table: LoggedTable; sql: string; params: unknown[] }> = [
      {
        table: 'subscribers',
        sql: `UPDATE subscribers SET first_name = 'Nombre repuesto' WHERE id = $1`,
        params: [ids.subscriber],
      },
      {
        table: 'subscribers',
        sql: `UPDATE subscribers SET stratum = 3 WHERE id = $1`,
        params: [ids.subscriber],
      },
      {
        table: 'subscribers',
        sql: `UPDATE subscribers SET address = 'Dirección repuesta', email_encrypted = $2 WHERE id = $1`,
        params: [ids.subscriber, encryptAes256Gcm('synthetic-restored-email', key)],
      },
      {
        table: 'expediente_records',
        sql: `UPDATE expediente_records SET full_name = 'Prospecto repuesto' WHERE id = $1`,
        params: [ids.expediente],
      },
      {
        table: 'expediente_records',
        sql: `UPDATE expediente_records SET document_number_hmac = $2, address = 'Calle repuesta' WHERE id = $1`,
        params: [
          ids.expediente,
          hmacPii(normalizeDocumentNumber(DocumentTypeParty.CC, documentNumber), key),
        ],
      },
      {
        table: 'contracts',
        sql: `UPDATE contracts SET fiscal_name = 'Nombre fiscal repuesto' WHERE id = $1`,
        params: [ids.contract],
      },
      {
        table: 'contracts',
        sql: `UPDATE contracts SET alias = 'Alias repuesto', installation_stratum = 4 WHERE id = $1`,
        params: [ids.contract],
      },
      {
        table: 'contracts',
        sql: `UPDATE contracts SET plan_snapshot_json = '{"holder":"repuesto"}'::jsonb WHERE id = $1`,
        params: [ids.contract],
      },
    ];
    const rowsBefore = {
      subscribers: await readRow('subscribers'),
      expediente_records: await readRow('expediente_records'),
      contracts: await readRow('contracts'),
    };
    const logBefore = await readLog();

    for (const attempt of attempts) {
      for (const sessionWide of [false, true]) {
        await expect(attemptAsApp(attempt.sql, attempt.params, sessionWide)).rejects.toMatchObject({
          driverError: { code: '55000', hint: 'PRIVACY_TITULAR_ANONYMIZED' },
        });
      }
    }

    for (const table of LOGGED_TABLES) {
      expect(await readRow(table)).toEqual(rowsBefore[table]);
    }
    expect(await readLog()).toEqual(logBefore);
  });

  it('CA-H1-02 y CA-H1-06: la reaplicación del CLI remedia y deja entradas completas en la bitácora', async () => {
    // Residuo heredado en las tres tablas: la 178 ya no deja escribirlo ni con el GUC,
    // así que se siembra como dueño con los triggers suspendidos en la transacción.
    await runInTenantSchema(dataSource, schemaName, async (runner) => {
      for (const table of LOGGED_TABLES) {
        await runner.query(
          `ALTER TABLE ${table} DISABLE TRIGGER trg_${table}_prevent_anonymized_mutation`,
        );
      }
      await runner.query('UPDATE subscribers SET stratum = 1 WHERE id = $1', [ids.subscriber]);
      await runner.query('UPDATE contracts SET installation_stratum = 1 WHERE id = $1', [
        ids.contract,
      ]);
      await runner.query(
        `UPDATE expediente_records SET address = 'Residuo sintético' WHERE id = $1`,
        [ids.expediente],
      );
      for (const table of LOGGED_TABLES) {
        await runner.query(
          `ALTER TABLE ${table} ENABLE TRIGGER trg_${table}_prevent_anonymized_mutation`,
        );
      }
    });
    const logBefore = await readLog();
    // La siembra sin GUC no registra nada.
    expect(logBefore).toEqual(logAfterApiErasure);

    const remediation = await anonymizeTitularInTenantSchema(
      dataSource,
      schemaName,
      requestId,
      [],
      false,
      cliKeys,
      'apply',
    );
    expect(remediation.verification.residualFields).toBe(0);
    expect(
      await dataSource.query(
        `SELECT
           (SELECT stratum FROM ${q}.subscribers WHERE id = $1) AS stratum,
           (SELECT installation_stratum FROM ${q}.contracts WHERE id = $2) AS installation_stratum,
           (SELECT address FROM ${q}.expediente_records WHERE id = $3) AS address`,
        [ids.subscriber, ids.contract, ids.expediente],
      ),
    ).toEqual([{ stratum: null, installation_stratum: null, address: null }]);

    const added = (await readLog()).slice(logBefore.length);
    const byTable = new Map(added.map((entry) => [entry.table_name, entry]));
    expect([...byTable.keys()].sort()).toEqual([...LOGGED_TABLES].sort());
    const expectedColumn: Record<LoggedTable, string> = {
      subscribers: 'stratum',
      contracts: 'installation_stratum',
      expediente_records: 'address',
    };
    for (const table of LOGGED_TABLES) {
      const entries = added.filter((entry) => entry.table_name === table);
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry).toMatchObject({
          row_id: rowIdByTable[table],
          operation: 'UPDATE',
          session_user: migratorSessionUser,
          anonymized_request_id: requestId,
        });
        expect(Number(entry.txid)).toBeGreaterThan(0);
        expect(entry.changed_columns.length).toBeGreaterThan(0);
      }
      expect(entries.flatMap((entry) => entry.changed_columns)).toContain(expectedColumn[table]);
    }
    // Una sola transacción del CLI: todas sus entradas comparten txid.
    expect(new Set(added.map((entry) => entry.txid)).size).toBe(1);
    // Ninguna entrada previa cambia (append-only).
    expect((await readLog()).slice(0, logBefore.length)).toEqual(logBefore);

    // Reaplicar sin residuo es idempotente: no escribe filas y no añade entradas.
    const idle = await anonymizeTitularInTenantSchema(
      dataSource,
      schemaName,
      requestId,
      [],
      false,
      cliKeys,
      'apply',
    );
    expect(idle.verification.residualFields).toBe(0);
    expect((await readLog()).length).toBe(logBefore.length + added.length);
  });
});
