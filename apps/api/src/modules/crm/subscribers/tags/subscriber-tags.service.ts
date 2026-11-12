import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  AuditAction,
  SUBSCRIBER_TAG_CATALOG_MAX,
  SUBSCRIBER_TAG_COLOR_PATTERN,
  SUBSCRIBER_TAG_NAME_MAX_LENGTH,
  type CreateSubscriberTag,
  type SubscriberTag,
  type SubscriberTagChip,
  type UpdateSubscriberTag,
} from '@iwana/shared';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { AuditService } from '../../../audit/audit.service';
import { IPrivacyMarksReadPort } from '../../../privacy/ports/privacy-marks-read.port';
import { titularAnonymizedConflict } from '../guards/titular-anonymized-conflict';
import {
  SubscriberTagAssignmentPort,
  type ImportTagAssignmentInput,
  type ImportTagAssignmentResult,
} from '../../ports/subscriber-tag-assignment.port';

/** Color de una etiqueta que crea la importación sin color de origen (gris neutro). */
export const IMPORTED_TAG_DEFAULT_COLOR = '#64748B';

interface TagRow {
  id: string;
  name: string;
  color: string;
  assigned_count?: number | string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ChipRow {
  subscriber_id: string;
  id: string;
  name: string;
  color: string;
}

interface SubscriberRow {
  id: string;
  party_id: string | null;
  anonymized_at: Date | string | null;
}

/**
 * Etiquetas manuales del suscriptor (ADR-110 D8). Catálogo por tenant y asignación.
 * El nombre y el color son catálogo del ISP, no datos del titular; la supresión del
 * titular borra sus asignaciones (CrmTitularErasureParticipant).
 */
@Injectable()
export class SubscriberTagsService extends SubscriberTagAssignmentPort {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    @Inject(IPrivacyMarksReadPort) private readonly privacyMarksReadPort: IPrivacyMarksReadPort,
  ) {
    super();
  }

