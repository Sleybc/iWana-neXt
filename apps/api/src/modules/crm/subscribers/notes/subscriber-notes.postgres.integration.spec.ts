import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLog, dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import {
  AccessPermissionKey,
  SubscriberNoteListResponseSchema,
  type PrivacyMark,
} from '@iwana/shared';
import { AuditService } from '../../../audit/audit.service';
import { CrmTitularErasureParticipant } from '../../privacy-adapters/titular-erasure/crm-titular-erasure.participant';
import {
  ANONYMIZED,
  type ErasureKeys,
} from '../../privacy-adapters/titular-erasure/titular-erasure-sql';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../../packages/database/src/migrations/tenant/runner';
import { SubscriberNotesService } from './subscriber-notes.service';
import { TypeOrmReencryptDbAdapter } from '../../../../common/crypto/reencrypt-aes.db-adapter';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
if (dbAvailable && !/^(test|iwana_it_[a-z0-9_]+)$/u.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('Notas del suscriptor: DB_NAME debe ser test o iwana_it_*.');
}
jest.setTimeout(900_000);

const tenantId = randomUUID();
const schemaName = `tenant_mod05_notes_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
const actorId = randomUUID();
const actor = { id: actorId, role: 'ADMIN' };
const KEYS: ErasureKeys = {
  hashKey: Buffer.alloc(32, 1),
  activeEncryptionKey: Buffer.alloc(32, 2),
  previousEncryptionKey: null,
};

describeWithDb('Notas manuales del suscriptor: PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: SubscriberNotesService;
  let marks: Record<string, PrivacyMark[]>;
  let permissions: string[];
  let auditService: AuditService;

  const withTenant = <T>(callback: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'notes-fixture' }, callback);
  const qualified = (table: string) => `"${schemaName}"."${table}"`;

  async function insertSubscriber(
    options: { partyId?: string; anonymized?: boolean } = {},
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO ${qualified('subscribers')}
        (id, tenant_id, party_id, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum, vat_treatment, address,
         created_by, anonymized_at, anonymized_request_id)
       VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico-cifrado', 'Titular',
               'Sintético', 3, 'STANDARD', 'Dirección sintética', $4, $5, $6)`,
      [
        id,
        tenantId,
        options.partyId ?? null,
        actorId,
        options.anonymized ? new Date() : null,
        options.anonymized ? randomUUID() : null,
      ],
    );
    return id;
  }

  async function noteCount(subscriberId: string): Promise<number> {
    const [row] = (await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM ${qualified('subscriber_note')} WHERE subscriber_id = $1`,
      [subscriberId],
    )) as Array<{ total: number }>;
    return row?.total ?? 0;
  }

  function build(audit: AuditService = auditService): SubscriberNotesService {
    return new SubscriberNotesService(
      dataSource,
      audit,
      { getEffectivePermissionsForUser: jest.fn(async () => permissions) } as never,
      {
        activeMarks: jest.fn(async (ids: string[]) =>
          Object.fromEntries(ids.map((id) => [id, marks[id] ?? []])),
        ),
      } as never,
      new ConfigService({ PII_ENCRYPTION_KEY: KEYS.activeEncryptionKey.toString('hex') }),
    );
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [AuditLog],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 3, min: 1 },
    });
    await dataSource.initialize();
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Notas sintético', $2, $3, 'ACTIVE', 'notes@example.invalid')`,
      [tenantId, `notes-${tenantId.slice(0, 8)}`, schemaName],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `notes-${tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    auditService = new AuditService(dataSource, {} as never);
  });

  beforeEach(() => {
    marks = {};
    permissions = [AccessPermissionKey.CRM_SUBSCRIBERS_READ];
    service = build();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await dataSource.destroy();
    }
  });

  it('guarda el texto cifrado en la columna', async () => {
    const subscriberId = await insertSubscriber();
    await withTenant(() => service.create(subscriberId, 'Texto en claro sintético', actorId));
    const [row] = (await dataSource.query(
      `SELECT body_encrypted FROM ${qualified('subscriber_note')} WHERE subscriber_id = $1`,
      [subscriberId],
    )) as Array<{ body_encrypted: string }>;
    expect(row?.body_encrypted).toBeTruthy();
    expect(row?.body_encrypted).not.toContain('Texto en claro');
  });

  it('crea y lista más reciente primero, paginado, con auditoría sin el texto', async () => {
    const subscriberId = await insertSubscriber();
    const first = await withTenant(() => service.create(subscriberId, 'Primera nota', actorId));
    const second = await withTenant(() => service.create(subscriberId, 'Segunda nota', actorId));
    // La 181 hace la tabla de solo inserción: el ajuste de reloj del fixture desactiva la guarda.
    await dataSource.transaction(async (manager) => {
      await manager.query(
        `ALTER TABLE ${qualified('subscriber_note')} DISABLE TRIGGER trg_subscriber_note_guard`,
      );
      await manager.query(
        `UPDATE ${qualified('subscriber_note')}
            SET created_at = created_at - interval '1 minute' WHERE id = $1`,
        [first.id],
      );
      await manager.query(
        `ALTER TABLE ${qualified('subscriber_note')} ENABLE TRIGGER trg_subscriber_note_guard`,
      );
    });

    const page1 = await withTenant(() => service.list(subscriberId, actor, { page: 1, limit: 1 }));
    expect(page1.data.map((note) => note.id)).toEqual([second.id]);
    expect(page1.meta).toMatchObject({ total: 2, page: 1, limit: 1, hasMore: true });
    expect(SubscriberNoteListResponseSchema.parse(page1)).toEqual(page1);
    const page2 = await withTenant(() => service.list(subscriberId, actor, { page: 2, limit: 1 }));
    expect(page2.data).toEqual([
      expect.objectContaining({ id: first.id, body: 'Primera nota', createdBy: actorId }),
    ]);

    const audits = (await dataSource.query(
      `SELECT action, new_value::text AS new_value FROM ${qualified('audit_logs')}
        WHERE entity_id = ANY($1::text[])`,
      [[first.id, second.id, subscriberId]],
    )) as Array<{ action: string; new_value: string }>;
    expect(audits.filter((row) => row.action === 'CREATE')).toHaveLength(2);
    expect(audits.filter((row) => row.action === 'RECORD_ACCESS')).toHaveLength(2);
    expect(audits.map((row) => row.new_value).join(' ')).not.toMatch(/Primera|Segunda/u);
  });

  it('revierte la nota si la auditoría falla en la misma transacción', async () => {
    const subscriberId = await insertSubscriber();
    const failing = build({
      logWithin: jest.fn().mockRejectedValue(new Error('synthetic audit failure')),
    } as unknown as AuditService);
    await expect(
      withTenant(() => failing.create(subscriberId, 'No queda', actorId)),
    ).rejects.toThrow('synthetic audit failure');
    expect(await noteCount(subscriberId)).toBe(0);
  });

  it('rechaza crear y, sin permiso, leer notas de un titular bloqueado', async () => {
    const partyId = randomUUID();
    const subscriberId = await insertSubscriber({ partyId });
    await withTenant(() => service.create(subscriberId, 'Antes del bloqueo', actorId));
    marks[partyId] = ['DATOS_BLOQUEADOS'];

    const createError = await withTenant(() =>
      service.create(subscriberId, 'Bloqueada', actorId),
    ).catch((caught: unknown) => caught);
    expect(createError).toBeInstanceOf(ConflictException);
    expect((createError as ConflictException).getResponse()).toMatchObject({
      code: 'PRIVACY_DATA_BLOCKED',
    });
    expect(await noteCount(subscriberId)).toBe(1);

    await expect(withTenant(() => service.list(subscriberId, actor))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const [denied] = (await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM ${qualified('audit_logs')}
        WHERE entity_id = $1 AND action = 'RECORD_ACCESS'`,
      [subscriberId],
    )) as Array<{ total: number }>;
    expect(denied?.total).toBe(1);
    permissions = [AccessPermissionKey.CRM_SUBSCRIBERS_READ, AccessPermissionKey.PRIVACY_READ];
    const granted = await withTenant(() => service.list(subscriberId, actor));
    expect(granted.data).toHaveLength(1);
  });

  it('rechaza crear notas de un titular anonimizado', async () => {
    const subscriberId = await insertSubscriber({ anonymized: true });
    const error = await withTenant(() => service.create(subscriberId, 'Tarde', actorId)).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'PRIVACY_TITULAR_ANONYMIZED',
    });
    expect(await noteCount(subscriberId)).toBe(0);
  });

  it('la supresión del titular sustituye el texto de sus notas por el marcador (R2)', async () => {
    const subscriberId = await insertSubscriber();
    const other = await insertSubscriber();
    await withTenant(() => service.create(subscriberId, 'Texto libre sintético', actorId));
    await withTenant(() => service.create(other, 'Nota de otro titular', actorId));
    const participant = new CrmTitularErasureParticipant(new ConfigService({}));
    const scope = {
      partyId: null,
      subscriberIds: [subscriberId],
      expedienteIds: [],
      userIds: [],
      cryptoKeys: KEYS,
      requestId: randomUUID(),
    };

    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      const plan = await participant.plan(scope, qr);
      expect(plan.find((result) => result.table === 'subscriber_note')).toMatchObject({
        selected: 1,
        residual: 1,
      });
      await qr.query(`SELECT set_config('iwana.titular_erasure', 'on', true)`);
      const applied = await participant.apply(scope, qr, 'apply');
      expect(applied.find((result) => result.table === 'subscriber_note')).toMatchObject({
        changed: 1,
        residual: 0,
      });
      const replan = await participant.plan(scope, qr);
      // El cifrado no permite filtrar por texto: la fila sigue seleccionada, sin residuo.
      expect(replan.find((result) => result.table === 'subscriber_note')).toMatchObject({
        changed: 0,
        residual: 0,
      });
    });

    permissions = [AccessPermissionKey.CRM_SUBSCRIBERS_READ];
    const erased = await withTenant(() => service.list(subscriberId, actor));
    expect(erased.data.map((note) => note.body)).toEqual([ANONYMIZED]);
    const kept = await withTenant(() => service.list(other, actor));
    expect(kept.data.map((note) => note.body)).toEqual(['Nota de otro titular']);
  });

  it('181: la base rechaza INSERT directo en titular anonimizado (M-1)', async () => {
    const subscriberId = await insertSubscriber({ anonymized: true });
    await expect(
      dataSource.query(
        `INSERT INTO ${qualified('subscriber_note')} (subscriber_id, body_encrypted, created_by)
         VALUES ($1, 'cifrado-sintetico', $2)`,
        [subscriberId, actorId],
      ),
    ).rejects.toMatchObject({
      driverError: expect.objectContaining({ code: '55000', hint: 'PRIVACY_TITULAR_ANONYMIZED' }),
    });
    expect(await noteCount(subscriberId)).toBe(0);
  });

  it('181: UPDATE y DELETE directos se rechazan; tabla de solo inserción (M-2)', async () => {
    const subscriberId = await insertSubscriber();
    const note = await withTenant(() => service.create(subscriberId, 'Inmutable', actorId));
    const appendOnly = {
      driverError: expect.objectContaining({ code: '55000', hint: 'SUBSCRIBER_NOTE_APPEND_ONLY' }),
    };
    await expect(
      dataSource.query(
        `UPDATE ${qualified('subscriber_note')} SET body_encrypted = 'otro' WHERE id = $1`,
        [note.id],
      ),
    ).rejects.toMatchObject(appendOnly);
    await expect(
      dataSource.query(`DELETE FROM ${qualified('subscriber_note')} WHERE id = $1`, [note.id]),
    ).rejects.toMatchObject(appendOnly);
    expect(await noteCount(subscriberId)).toBe(1);
    const listed = await withTenant(() => service.list(subscriberId, actor));
    expect(listed.data.map((row) => row.body)).toEqual(['Inmutable']);
  });

  it('181: UPDATE y DELETE en notas de un titular ya anonimizado fallan con PRIVACY_TITULAR_ANONYMIZED', async () => {
    const subscriberId = await insertSubscriber();
    const note = await withTenant(() => service.create(subscriberId, 'Antes', actorId));
    await dataSource.query(
      `UPDATE ${qualified('subscribers')} SET anonymized_at = now(), anonymized_request_id = $2
        WHERE id = $1`,
      [subscriberId, randomUUID()],
    );
    const anonymized = {
      driverError: expect.objectContaining({ code: '55000', hint: 'PRIVACY_TITULAR_ANONYMIZED' }),
    };
    await expect(
      dataSource.query(
        `UPDATE ${qualified('subscriber_note')} SET body_encrypted = 'otro' WHERE id = $1`,
        [note.id],
      ),
    ).rejects.toMatchObject(anonymized);
    await expect(
      dataSource.query(`DELETE FROM ${qualified('subscriber_note')} WHERE id = $1`, [note.id]),
    ).rejects.toMatchObject(anonymized);
    expect(await noteCount(subscriberId)).toBe(1);
  });

  it('181/K2: el adaptador de recifrado reescribe body_encrypted, también en anonimizados', async () => {
    const subscriberId = await insertSubscriber();
    const note = await withTenant(() => service.create(subscriberId, 'Para recifrar', actorId));
    const adapter = new TypeOrmReencryptDbAdapter(dataSource);
    const target = {
      entityType: 'subscriberNote.bodyEncrypted',
      table: 'subscriber_note',
      column: 'body_encrypted',
      idColumn: 'id',
    } as never;
    expect(await adapter.probeEncryptedWrite(schemaName, target, note.id, 'cifrado-k2')).toBeNull();
    await adapter.updateEncryptedValue(schemaName, target, note.id, 'cifrado-k2');
    await dataSource.query(
      `UPDATE ${qualified('subscribers')} SET anonymized_at = now(), anonymized_request_id = $2
        WHERE id = $1`,
      [subscriberId, randomUUID()],
    );
    await adapter.updateEncryptedValue(schemaName, target, note.id, 'cifrado-k2-anon');
    const [row] = (await dataSource.query(
      `SELECT body_encrypted FROM ${qualified('subscriber_note')} WHERE id = $1`,
      [note.id],
    )) as Array<{ body_encrypted: string }>;
    expect(row?.body_encrypted).toBe('cifrado-k2-anon');
    // El GUC es local a la transacción del adaptador: fuera de ella sigue la guarda.
    await expect(
      dataSource.query(
        `UPDATE ${qualified('subscriber_note')} SET body_encrypted = 'x' WHERE id = $1`,
        [note.id],
      ),
    ).rejects.toMatchObject({
      driverError: expect.objectContaining({ code: '55000', hint: 'PRIVACY_TITULAR_ANONYMIZED' }),
    });
  });
});
