import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import {
  AuditAction,
  migrationMappingTargetError,
  type MigrationMapping,
  type MigrationMappingCreate,
  type MigrationMappingKind,
  type MigrationMappingUpdate,
} from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import { MIGRATION_MAPPING_AUDIT_ENTITY } from './migration.constants';
import type { MigrationTenantScope } from './migration-batches.service';

interface MappingRow {
  id: string;
  source_system: 'UISP';
  kind: MigrationMapping['kind'];
  external_value: string;
  external_label: string | null;
  action: MigrationMapping['action'];
  target_ref: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLUMNS = `id, source_system, kind, external_value, external_label, action, target_ref,
                 created_at, updated_at`;

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toMapping(row: MappingRow): MigrationMapping {
  return {
    id: row.id,
    sourceSystem: row.source_system,
    kind: row.kind,
    externalValue: row.external_value,
    externalLabel: row.external_label,
    action: row.action,
    targetRef: row.target_ref,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function assertTarget(
  kind: MigrationMappingKind,
  action: MigrationMapping['action'],
  targetRef: string | null | undefined,
): void {
  if (migrationMappingTargetError(kind, action, targetRef)) {
    throw new BadRequestException({
      code: 'MIGRATION_MAPPING_TARGET_INVALID',
      message:
        'La equivalencia exige un destino válido para su tipo; solo las etiquetas pueden descartarse o pasar a nota.',
    });
  }
}

/** TypeORM devuelve `[filas, afectadas]` en UPDATE/DELETE de Postgres y `filas` en INSERT/SELECT. */
function returningRows(result: unknown): MappingRow[] {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0] as MappingRow[];
  }
  return result as MappingRow[];
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: 'MIGRATION_MAPPING_NOT_FOUND',
    message: 'La equivalencia no existe.',
  });
}

/**
 * Equivalencias por tenant y tipo (ADR-110 D4). El destino se valida por formato; su
 * existencia en el catálogo (plan de MOD06, etiqueta de CRM) la revalida la promoción.
 */
@Injectable()
export class MigrationMappingsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async list(
    scope: MigrationTenantScope,
    kind?: MigrationMappingKind,
  ): Promise<MigrationMapping[]> {
    return runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT ${COLUMNS} FROM migration_mappings
          WHERE tenant_id = $1 AND source_system = 'UISP'
            AND ($2::varchar IS NULL OR kind = $2::varchar)
          ORDER BY kind, external_value`,
        [scope.tenantId, kind ?? null],
      )) as MappingRow[];
      return rows.map(toMapping);
    });
  }

  async create(
    scope: MigrationTenantScope,
    input: MigrationMappingCreate,
    actorId: string,
  ): Promise<MigrationMapping> {
    const targetRef = input.action === 'EQUIVALE' ? (input.targetRef ?? null) : null;
    assertTarget(input.kind, input.action, input.targetRef ?? null);
    try {
      return await runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
        const [row] = (await qr.query(
          `INSERT INTO migration_mappings
             (tenant_id, source_system, kind, external_value, external_label, action,
              target_ref, created_by)
           VALUES ($1, 'UISP', $2, $3, $4, $5, $6, $7)
           RETURNING ${COLUMNS}`,
          [
            scope.tenantId,
            input.kind,
            input.externalValue,
            input.externalLabel ?? null,
            input.action,
            targetRef,
            actorId,
          ],
        )) as MappingRow[];
        const mapping = toMapping(row!);
        await this.audit(qr.manager, scope, AuditAction.CREATE, mapping.id, actorId, null, mapping);
        return mapping;
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error as { code?: string }).code === '23505') {
        throw new ConflictException({
          code: 'MIGRATION_MAPPING_DUPLICATED',
          message: 'Ya existe una equivalencia para ese valor.',
        });
      }
      throw error;
    }
  }

  async update(
    scope: MigrationTenantScope,
    id: string,
    input: MigrationMappingUpdate,
    actorId: string,
  ): Promise<MigrationMapping> {
    return runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const [current] = (await qr.query(
        `SELECT ${COLUMNS} FROM migration_mappings WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, scope.tenantId],
      )) as MappingRow[];
      if (!current) throw notFound();
      assertTarget(current.kind, input.action, input.targetRef ?? null);
      const [row] = returningRows(
        await qr.query(
          `UPDATE migration_mappings
            SET action = $3, target_ref = $4,
                external_label = CASE WHEN $5::boolean THEN $6 ELSE external_label END,
                updated_by = $7, updated_at = now()
          WHERE id = $1 AND tenant_id = $2
          RETURNING ${COLUMNS}`,
          [
            id,
            scope.tenantId,
            input.action,
            input.action === 'EQUIVALE' ? (input.targetRef ?? null) : null,
            input.externalLabel !== undefined,
            input.externalLabel ?? null,
            actorId,
          ],
        ),
      ) as MappingRow[];
      const before = toMapping(current);
      const after = toMapping(row!);
      await this.audit(qr.manager, scope, AuditAction.UPDATE, id, actorId, before, after);
      return after;
    });
  }

  async remove(scope: MigrationTenantScope, id: string, actorId: string): Promise<void> {
    await runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const [row] = returningRows(
        await qr.query(
          `DELETE FROM migration_mappings WHERE id = $1 AND tenant_id = $2 RETURNING ${COLUMNS}`,
          [id, scope.tenantId],
        ),
      ) as MappingRow[];
      if (!row) throw notFound();
      await this.audit(qr.manager, scope, AuditAction.DELETE, id, actorId, toMapping(row), null);
    });
  }

  private audit(
    manager: Parameters<AuditService['logWithin']>[1],
    scope: MigrationTenantScope,
    action: AuditAction,
    entityId: string,
    actorId: string,
    oldValue: MigrationMapping | null,
    newValue: MigrationMapping | null,
  ): Promise<void> {
    const shape = (value: MigrationMapping | null) =>
      value
        ? {
            kind: value.kind,
            externalValue: value.externalValue,
            action: value.action,
            targetRef: value.targetRef,
          }
        : null;
    return this.auditService.logWithin(
      {
        action,
        entityType: MIGRATION_MAPPING_AUDIT_ENTITY,
        entityId,
        userId: actorId,
        tenantId: scope.tenantId,
        schemaName: scope.schemaName,
        oldValue: shape(oldValue),
        newValue: shape(newValue),
      },
      manager,
    );
  }
}