  async listCatalog(): Promise<SubscriberTag[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT t.id, t.name, t.color, t.created_at, t.updated_at,
                (SELECT COUNT(*)::int FROM subscriber_tag_assignments a
                  WHERE a.tag_id = t.id AND a.tenant_id = t.tenant_id) AS assigned_count
           FROM subscriber_tags t
          WHERE t.tenant_id = $1 AND t.deleted_at IS NULL
          ORDER BY lower(t.name), t.id`,
        [tenantId],
      )) as TagRow[];
      return rows.map(toTag);
    });
  }

  async createTag(dto: CreateSubscriberTag, actorId: string): Promise<SubscriberTag> {
    const { name, color } = normalizeTagInput(dto);
    if (name === undefined || color === undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Indique el nombre y el color.',
      });
    }
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Serializa las altas del tenant para que el tope no se rebase en carrera.
      await qr.query(`SELECT pg_advisory_xact_lock(hashtext('subscriber_tags:' || $1))`, [
        tenantId,
      ]);
      const countRows = (await qr.query(
        `SELECT COUNT(*)::int AS total FROM subscriber_tags
          WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tenantId],
      )) as Array<{ total: number }>;
      if ((countRows[0]?.total ?? 0) >= SUBSCRIBER_TAG_CATALOG_MAX) {
        throw new ConflictException({
          code: 'SUBSCRIBER_TAG_CATALOG_FULL',
          message: `El catálogo admite máximo ${SUBSCRIBER_TAG_CATALOG_MAX} etiquetas.`,
        });
      }
      const rows = await this.withNameConflict(
        qr,
        `INSERT INTO subscriber_tags (tenant_id, name, color, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, color, created_at, updated_at`,
        [tenantId, name, color, actorId],
      );
      const tag = toTag({ ...(rows[0] as TagRow), assigned_count: 0 });
      await this.auditService.logWithin(
        {
          action: AuditAction.CREATE,
          entityType: 'SubscriberTag',
          entityId: tag.id,
          userId: actorId,
          newValue: { name: tag.name, color: tag.color },
        },
        qr.manager,
      );
      return tag;
    });
  }

  async updateTag(
    tagId: string,
    dto: UpdateSubscriberTag,
    actorId: string,
  ): Promise<SubscriberTag> {
    const { name, color } = normalizeTagInput(dto);
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const current = await this.findLiveTag(qr, tagId, tenantId, 'FOR UPDATE');
      const rows = await this.withNameConflict(
        qr,
        `UPDATE subscriber_tags
            SET name = COALESCE($3, name), color = COALESCE($4, color),
                updated_by = $5, updated_at = now()
          WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
          RETURNING id, name, color, created_at, updated_at,
                    (SELECT COUNT(*)::int FROM subscriber_tag_assignments a
                      WHERE a.tag_id = subscriber_tags.id) AS assigned_count`,
        [tagId, tenantId, name ?? null, color ?? null, actorId],
      );
      const tag = toTag(rows[0] as TagRow);
      await this.auditService.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'SubscriberTag',
          entityId: tag.id,
          userId: actorId,
          oldValue: { name: current.name, color: current.color },
          newValue: { name: tag.name, color: tag.color },
        },
        qr.manager,
      );
      return tag;
    });
  }

  /** Baja lógica: el nombre queda libre y las asignaciones se borran en la misma transacción. */
  async deleteTag(tagId: string, actorId: string): Promise<void> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const current = await this.findLiveTag(qr, tagId, tenantId, 'FOR UPDATE');
      const removed = (await qr.query(
        `DELETE FROM subscriber_tag_assignments WHERE tag_id = $1 AND tenant_id = $2
         RETURNING subscriber_id`,
        [tagId, tenantId],
      )) as unknown;
      await qr.query(
        `UPDATE subscriber_tags SET deleted_at = now(), updated_by = $3, updated_at = now()
          WHERE id = $1 AND tenant_id = $2`,
        [tagId, tenantId, actorId],
      );
      await this.auditService.logWithin(
        {
          action: AuditAction.DELETE,
          entityType: 'SubscriberTag',
          entityId: tagId,
          userId: actorId,
          oldValue: { name: current.name, color: current.color },
          newValue: { removedAssignments: rowCount(removed) },
        },
        qr.manager,
      );
    });
  }

  /**
   * Idempotente: asignar una etiqueta que el suscriptor ya tiene no cambia nada ni audita.
   * Como las notas, la guarda HTTP rechaza antes al titular bloqueado o anonimizado y
   * aquí se repite con la fila del suscriptor bloqueada en modo compartido.
   */
  async assign(subscriberId: string, tagId: string, actorId: string): Promise<SubscriberTagChip[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.assertSubscriberWritable(qr, subscriberId, tenantId);
      await this.findLiveTag(qr, tagId, tenantId, 'FOR SHARE');
      const inserted = (await qr.query(
        `INSERT INTO subscriber_tag_assignments (tenant_id, subscriber_id, tag_id, assigned_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (subscriber_id, tag_id) DO NOTHING
         RETURNING tag_id`,
        [tenantId, subscriberId, tagId, actorId],
      )) as unknown;
      if (rowCount(inserted) > 0) {
        await this.auditService.logWithin(
          {
            action: AuditAction.CREATE,
            entityType: 'SubscriberTagAssignment',
            entityId: subscriberId,
            userId: actorId,
            newValue: { subscriberId, tagId },
          },
          qr.manager,
        );
      }
      return (await this.chipsFor(qr, tenantId, [subscriberId])).get(subscriberId) ?? [];
    });
  }

  /** Idempotente: quitar una etiqueta que no está asignada no audita. */
  async unassign(
    subscriberId: string,
    tagId: string,
    actorId: string,
  ): Promise<SubscriberTagChip[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.assertSubscriberWritable(qr, subscriberId, tenantId);
      const deleted = (await qr.query(
        `DELETE FROM subscriber_tag_assignments
          WHERE subscriber_id = $1 AND tag_id = $2 AND tenant_id = $3
          RETURNING tag_id`,
        [subscriberId, tagId, tenantId],
      )) as unknown;
      if (rowCount(deleted) > 0) {
        await this.auditService.logWithin(
          {
            action: AuditAction.DELETE,
            entityType: 'SubscriberTagAssignment',
            entityId: subscriberId,
            userId: actorId,
            oldValue: { subscriberId, tagId },
          },
          qr.manager,
        );
      }
      return (await this.chipsFor(qr, tenantId, [subscriberId])).get(subscriberId) ?? [];
    });
  }

  /** Etiquetas vigentes por suscriptor para enriquecer lista, detalle y ficha. */
  async tagsFor(subscriberIds: readonly string[]): Promise<Map<string, SubscriberTagChip[]>> {
    if (subscriberIds.length === 0) return new Map();
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, (qr) =>
      this.chipsFor(qr, tenantId, subscriberIds),
    );
  }

  async assignForImport(
    input: ImportTagAssignmentInput,
    options: { manager: EntityManager },
  ): Promise<ImportTagAssignmentResult> {
    if (input.tagId) {
      await this.findLiveTag(options.manager, input.tagId, input.tenantId, 'FOR SHARE');
      const linked = (await options.manager.query(
        `INSERT INTO subscriber_tag_assignments
           (tenant_id, subscriber_id, tag_id, assigned_by, import_batch_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (subscriber_id, tag_id) DO NOTHING
         RETURNING tag_id`,
        [input.tenantId, input.subscriberId, input.tagId, input.actorId, input.importBatchId],
      )) as unknown;
      return { tagId: input.tagId, tagCreated: false, assigned: rowCount(linked) > 0 };
    }
    const name = input.tagName.trim();
    if (name.length === 0 || name.length > SUBSCRIBER_TAG_NAME_MAX_LENGTH) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `El nombre de la etiqueta debe tener entre 1 y ${SUBSCRIBER_TAG_NAME_MAX_LENGTH} caracteres.`,
      });
    }
    const color = (input.color ?? IMPORTED_TAG_DEFAULT_COLOR).toUpperCase();
    if (!SUBSCRIBER_TAG_COLOR_PATTERN.test(color)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'El color debe tener el formato #RRGGBB.',
      });
    }
    const { manager } = options;
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext('subscriber_tags:' || $1))`, [
      input.tenantId,
    ]);
    const existing = (await manager.query(
      `SELECT id FROM subscriber_tags
        WHERE tenant_id = $1 AND deleted_at IS NULL AND lower(btrim(name)) = lower($2)`,
      [input.tenantId, name],
    )) as Array<{ id: string }>;
    let tagId = existing[0]?.id;
    let tagCreated = false;
    if (!tagId) {
      const created = (await manager.query(
        `INSERT INTO subscriber_tags (tenant_id, name, color, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [input.tenantId, name, color, input.actorId],
      )) as Array<{ id: string }>;
      tagId = created[0]?.id as string;
      tagCreated = true;
    }
    const inserted = (await manager.query(
      `INSERT INTO subscriber_tag_assignments
         (tenant_id, subscriber_id, tag_id, assigned_by, import_batch_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (subscriber_id, tag_id) DO NOTHING
       RETURNING tag_id`,
      [input.tenantId, input.subscriberId, tagId, input.actorId, input.importBatchId],
    )) as unknown;
    return { tagId, tagCreated, assigned: rowCount(inserted) > 0 };
  }

  async removeImportBatch(
    tenantId: string,
    importBatchId: string,
    options: { manager: EntityManager },
  ): Promise<{ removed: number }> {
    const deleted = (await options.manager.query(
      `DELETE FROM subscriber_tag_assignments
        WHERE tenant_id = $1 AND import_batch_id = $2
        RETURNING tag_id`,
      [tenantId, importBatchId],
    )) as unknown;
    return { removed: rowCount(deleted) };
  }

  private async chipsFor(
    qr: QueryRunner,
    tenantId: string,
    subscriberIds: readonly string[],
  ): Promise<Map<string, SubscriberTagChip[]>> {
    const rows = (await qr.query(
      `SELECT a.subscriber_id, t.id, t.name, t.color
         FROM subscriber_tag_assignments a
         JOIN subscriber_tags t ON t.id = a.tag_id AND t.deleted_at IS NULL
        WHERE a.tenant_id = $1 AND a.subscriber_id = ANY($2::uuid[])
        ORDER BY lower(t.name), t.id`,
      [tenantId, [...subscriberIds]],
    )) as ChipRow[];
    const result = new Map<string, SubscriberTagChip[]>();
    for (const row of rows) {
      const chips = result.get(row.subscriber_id) ?? [];
      chips.push({ id: row.id, name: row.name, color: row.color.toUpperCase() });
      result.set(row.subscriber_id, chips);
    }
    return result;
  }

  private async findLiveTag(
    qr: Pick<QueryRunner | EntityManager, 'query'>,
    tagId: string,
    tenantId: string,
    lock: 'FOR UPDATE' | 'FOR SHARE',
  ): Promise<TagRow> {
    const rows = (await qr.query(
      `SELECT id, name, color, created_at, updated_at FROM subscriber_tags
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL ${lock}`,
      [tagId, tenantId],
    )) as TagRow[];
    const tag = rows[0];
    if (!tag) {
      throw new NotFoundException({
        code: 'SUBSCRIBER_TAG_NOT_FOUND',
        message: 'La etiqueta no existe.',
      });
    }
    return tag;
  }

  private async assertSubscriberWritable(
    qr: QueryRunner,
    subscriberId: string,
    tenantId: string,
  ): Promise<void> {
    const rows = (await qr.query(
      `SELECT id, party_id, anonymized_at FROM subscribers
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL FOR SHARE`,
      [subscriberId, tenantId],
    )) as SubscriberRow[];
    const subscriber = rows[0];
    if (!subscriber) throw new NotFoundException('Suscriptor no encontrado.');
    if (subscriber.anonymized_at != null) throw titularAnonymizedConflict();
    if (!subscriber.party_id) return;
    if (!this.privacyMarksReadPort) {
      throw new ServiceUnavailableException({
        code: 'PRIVACY_MARKS_UNAVAILABLE',
        message: 'No se pudo verificar el estado de privacidad del titular.',
      });
    }
    const marks = await this.privacyMarksReadPort.activeMarks([subscriber.party_id], {
      manager: qr.manager,
    });
    if ((marks[subscriber.party_id] ?? []).includes('DATOS_BLOQUEADOS')) {
      throw new ConflictException({
        code: 'PRIVACY_DATA_BLOCKED',
        message: 'Los datos de este titular están bloqueados para edición.',
      });
    }
  }

  /** 23505 sobre el índice de nombre vigente → 409 con código estable. */
  private async withNameConflict(
    qr: QueryRunner,
    sql: string,
    params: unknown[],
  ): Promise<TagRow[]> {
    await qr.query('SAVEPOINT subscriber_tag_name');
    try {
      const result = (await qr.query(sql, params)) as unknown[];
      await qr.query('RELEASE SAVEPOINT subscriber_tag_name');
      // UPDATE … RETURNING llega como [filas, conteo]; INSERT … RETURNING, como filas.
      return (
        result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number'
          ? result[0]
          : result
      ) as TagRow[];
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        await qr.query('ROLLBACK TO SAVEPOINT subscriber_tag_name');
        throw new ConflictException({
          code: 'SUBSCRIBER_TAG_NAME_TAKEN',
          message: 'Ya existe una etiqueta con ese nombre.',
        });
      }
      throw error;
    }
  }
}

function normalizeTagInput(dto: { name?: string | undefined; color?: string | undefined }): {
  name?: string;
  color?: string;
} {
  return {
    ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
    ...(dto.color !== undefined ? { color: dto.color.toUpperCase() } : {}),
  };
}

function toTag(row: TagRow): SubscriberTag {
  return {
    id: row.id,
    name: row.name,
    color: row.color.toUpperCase(),
    assignedCount: Number(row.assigned_count ?? 0),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/** `qr.query` de UPDATE/DELETE … RETURNING puede devolver filas o `[filas, conteo]`. */
function rowCount(result: unknown): number {
  if (!Array.isArray(result)) return 0;
  if (result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') {
    return result[1];
  }
  return result.length;
}

function toIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
