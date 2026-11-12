import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLog, dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import {
  SubscriberTagAssignmentResponseSchema,
  SubscriberTagListResponseSchema,
  type PrivacyMark,
} from '@iwana/shared';
import { AuditService } from '../../../audit/audit.service';
import { CrmTitularErasureParticipant } from '../../privacy-adapters/titular-erasure/crm-titular-erasure.participant';
import type { ErasureKeys } from '../../privacy-adapters/titular-erasure/titular-erasure-sql';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../../packages/database/src/migrations/tenant/runner';
import { IMPORTED_TAG_DEFAULT_COLOR, SubscriberTagsService } from './subscriber-tags.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
if (dbAvailable && !/^(test|iwana_it_[a-z0-9_]+)$/u.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('Etiquetas del suscriptor: DB_NAME debe ser test o iwana_it_*.');
}
jest.setTimeout(900_000);

const tenantId = randomUUID();
const schemaName = `tenant_tags_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
const actorId = randomUUID();
const KEYS: ErasureKeys = {
  hashKey: Buffer.alloc(32, 1),
  activeEncryptionKey: Buffer.alloc(32, 2),
  previousEncryptionKey: null,
};

describeWithDb('Etiquetas manuales del suscriptor: PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: SubscriberTagsService;
  let marks: Record<string, PrivacyMark[]>;
  let auditService: AuditService;

  const withTenant = <T>(callback: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'tags-fixture' }, callback);
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

  async function assignmentCount(subscriberId: string): Promise<number> {
    const [row] = (await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM ${qualified('subscriber_tag_assignments')}
        WHERE subscriber_id = $1`,
      [subscriberId],
    )) as Array<{ total: number }>;
    return row?.total ?? 0;
  }

  async function audits(entityId: string): Promise<Array<{ action: string; entity_type: string }>> {
    return (await dataSource.query(
      `SELECT action, entity_type FROM ${qualified('audit_logs')}
        WHERE entity_id = $1 ORDER BY created_at, id`,
      [entityId],
    )) as Array<{ action: string; entity_type: string }>;
  }

  function build(audit: AuditService = auditService): SubscriberTagsService {
    return new SubscriberTagsService(dataSource, audit, {
      activeMarks: jest.fn(async (ids: string[]) =>
        Object.fromEntries(ids.map((id) => [id, marks[id] ?? []])),
      ),
    } as never);
  }

  async function codeOf(promise: Promise<unknown>): Promise<unknown> {
    const error = await promise.catch((caught: unknown) => caught);
    return (error as ConflictException).getResponse?.();
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
       VALUES ($1, 'Etiquetas sintético', $2, $3, 'ACTIVE', 'tags@example.invalid')`,
      [tenantId, `tags-${tenantId.slice(0, 8)}`, schemaName],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `tags-${tenantId.slice(0, 8)}`,
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
    service = build();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await dataSource.destroy();
    }
  });

  it('crea, lista por nombre con conteo, cambia y audita el catálogo', async () => {
    const zeta = await withTenant(() =>
      service.createTag({ name: '  Zeta sintética ', color: '#aabbcc' }, actorId),
    );
    const alfa = await withTenant(() =>
      service.createTag({ name: 'alfa sintética', color: '#112233' }, actorId),
    );
    expect(zeta).toMatchObject({ name: 'Zeta sintética', color: '#AABBCC', assignedCount: 0 });

    const subscriberId = await insertSubscriber();
    await withTenant(() => service.assign(subscriberId, zeta.id, actorId));
    const listed = await withTenant(() => service.listCatalog());
    expect(SubscriberTagListResponseSchema.parse({ data: listed }).data).toEqual(listed);
    const names = listed.map((tag) => tag.name);
    expect(names.indexOf('alfa sintética')).toBeLessThan(names.indexOf('Zeta sintética'));
    expect(listed.find((tag) => tag.id === zeta.id)?.assignedCount).toBe(1);

    const renamed = await withTenant(() =>
      service.updateTag(alfa.id, { color: '#ffffff' }, actorId),
    );
    expect(renamed).toMatchObject({ name: 'alfa sintética', color: '#FFFFFF' });
    expect((await audits(alfa.id)).map((row) => row.action)).toEqual(['CREATE', 'UPDATE']);
  });

  it('rechaza el nombre repetido sin distinguir mayúsculas y lo libera tras la baja', async () => {
    const tag = await withTenant(() =>
      service.createTag({ name: 'Moroso sintético', color: '#FF0000' }, actorId),
    );
    expect(
      await codeOf(
        withTenant(() =>
          service.createTag({ name: 'MOROSO SINTÉTICO', color: '#00FF00' }, actorId),
        ),
      ),
    ).toMatchObject({ code: 'SUBSCRIBER_TAG_NAME_TAKEN' });
    const other = await withTenant(() =>
      service.createTag({ name: 'Otro sintético', color: '#00FF00' }, actorId),
    );
    expect(
      await codeOf(
        withTenant(() => service.updateTag(other.id, { name: 'moroso sintético' }, actorId)),
      ),
    ).toMatchObject({ code: 'SUBSCRIBER_TAG_NAME_TAKEN' });

    const subscriberId = await insertSubscriber();
    await withTenant(() => service.assign(subscriberId, tag.id, actorId));
    await withTenant(() => service.deleteTag(tag.id, actorId));
    expect(await assignmentCount(subscriberId)).toBe(0);
    expect((await withTenant(() => service.listCatalog())).map((row) => row.id)).not.toContain(
      tag.id,
    );
    await expect(
      withTenant(() => service.updateTag(tag.id, { color: '#000000' }, actorId)),
    ).rejects.toBeInstanceOf(NotFoundException);
    const reused = await withTenant(() =>
      service.createTag({ name: 'moroso sintético', color: '#123456' }, actorId),
    );
    expect(reused.id).not.toBe(tag.id);
    expect((await audits(tag.id)).map((row) => row.action)).toEqual(['CREATE', 'DELETE']);
  });

  it('asigna y quita de forma idempotente, auditando solo los cambios', async () => {
    const subscriberId = await insertSubscriber();
    const b = await withTenant(() =>
      service.createTag({ name: 'B asignación', color: '#0000FF' }, actorId),
    );
    const a = await withTenant(() =>
      service.createTag({ name: 'a asignación', color: '#00FF00' }, actorId),
    );
    await withTenant(() => service.assign(subscriberId, b.id, actorId));
    const chips = await withTenant(() => service.assign(subscriberId, a.id, actorId));
    await withTenant(() => service.assign(subscriberId, a.id, actorId));
    expect(SubscriberTagAssignmentResponseSchema.parse({ data: chips }).data).toEqual([
      { id: a.id, name: 'a asignación', color: '#00FF00' },
      { id: b.id, name: 'B asignación', color: '#0000FF' },
    ]);
    const after = await withTenant(() => service.unassign(subscriberId, a.id, actorId));
    await withTenant(() => service.unassign(subscriberId, a.id, actorId));
    expect(after.map((chip) => chip.id)).toEqual([b.id]);

    const rows = await audits(subscriberId);
    expect(rows.filter((row) => row.entity_type === 'SubscriberTagAssignment')).toHaveLength(3);
    const map = await withTenant(() => service.tagsFor([subscriberId, randomUUID()]));
    expect(map.get(subscriberId)?.map((chip) => chip.id)).toEqual([b.id]);
    expect(map.size).toBe(1);
  });

  it('revierte la asignación si la auditoría falla en la misma transacción', async () => {
    const subscriberId = await insertSubscriber();
    const tag = await withTenant(() =>
      service.createTag({ name: 'Auditoría falla', color: '#010203' }, actorId),
    );
    const failing = build({
      logWithin: jest.fn().mockRejectedValue(new Error('synthetic audit failure')),
    } as unknown as AuditService);
    await expect(withTenant(() => failing.assign(subscriberId, tag.id, actorId))).rejects.toThrow(
      'synthetic audit failure',
    );
    expect(await assignmentCount(subscriberId)).toBe(0);
  });

  it('rechaza asignar a titular bloqueado, anonimizado, inexistente o con etiqueta de baja', async () => {
    const tag = await withTenant(() =>
      service.createTag({ name: 'Rechazos', color: '#0A0B0C' }, actorId),
    );
    const partyId = randomUUID();
    const blocked = await insertSubscriber({ partyId });
    marks[partyId] = ['DATOS_BLOQUEADOS'];
    expect(await codeOf(withTenant(() => service.assign(blocked, tag.id, actorId)))).toMatchObject({
      code: 'PRIVACY_DATA_BLOCKED',
    });
    const anonymized = await insertSubscriber({ anonymized: true });
    expect(
      await codeOf(withTenant(() => service.assign(anonymized, tag.id, actorId))),
    ).toMatchObject({ code: 'PRIVACY_TITULAR_ANONYMIZED' });
    await expect(
      withTenant(() => service.assign(randomUUID(), tag.id, actorId)),
    ).rejects.toBeInstanceOf(NotFoundException);
    const live = await insertSubscriber();
    expect(
      await codeOf(withTenant(() => service.assign(live, randomUUID(), actorId))),
    ).toMatchObject({ code: 'SUBSCRIBER_TAG_NOT_FOUND' });
    expect(await assignmentCount(blocked)).toBe(0);
    expect(await assignmentCount(anonymized)).toBe(0);
  });

  it('puerto de importación: crea o reutiliza la etiqueta, asigna con lote y revierte el lote', async () => {
    const subscriberId = await insertSubscriber();
    const other = await insertSubscriber();
    const existing = await withTenant(() =>
      service.createTag({ name: 'VIP importación', color: '#C0FFEE' }, actorId),
    );
    await withTenant(() => service.assign(other, existing.id, actorId));
    const batchId = randomUUID();

    const results = await runInTenantSchema(dataSource, schemaName, async (qr) => {
      const input = { tenantId, importBatchId: batchId, actorId };
      return [
        await service.assignForImport(
          { ...input, subscriberId, tagName: ' vip IMPORTACIÓN ' },
          { manager: qr.manager },
        ),
        await service.assignForImport(
          { ...input, subscriberId, tagName: 'Nueva de origen' },
          { manager: qr.manager },
        ),
        await service.assignForImport(
          { ...input, subscriberId, tagName: 'Nueva de origen' },
          { manager: qr.manager },
        ),
        await service.assignForImport(
          { ...input, subscriberId: other, tagName: 'VIP importación' },
          { manager: qr.manager },
        ),
      ];
    });
    expect(results.map(({ tagCreated, assigned }) => ({ tagCreated, assigned }))).toEqual([
      { tagCreated: false, assigned: true },
      { tagCreated: true, assigned: true },
      { tagCreated: false, assigned: false },
      { tagCreated: false, assigned: false },
    ]);
    expect(results[0]?.tagId).toBe(existing.id);
    const catalog = await withTenant(() => service.listCatalog());
    expect(catalog.find((tag) => tag.name === 'Nueva de origen')?.color).toBe(
      IMPORTED_TAG_DEFAULT_COLOR,
    );

    const removed = await runInTenantSchema(dataSource, schemaName, (qr) =>
      service.removeImportBatch(tenantId, batchId, { manager: qr.manager }),
    );
    expect(removed).toEqual({ removed: 2 });
    expect(await assignmentCount(subscriberId)).toBe(0);
    // La asignación manual previa del otro titular no la trajo el lote: queda.
    expect(await assignmentCount(other)).toBe(1);
  });

  it('la supresión del titular borra sus asignaciones y deja el catálogo', async () => {
    const subscriberId = await insertSubscriber();
    const other = await insertSubscriber();
    const tag = await withTenant(() =>
      service.createTag({ name: 'Supresión', color: '#ABCDEF' }, actorId),
    );
    await withTenant(() => service.assign(subscriberId, tag.id, actorId));
    await withTenant(() => service.assign(other, tag.id, actorId));
    const participant = new CrmTitularErasureParticipant(new ConfigService({}));
    const scope = {
      partyId: null,
      subscriberIds: [subscriberId],
      expedienteIds: [],
      userIds: [],
      cryptoKeys: KEYS,
      requestId: randomUUID(),
    };
    const table = 'subscriber_tag_assignments';
    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      const plan = await participant.plan(scope, qr);
      expect(plan.find((result) => result.table === table)).toMatchObject({
        selected: 1,
        changed: 0,
        residual: 1,
      });
      await qr.query(`SELECT set_config('iwana.titular_erasure', 'on', true)`);
      const applied = await participant.apply(scope, qr, 'apply');
      expect(applied.find((result) => result.table === table)).toMatchObject({
        selected: 1,
        changed: 1,
        residual: 0,
      });
      const replan = await participant.plan(scope, qr);
      expect(replan.find((result) => result.table === table)).toMatchObject({
        selected: 0,
        residual: 0,
      });
    });
    expect(await assignmentCount(subscriberId)).toBe(0);
    expect(await assignmentCount(other)).toBe(1);
    const catalog = await withTenant(() => service.listCatalog());
    expect(catalog.find((row) => row.id === tag.id)?.assignedCount).toBe(1);
  });
});
